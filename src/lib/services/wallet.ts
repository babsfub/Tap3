// lib/services/wallet.ts
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
import { debugService } from './DebugService.js'

interface EmitEventParams {
  chainId: string;
  event: {
    name: string;
    data: any;
  };
}

class WalletService {
  private walletkit: InstanceType<typeof WalletKit> | null = null
  private core: InstanceType<typeof Core> | null = null
  private publicClient: PublicClient
  private walletClient: WalletClient | null = null
  private currentCard: (CardInfo & { key?: string }) | null = null
  private account: Account | null = null
  private isInitializing = false
  private initPromise: Promise<boolean> | null = null
  
  constructor() {
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http('https://polygon-rpc.com')  // Spécifier une URL RPC fiable
    })
    debugService.info('WalletService: Initialized with Polygon network');
  }

  /**
   * Initialise le service de wallet avec gestion robuste des erreurs
   */
  async initialize(): Promise<boolean> {
    // Éviter les initialisations multiples simultanées
    if (this.isInitializing) {
      debugService.debug('WalletService: Already initializing, returning existing promise');
      return this.initPromise as Promise<boolean>;
    }
    
    // Si déjà initialisé, retourner immédiatement
    if (this.walletkit) {
      debugService.debug('WalletService: Already initialized');
      return true;
    }
    
    this.isInitializing = true;
    this.initPromise = this._initialize();
    
    try {
      const result = await this.initPromise;
      return result;
    } finally {
      this.isInitializing = false;
    }
  }
  
  /**
   * Implémentation interne de l'initialisation avec gestion améliorée des erreurs
   */
  private async _initialize(): Promise<boolean> {
    try {
      debugService.info('WalletService: Starting initialization...');
      
      // Vérification des variables d'environnement
      const projectId = import.meta.env.VITE_REOWN_ID;
      if (!projectId) {
        throw new Error('VITE_REOWN_ID not defined in environment variables');
      }
      
      // Initialiser Core avec gestion des erreurs
      try {
        this.core = new Core({
          projectId: projectId
        });
        debugService.debug(`WalletService: Core initialized with project ID: ${projectId.substring(0,4)}...`);
      } catch (coreError) {
        debugService.error(`WalletService: Core initialization failed: ${coreError}`);
        throw new Error(`WalletConnect Core initialization failed: ${coreError}`);
      }

      // Initialiser WalletKit avec timeout
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('WalletKit initialization timed out')), 15000);
        });
        
        const kitPromise = WalletKit.init({
          core: this.core,
          metadata: {
            name: "Tap3 Card",
            description: "Web3 Card Management",
            url: "https://tap3.me",
            icons: []
          }
        });
        
        this.walletkit = await Promise.race([kitPromise, timeoutPromise]);
        
        if (!this.walletkit) {
          throw new Error('WalletKit initialization returned null or undefined');
        }
        
        debugService.info('WalletService: WalletKit initialized successfully');
      } catch (kitError) {
        debugService.error(`WalletService: WalletKit initialization failed: ${kitError}`);
        throw new Error(`WalletKit initialization failed: ${kitError}`);
      }

      // Configurer les écouteurs d'événements
      this.setupEventListeners();
      debugService.info('WalletService: Event listeners set up');
      
      return true;
    } catch (error) {
      debugService.error(`WalletService: Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      // Réinitialiser les variables pour permettre une nouvelle tentative
      this.core = null;
      this.walletkit = null;
      throw error;
    }
  }

  async getGasPrice(): Promise<string> {
    try {
      debugService.debug('WalletService: Fetching current gas price...');
      const gasPrice = await this.publicClient.getGasPrice()
      debugService.debug(`WalletService: Current gas price: ${formatUnits(gasPrice, 9)} Gwei`);
      return gasPrice.toString()
    } catch (error) {
      debugService.error(`WalletService: Failed to get gas price: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async sendTransaction(request: TransactionRequest): Promise<{hash: Hash}> {
    if (!this.walletClient || !this.account) {
      debugService.error("WalletService: Cannot send transaction - wallet not initialized");
      throw new Error("Wallet not initialized")
    }

    try {
      debugService.info(`WalletService: 💰 Starting transaction to ${request.to} for ${request.value} MATIC`);
      
      // Vérifier le solde pour être sûr
      const balance = await this.publicClient.getBalance({ address: this.account.address });
      const balanceInMatic = formatUnits(balance, 18);
      const valueInWei = parseUnits(request.value, 18);
      
      debugService.info(`WalletService: Balance check - Current: ${balanceInMatic} MATIC, Sending: ${request.value} MATIC`);
      
      // Vérification simple du solde (le gaz sera vérifié plus tard)
      if (balance < valueInWei) {
        debugService.error(`WalletService: ❌ Insufficient balance! Has: ${balanceInMatic} MATIC, Needs: ${request.value} MATIC`);
        throw new Error(`Insufficient balance for transaction (${balanceInMatic} < ${request.value})`);
      }
      
      // Préparer les options de transaction
      const txOptions: any = {
        account: this.account,
        to: request.to,
        value: parseUnits(request.value, 18),
        chain: polygon
      };
      
      // Ajouter les options optionnelles si elles sont fournies
      if (request.gasLimit) {
        txOptions.gas = BigInt(request.gasLimit);
        debugService.debug(`WalletService: Using custom gas limit: ${request.gasLimit}`);
      } else {
        // Estimer le gaz si non fourni
        try {
          const estimated = await this.estimateGas(request);
          txOptions.gas = estimated;
          debugService.debug(`WalletService: Estimated gas: ${estimated.toString()}`);
        } catch (gasError) {
          debugService.warn(`WalletService: Gas estimation failed: ${gasError instanceof Error ? gasError.message : String(gasError)}`);
          // Utiliser une valeur par défaut raisonnable
          txOptions.gas = 30000n;
          debugService.info(`WalletService: Using default gas limit: 30000`);
        }
      }
      
      if (request.gasPrice) {
        txOptions.gasPrice = BigInt(request.gasPrice);
        debugService.debug(`WalletService: Using custom gas price: ${request.gasPrice}`);
      }
      
      if (request.data) {
        txOptions.data = `0x${request.data.replace('0x', '')}` as `0x${string}`;
        debugService.debug(`WalletService: Transaction includes data payload`);
      }
      
      // Log des paramètres de transaction finaux
      debugService.info(`WalletService: 📝 Transaction details:
        - To: ${txOptions.to}
        - Value: ${formatUnits(txOptions.value, 18)} MATIC
        - Gas Limit: ${txOptions.gas?.toString() || 'default'}
        - Gas Price: ${txOptions.gasPrice ? formatUnits(txOptions.gasPrice, 9) + ' Gwei' : 'default'}`
      );
      
      // Envoyer la transaction
      debugService.info(`WalletService: 🚀 Sending transaction...`);
      const hash = await this.walletClient.sendTransaction(txOptions);
      debugService.info(`WalletService: ✅ Transaction sent! Hash: ${hash}`);

      // Démarrer le suivi de manière non bloquante
      void this.watchTransaction(hash);

      return { hash }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugService.error(`WalletService: ❌ Transaction failed: ${errorMsg}`);
      
      // Améliorer les messages d'erreur pour une meilleure expérience utilisateur
      if (errorMsg.includes('insufficient funds')) {
        throw new Error('Solde insuffisant pour cette transaction (incluant les frais de gaz)');
      } else if (errorMsg.includes('gas required exceeds')) {
        throw new Error('La transaction nécessite trop de gaz - essayez avec un montant plus petit');
      } else if (errorMsg.includes('nonce')) {
        throw new Error('Erreur de nonce - veuillez réessayer dans quelques instants');
      } else if (errorMsg.includes('user denied')) {
        throw new Error('Transaction refusée par l\'utilisateur');
      } else {
        throw new Error(`Échec de la transaction: ${errorMsg}`);
      }
    }
  }

  async getTransactionReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    try {
      debugService.debug(`WalletService: Checking receipt for transaction ${hash}`);
      const receipt = await this.publicClient.getTransactionReceipt({ hash });
      if (receipt) {
        debugService.debug(`WalletService: Receipt found - Status: ${receipt.status ? 'Success' : 'Failed'}`);
      } else {
        debugService.debug(`WalletService: No receipt found yet - transaction pending`);
      }
      return receipt;
    } catch (error) {
      debugService.error(`WalletService: Failed to get transaction receipt: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async estimateGas(request: TransactionRequest): Promise<bigint> {
    if (!this.account) {
      debugService.error("WalletService: Cannot estimate gas - account not initialized");
      throw new Error("Account not initialized");
    }

    try {
      debugService.debug(`WalletService: Estimating gas for transaction to ${request.to}`);
      const estimated = await this.publicClient.estimateGas({
        account: this.account.address,
        to: request.to,
        value: parseUnits(request.value, 18),
        data: request.data ? `0x${request.data.replace('0x', '')}` as `0x${string}` : undefined
      });
      
      // Ajouter une marge de sécurité de 20%
      const withBuffer = (estimated * 120n) / 100n;
      debugService.debug(`WalletService: Gas estimation: ${estimated} -> with 20% buffer: ${withBuffer}`);
      
      return withBuffer;
    } catch (error) {
      debugService.error(`WalletService: Gas estimation failed: ${error instanceof Error ? error.message : String(error)}`);
      // En cas d'échec, retourner une valeur par défaut raisonnable
      const defaultGas = 30000n;
      debugService.info(`WalletService: Using default gas value: ${defaultGas}`);
      return defaultGas;
    }
  }

  async getBalance(address: `0x${string}`) {
    try {
      debugService.debug(`WalletService: Fetching balance for ${address}`);
      const balance = await this.publicClient.getBalance({
        address
      });
      
      const formatted = formatUnits(balance, 18);
      debugService.debug(`WalletService: Balance: ${formatted} MATIC`);

      return {
        value: balance,
        formatted
      }
    } catch (error) {
      debugService.error(`WalletService: Failed to get balance: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Obtient l'adresse du compte actuellement connecté
   * Avec tentative de récupération en cas d'échec
   * @param options Options supplémentaires
   * @returns L'adresse du compte ou null si non disponible
   */
  getAddress(options: { showErrors?: boolean, throwIfNotConnected?: boolean } = {}): `0x${string}` | null {
    // Options par défaut
    const { 
      showErrors = true,
      throwIfNotConnected = false
    } = options;

    // Si nous avons déjà un compte avec une adresse, la retourner
    if (this.account) {
      return this.account.address;
    }
    
    // Log d'avertissement si demandé
    if (showErrors) {
      debugService.warn(`WalletService: Tentative d'obtenir l'adresse mais aucun compte n'est connecté`);
    }

    // Si nous avons un currentCard mais pas d'account, c'est probablement un problème de synchronisation
    if (this.currentCard && this.currentCard.key) {
      try {
        // Tentative de récupération: recréer le compte à partir de la clé privée stockée
        debugService.info(`WalletService: Tentative de récupération - recréation du compte à partir de la clé privée`);
        this.account = privateKeyToAccount(this.currentCard.key as `0x${string}`);
        
        // Recréer également le client wallet si nécessaire
        if (!this.walletClient && this.account) {
          this.walletClient = createWalletClient({
            account: this.account,
            chain: polygon,
            transport: http('https://polygon-rpc.com')
          });
        }
        
        if (this.account) {
          debugService.info(`WalletService: Récupération réussie, adresse: ${this.account.address}`);
          return this.account.address;
        }
      } catch (e) {
        if (showErrors) {
          debugService.error(`WalletService: Échec de la récupération du compte: ${e}`);
        }
      }
    }
    
    // Si la tentative de récupération a échoué et que nous voulons lancer une erreur
    if (throwIfNotConnected) {
      throw new Error('Aucun compte connecté - veuillez déverrouiller votre carte');
    }
    
    // En dernier recours, retourner null
    return null;
  }

  /**
   * Connecte une carte avec un mot de passe avec gestion améliorée des erreurs
   */
  async connectCard(cardInfo: CardInfo, password: string): Promise<boolean> {
    try {
      debugService.info(`WalletService: 🔑 Connecting card #${cardInfo.id}...`);
      
      // S'assurer que WalletKit est initialisé
      if (!this.walletkit) {
        debugService.debug('WalletService: WalletKit not initialized, initializing now...');
        const initialized = await this.initialize();
        if (!initialized) {
          debugService.error('WalletService: Failed to initialize WalletKit');
          return false;
        }
      }
      
      // Déchiffrer la clé privée
      let decryptedKey;
      try {
        debugService.debug(`WalletService: Decrypting private key...`);
        decryptedKey = await cryptoService.decryptPrivateKey(
          cardInfo.priv,
          password
        );
        debugService.debug(`WalletService: Private key decrypted successfully`);
        
        // Vérification du format de la clé déchiffrée
        if (!decryptedKey || 
            (typeof decryptedKey === 'string' && !decryptedKey.startsWith('0x')) ||
            (typeof decryptedKey === 'string' && decryptedKey.length !== 66)) {
          debugService.error(`WalletService: Invalid decrypted key format: ${typeof decryptedKey}`);
          return false;
        }
      } catch (decryptError) {
        debugService.error(`WalletService: ❌ Failed to decrypt private key: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
        throw new Error(`Échec de déchiffrement - PIN incorrect: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
      }
      
      // Créer un compte à partir de la clé privée
      try {
        debugService.debug(`WalletService: Creating account from private key...`);
        this.account = privateKeyToAccount(decryptedKey as `0x${string}`);
        debugService.info(`WalletService: Account created with address: ${this.account.address}`);
      } catch (accountError) {
        debugService.error(`WalletService: ❌ Failed to create account: ${accountError instanceof Error ? accountError.message : String(accountError)}`);
        throw new Error(`Échec de création du compte: ${accountError instanceof Error ? accountError.message : String(accountError)}`);
      }
      
      // Créer le client wallet
      try {
        debugService.debug(`WalletService: Creating wallet client...`);
        this.walletClient = createWalletClient({
          account: this.account,
          chain: polygon,
          transport: http('https://polygon-rpc.com')  // Spécifier une URL RPC fiable
        });
        debugService.debug(`WalletService: Wallet client created successfully`);
      } catch (clientError) {
        debugService.error(`WalletService: ❌ Failed to create wallet client: ${clientError instanceof Error ? clientError.message : String(clientError)}`);
        this.account = null;
        throw new Error(`Échec de création du client wallet: ${clientError instanceof Error ? clientError.message : String(clientError)}`);
      }

      // Enregistrer les informations de la carte
      this.currentCard = {
        ...cardInfo,
        key: decryptedKey
      };

      // Émettre l'événement de changement de compte si des sessions actives existent
      try {
        const sessions = this.walletkit?.getActiveSessions() || {};
        if (this.walletkit && Object.keys(sessions).length > 0) {
          // Utiliser le topic de la première session active
          const sessionTopic = Object.keys(sessions)[0];
          await this.walletkit.emitSessionEvent({
            topic: sessionTopic,
            event: {
              name: "accountsChanged",
              data: [this.account.address]
            },
            chainId: "eip155:137"
          });
          debugService.debug(`WalletService: Session event emitted`);
        }
      } catch (eventError) {
        debugService.warn(`WalletService: Failed to emit session event: ${eventError}`);
        // Non fatal, on continue
      }

      debugService.info(`WalletService: ✅ Card connected successfully!`);
      return true;
    } catch (error) {
      debugService.error(`WalletService: ❌ Card connection failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Vérifie si le wallet est correctement connecté et prêt pour les transactions
   * @returns true si le wallet est connecté, false sinon
   */
  isConnected(): boolean {
    // Vérification plus robuste que simplement vérifier account et walletClient
    const isAccountReady = !!this.account;
    const isWalletClientReady = !!this.walletClient;
    const isCardPresent = !!this.currentCard;
    const isPrivateKeyAvailable = !!(this.currentCard?.key);
    
    const isFullyConnected = isAccountReady && isWalletClientReady;
    
    // Si nous avons une incohérence, la signaler
    if (isCardPresent && isPrivateKeyAvailable && !isFullyConnected) {
      debugService.warn(`WalletService: État incohérent détecté - Carte présente avec clé, mais compte/client non initialisé`);
    }
    
    return isFullyConnected;
  }

  async disconnect() {
    if (!this.walletkit || !this.currentCard) {
      debugService.debug(`WalletService: Nothing to disconnect`);
      return;
    }

    try {
      debugService.info(`WalletService: Disconnecting wallet...`);
      const sessions = this.walletkit.getActiveSessions();
      for (const session of Object.values(sessions)) {
        await this.walletkit.disconnectSession({
          topic: session.topic,
          reason: { code: -32000, message: "USER_DISCONNECTED" }
        });
      }

      this.currentCard = null;
      this.account = null;
      this.walletClient = null;
      debugService.info(`WalletService: Wallet disconnected successfully`);
    } catch (error) {
      debugService.error(`WalletService: Disconnect failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async emitTransactionEvent({chainId, event}: EmitEventParams): Promise<void> {
    if (!this.walletkit) return;

    try {
      const sessions = this.walletkit.getActiveSessions();
      if (Object.keys(sessions).length === 0) return;

      await Promise.all(
        Object.values(sessions).map(async (session) => {
          try {
            await this.walletkit?.emitSessionEvent({
              topic: session.topic,
              chainId,
              event
            });
            debugService.debug(`WalletService: Event ${event.name} emitted for session ${session.topic}`);
          } catch (error) {
            debugService.error(`WalletService: Failed to emit event for session ${session.topic}: ${error}`);
          }
        })
      );
    } catch (error) {
      debugService.error(`WalletService: Failed to emit transaction event: ${error}`);
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
      debugService.debug(`WalletService: Notifying transaction update - Status: ${transactionData.status}, Hash: ${transactionData.hash}`);
      await this.emitTransactionEvent({
        chainId: `eip155:${polygon.id}`,
        event: {
          name: 'transaction_updated',
          data: {
            hash: transactionData.hash,
            status: transactionData.status,
            from: transactionData.from,
            to: transactionData.to,
            value: transactionData.value?.toString(),
            network: polygon.id
          }
        }
      });
    } catch (error) {
      debugService.error(`WalletService: Failed to notify transaction update: ${error}`);
    }
  }

  private async watchTransaction(hash: Hash): Promise<TransactionReceipt | null> {
    const MAX_ATTEMPTS = 50 // ~10 minutes avec un intervalle de 12s
    let attempts = 0;
    
    debugService.info(`WalletService: 👀 Starting to watch transaction ${hash}`);

    const checkReceipt = async (): Promise<TransactionReceipt | null> => {
      try {
        const receipt = await this.getTransactionReceipt(hash);
        if (receipt) {
          const statusText = receipt.status ? 'confirmed ✅' : 'failed ❌';
          debugService.info(`WalletService: Transaction ${hash} ${statusText}`);
          
          await this.notifyTransactionUpdate({
            hash,
            status: receipt.status ? 'confirmed' : 'failed',
            from: receipt.from,
            to: receipt.to ?? '0x0000000000000000000000000000000000000000',
          });
          return receipt;
        }
        debugService.debug(`WalletService: Transaction ${hash} still pending (check #${attempts+1})`);
        return null;
      } catch (error) {
        debugService.error(`WalletService: Failed to check transaction receipt: ${error}`);
        return null;
      }
    }

    const immediateReceipt = await checkReceipt();
    if (immediateReceipt) return immediateReceipt;
    
    debugService.info(`WalletService: Transaction ${hash} not immediately confirmed, will check periodically`);

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;
        const receipt = await checkReceipt();
        
        if (receipt || attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          if (attempts >= MAX_ATTEMPTS) {
            debugService.warn(`WalletService: Stopped watching transaction ${hash} after ${MAX_ATTEMPTS} attempts`);
          }
          resolve(receipt);
        }
      }, 12000);
    });
  }

  private setupEventListeners() {
    if (!this.walletkit) return;

    debugService.debug(`WalletService: Setting up WalletKit event listeners`);

    this.walletkit.on("session_proposal", async (proposal: WalletKitTypes.SessionProposal) => {
      if (!this.walletkit) return;
      
      try {
        // Correction: pas d'accès à proposal.proposer.metadata
        // Lire le nom depuis l'objet proposal sans présumer de sa structure exacte
        const proposerName = "Session request"; // Nom par défaut
        debugService.info(`WalletService: Received session proposal ${proposerName}`);
        
        if (!this.currentCard?.pub) {
          debugService.error(`WalletService: Cannot approve session - no card connected`);
          throw new Error("No card connected");
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

        debugService.info(`WalletService: Approving session...`);
        await this.walletkit.approveSession({
          id: proposal.id,
          namespaces
        });
        debugService.info(`WalletService: Session approved successfully`);
      } catch (error) {
        debugService.error(`WalletService: Session proposal failed: ${error}`);
        await this.walletkit.rejectSession({
          id: proposal.id,
          reason: { code: -32000, message: "USER_REJECTED" }
        });
      }
    });

    this.walletkit.on("session_request", async (event: WalletKitTypes.SessionRequest) => {
      if (!this.walletkit) return;
      
      try {
        debugService.info(`WalletService: Received session request: ${event.params.request.method}`);
        
        if (!this.account || !this.walletClient) {
          debugService.error(`WalletService: Card not unlocked`);
          throw new Error("Card not unlocked");
        }

        const response = await this.handleSessionRequest(event);
        debugService.info(`WalletService: Session request handled successfully`);
        
        await this.walletkit.respondSessionRequest({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            result: response
          }
        });
      } catch (error) {
        debugService.error(`WalletService: Request handling failed: ${error}`);
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
        });
      }
    });
    
    debugService.debug(`WalletService: Event listeners set up successfully`);
  }

  private async handleSessionRequest(event: WalletKitTypes.SessionRequest) {
    if (!this.walletClient || !this.account) {
      debugService.error(`WalletService: Cannot handle session request - wallet not initialized`);
      throw new Error("Wallet not initialized");
    }

    const { request } = event.params;
    debugService.info(`WalletService: Handling session request: ${request.method}`);
    
    switch (request.method) {
      case "eth_sendTransaction": {
        const tx = request.params[0];
        debugService.info(`WalletService: Processing eth_sendTransaction request`);
        
        const hash = await this.walletClient.sendTransaction({
          ...tx,
          account: this.account,
          chain: polygon
        });

        debugService.info(`WalletService: Transaction sent via session request, hash: ${hash}`);
        void this.watchTransaction(hash);
        return hash;
      }

      case "personal_sign": {
        const [message, address] = request.params;
        debugService.info(`WalletService: Processing personal_sign request`);
        
        const signature = await this.walletClient.signMessage({
          account: this.account,
          message
        });
        
        debugService.info(`WalletService: Message signed successfully`);
        return signature;
      }

      default:
        debugService.error(`WalletService: Unsupported method: ${request.method}`);
        throw new Error(`Unsupported method: ${request.method}`);
    }
  }
}

export const walletService = new WalletService()