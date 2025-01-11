import { Core } from "@walletconnect/core"
import { WalletKit, type WalletKitTypes } from "@reown/walletkit"
import { 
  createPublicClient, 
  createWalletClient,
  http,
  formatUnits, 
  parseUnits,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Account,
  type TransactionReceipt
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import type { CardInfo, TransactionRequest } from '../types.js'
import { cryptoService } from './crypto.js'

interface EmitEventParams {
  chainId: string;
  event: {
    type: string;
    data: Record<string, unknown>;
  };
}

class WalletService {
  private walletkit: InstanceType<typeof WalletKit> | null = null
  private core: InstanceType<typeof Core> | null = null
  private publicClient: PublicClient
  private walletClient: WalletClient | null = null
  private currentCard: (CardInfo & { key?: string }) | null = null
  private account: Account | null = null
  private reader: NDEFReader | null = null;
  
  constructor() {
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http()
    })
  }

  async initialize() {
    try {
      this.core = new Core({
        projectId: import.meta.env.VITE_REOWN_ID
      })

      this.walletkit = await WalletKit.init({
        core: this.core,
        metadata: {
          name: "Tap3 Card",
          description: "Web3 Card Management",
          url: "https://tap3.me",
          icons: []
        }
      })

      this.setupEventListeners()
    } catch (error) {
      console.error("Failed to initialize WalletKit:", error)
      throw error
    }
  }

  async getGasPrice(): Promise<string> {
    const gasPrice = await this.publicClient.getGasPrice()
    return gasPrice.toString()
  }

  async sendTransaction(request: TransactionRequest): Promise<{hash: Hash}> {
    if (!this.walletClient || !this.account) {
      throw new Error("Wallet not initialized")
    }

    try {
      const hash = await this.walletClient.sendTransaction({
        account: this.account,
        to: request.to,
        value: parseUnits(request.value, 18),
        gas: request.gasLimit ? BigInt(request.gasLimit) : undefined,
        gasPrice: request.gasPrice ? BigInt(request.gasPrice) : undefined,
        data: request.data ? `0x${request.data.replace('0x', '')}` as `0x${string}` : undefined,
        chain: polygon
      })

      // Démarrer le suivi de manière non bloquante
      void this.watchTransaction(hash)

      return { hash }
    } catch (error) {
      console.error('Transaction failed:', error)
      throw error
    }
  }

  async getTransactionReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    return this.publicClient.getTransactionReceipt({ hash })
  }

  async estimateGas(request: TransactionRequest): Promise<bigint> {
    if (!this.account) {
      throw new Error("Account not initialized")
    }

    return this.publicClient.estimateGas({
      account: this.account.address,
      to: request.to,
      value: parseUnits(request.value, 18),
      data: request.data ? `0x${request.data.replace('0x', '')}` as `0x${string}` : undefined
    })
  }

  async getBalance(address: `0x${string}`) {
    const balance = await this.publicClient.getBalance({
      address
    })

    return {
      value: balance,
      formatted: formatUnits(balance, 18)
    }
  }

  async connectCard(cardInfo: CardInfo, password: string): Promise<boolean> {
    try {
      const decryptedKey = await cryptoService.decryptPrivateKey(
        cardInfo.priv,
        password
      )
      
      // S'assurer que walletkit est initialisé
      if (!this.walletkit) {
        await this.initialize();
      }

      // Récupérer les sessions actives
      const sessions = this.walletkit?.getActiveSessions() || {};

      this.account = privateKeyToAccount(decryptedKey as `0x${string}`);
      
      this.walletClient = createWalletClient({
        account: this.account,
        chain: polygon,
        transport: http()
      });

      this.currentCard = {
        ...cardInfo,
        key: decryptedKey
      };

      // Émettre l'événement seulement s'il y a des sessions actives
      if (this.walletkit && Object.keys(sessions).length > 0) {
        // Utiliser le topic de la première session active
        const sessionTopic = Object.keys(sessions)[0];
        await this.walletkit.emitSessionEvent({
          topic: sessionTopic,  // <- Correction ici
          event: {
            name: "accountsChanged",
            data: [this.account.address]
          },
          chainId: "eip155:137"
        });
      }

      return true;
    } catch (error) {
      console.error("Card connection failed:", error);
      return false;
    }
}

  async disconnect() {
    if (!this.walletkit || !this.currentCard) return

    try {
      const sessions = this.walletkit.getActiveSessions()
      for (const session of Object.values(sessions)) {
        await this.walletkit.disconnectSession({
          topic: session.topic,
          reason: { code: -32000, message: "USER_DISCONNECTED" }
        })
      }

      this.currentCard = null
      this.account = null
      this.walletClient = null
    } catch (error) {
      console.error("Disconnect failed:", error)
      throw error
    }
  }

  private async emitTransactionEvent({chainId, event}: EmitEventParams): Promise<void> {
    if (!this.walletkit) return

    try {
      const sessions = this.walletkit.getActiveSessions()
      if (Object.keys(sessions).length === 0) return

      await Promise.all(
        Object.values(sessions).map(async (session) => {
          try {
            await this.walletkit?.emitSessionEvent({
              topic: session.topic,
              chainId,
              event: {
                name: event.type,
                data: event.data
              }
            })
          } catch (error) {
            console.error(`Failed to emit event for session ${session.topic}:`, error)
          }
        })
      )
    } catch (error) {
      console.error("Failed to emit transaction event:", error)
    }
  }

  private async notifyTransactionUpdate(transactionData: {
    hash: Hash;
    status: 'pending' | 'confirmed' | 'failed';
    from: `0x${string}`;
    to: `0x${string}`;
    value?: bigint;
  }): Promise<void> {
    try {
      await this.emitTransactionEvent({
        chainId: `eip155:${polygon.id}`,
        event: {
          type: 'transaction_updated',
          data: {
            hash: transactionData.hash,
            status: transactionData.status,
            from: transactionData.from,
            to: transactionData.to,
            value: transactionData.value?.toString(),
            network: polygon.id
          }
        }
      })
    } catch (error) {
      console.error("Failed to notify transaction update:", error)
    }
  }

  private async watchTransaction(hash: Hash): Promise<TransactionReceipt | null> {
    const MAX_ATTEMPTS = 50 // ~10 minutes avec un intervalle de 12s
    let attempts = 0

    const checkReceipt = async (): Promise<TransactionReceipt | null> => {
      try {
        const receipt = await this.getTransactionReceipt(hash)
        if (receipt) {
          await this.notifyTransactionUpdate({
            hash,
            status: receipt.status ? 'confirmed' : 'failed',
            from: receipt.from,
            to: receipt.to ?? '0x0000000000000000000000000000000000000000',
          })
          return receipt
        }
        return null
      } catch (error) {
        console.error('Failed to check transaction receipt:', error)
        return null
      }
    }

    const immediateReceipt = await checkReceipt()
    if (immediateReceipt) return immediateReceipt

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++
        const receipt = await checkReceipt()
        
        if (receipt || attempts >= MAX_ATTEMPTS) {
          clearInterval(interval)
          resolve(receipt)
        }
      }, 12000)
    })
  }

  private async notifyBalanceChange(balance: bigint): Promise<void> {
    if (!this.currentCard?.pub) return

    try {
      await this.emitTransactionEvent({
        chainId: `eip155:${polygon.id}`,
        event: {
          type: 'balance_changed',
          data: {
            address: this.currentCard.pub,
            balance: balance.toString(),
            formatted: formatUnits(balance, 18)
          }
        }
      })
    } catch (error) {
      console.error("Failed to notify balance change:", error)
    }
  }

  private setupEventListeners() {
    if (!this.walletkit) return

    this.walletkit.on("session_proposal", async (proposal: WalletKitTypes.SessionProposal) => {
      if (!this.walletkit) return
      
      try {
        if (!this.currentCard?.pub) {
          throw new Error("No card connected")
        }

        const namespaces = {
          eip155: {
            chains: ["eip155:137"],
            methods: [
              "eth_sendTransaction",
              "eth_signTransaction",
              "eth_sign",
              "personal_sign"
            ],
            events: ["accountsChanged", "chainChanged"],
            accounts: [`eip155:137:${this.currentCard.pub}`]
          }
        }

        await this.walletkit.approveSession({
          id: proposal.id,
          namespaces
        })
      } catch (error) {
        console.error("Session proposal failed:", error)
        await this.walletkit.rejectSession({
          id: proposal.id,
          reason: { code: -32000, message: "USER_REJECTED" }
        })
      }
    })

    this.walletkit.on("session_request", async (event: WalletKitTypes.SessionRequest) => {
      if (!this.walletkit) return
      
      try {
        if (!this.account || !this.walletClient) {
          throw new Error("Card not unlocked")
        }

        const response = await this.handleSessionRequest(event)
        await this.walletkit.respondSessionRequest({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            result: response
          }
        })
      } catch (error) {
        console.error("Request handling failed:", error)
        await this.walletkit.respondSessionRequest({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : "Request failed"
            }
          }
        })
      }
    })
  }

  private async handleSessionRequest(event: WalletKitTypes.SessionRequest) {
    if (!this.walletClient || !this.account) {
      throw new Error("Wallet not initialized")
    }

    const { request } = event.params
    
    switch (request.method) {
      case "eth_sendTransaction": {
        const tx = request.params[0]
        const hash = await this.walletClient.sendTransaction({
          ...tx,
          account: this.account,
          chain: polygon
        })

        void this.watchTransaction(hash)
        return hash
      }

      case "personal_sign": {
        const [message, address] = request.params
        return await this.walletClient.signMessage({
          account: this.account,
          message
        })
      }

      default:
        throw new Error(`Unsupported method: ${request.method}`)
    }
  }
}

export const walletService = new WalletService()