// lib/services/transactions.ts avec corrections de typage
import { parseUnits, formatUnits, type Hash } from 'viem'
import type { TransactionRequest } from '../types.js'
import { walletService } from './wallet.js'
import { debugService } from './DebugService.js'

class TransactionService {
  private MAX_GAS_LIMIT = 30000n
  
  async sendTransaction(request: TransactionRequest): Promise<Hash> {
    // Début d'une nouvelle transaction - montrer des bordures claires dans les logs
    debugService.info(`📤 ========== DÉBUT DE TRANSACTION ==========`)
    debugService.info(`TransactionService: Préparation de la transaction vers ${request.to}`)
    
    try {
      // Validation des paramètres de base
      if (!request.to || !request.value) {
        debugService.error(`TransactionService: Paramètres de transaction invalides (to: ${request.to}, value: ${request.value})`)
        throw new Error('Paramètres de transaction invalides')
      }
      
      // Vérifier si le portefeuille est connecté
      if (!walletService.isConnected()) {
        debugService.info(`TransactionService: Portefeuille non connecté, tentative de connexion avec PIN...`)
        if (!request.pin) {
          debugService.error(`TransactionService: PIN requis pour connecter le portefeuille`)
          throw new Error('PIN requis pour cette transaction')
        }
      }
      
      // Préparation des paramètres de transaction
      debugService.info(`TransactionService: Configuration des paramètres de transaction`)
      
      // 1. Estimation de la limite de gaz si nécessaire
      if (!request.gasLimit) {
        try {
          debugService.debug(`TransactionService: Estimation du gaz pour la transaction...`)
          request.gasLimit = await this.estimateGas(request)
          debugService.info(`TransactionService: Gaz estimé: ${request.gasLimit}`)
        } catch (gasError) {
          debugService.warn(`TransactionService: Échec de l'estimation du gaz: ${gasError instanceof Error ? gasError.message : String(gasError)}`)
          // Utiliser une valeur par défaut sécurisée
          request.gasLimit = this.MAX_GAS_LIMIT.toString()
          debugService.info(`TransactionService: Utilisation de la limite de gaz par défaut: ${request.gasLimit}`)
        }
      } else {
        debugService.debug(`TransactionService: Utilisation de la limite de gaz fournie: ${request.gasLimit}`)
      }

      // 2. Obtention du prix du gaz si nécessaire
      if (!request.gasPrice) {
        try {
          debugService.debug(`TransactionService: Obtention du prix du gaz actuel...`)
          request.gasPrice = await walletService.getGasPrice()
          const gasPriceGwei = formatUnits(BigInt(request.gasPrice), 9)
          debugService.info(`TransactionService: Prix du gaz actuel: ${gasPriceGwei} Gwei`)
        } catch (priceError) {
          debugService.warn(`TransactionService: Échec de l'obtention du prix du gaz: ${priceError instanceof Error ? priceError.message : String(priceError)}`)
          throw new Error('Impossible de déterminer le prix du gaz')
        }
      }

      // 3. Vérification du solde
      try {
        const address = walletService.getAddress()
        if (!address) {
          debugService.error(`TransactionService: Impossible d'obtenir l'adresse du portefeuille`)
          throw new Error('Portefeuille non initialisé')
        }
        
        const balance = await walletService.getBalance(address)
        debugService.info(`TransactionService: Solde actuel: ${balance.formatted} MATIC`)
        
        // Calcul du coût total (montant + frais de gaz estimés)
        const gasLimit = BigInt(request.gasLimit)
        const gasPrice = BigInt(request.gasPrice)
        const gasCost = gasLimit * gasPrice
        const gasCostMatic = formatUnits(gasCost, 18)
        
        const txValue = parseUnits(request.value, 18)
        const totalCost = txValue + gasCost
        const totalCostMatic = formatUnits(totalCost, 18)
        
        // Logs détaillés pour le débogage
        debugService.info(`TransactionService: Analyse des coûts:
          - Montant de la transaction: ${request.value} MATIC
          - Coût de gaz estimé: ${gasCostMatic} MATIC (${gasLimit} * ${formatUnits(gasPrice, 9)} Gwei)
          - Coût total estimé: ${totalCostMatic} MATIC
          - Solde disponible: ${balance.formatted} MATIC
        `)
        
        // Vérifier si le solde est suffisant
        if (balance.value < totalCost) {
          const deficit = formatUnits(totalCost - balance.value, 18)
          debugService.error(`TransactionService: ❌ Solde insuffisant! Manque ${deficit} MATIC`)
          throw new Error(`Solde insuffisant pour cette transaction (${balance.formatted} MATIC disponible, ${totalCostMatic} MATIC requis)`)
        } else {
          debugService.info(`TransactionService: ✅ Solde suffisant pour la transaction`)
        }
      } catch (balanceError: unknown) {
        // Typage explicite de balanceError comme unknown
        if (balanceError instanceof Error && balanceError.message?.includes('Solde insuffisant')) {
          // Réutiliser le message d'erreur formaté
          throw balanceError;
        }
        
        const errorMessage = balanceError instanceof Error 
          ? balanceError.message 
          : 'Erreur inconnue lors de la vérification du solde';
          
        debugService.error(`TransactionService: Erreur lors de la vérification du solde: ${errorMessage}`);
        throw new Error('Impossible de vérifier le solde');
      }

      // 4. Exécution de la transaction
      debugService.info(`TransactionService: ⚡ Envoi de la transaction...`)
      const tx = await walletService.sendTransaction({
        to: request.to,
        value: request.value,
        gasPrice: request.gasPrice,
        gasLimit: request.gasLimit,
        data: request.data || '0x',
        pin: request.pin
      })

      debugService.info(`TransactionService: ✅ Transaction envoyée avec succès! Hash: ${tx.hash}`)
      debugService.info(`📤 ========== FIN DE TRANSACTION ==========`)
      
      return tx.hash
    } catch (error: unknown) {
      // Formatage amélioré des erreurs pour une meilleure lisibilité
      const errorMessage = error instanceof Error ? error.message : String(error)
      debugService.error(`TransactionService: ❌ Échec de la transaction: ${errorMessage}`)
      debugService.info(`📤 ========== ÉCHEC DE TRANSACTION ==========`)
      
      // Détection de types d'erreurs spécifiques pour messages plus clairs
      if (typeof errorMessage === 'string') {
        if (errorMessage.includes('insufficient funds') || errorMessage.includes('Solde insuffisant')) {
          throw new Error(`Solde insuffisant pour cette transaction (incluant les frais de gaz)`)
        } else if (errorMessage.includes('gas required exceeds')) {
          throw new Error(`Transaction trop complexe - essayez avec un montant inférieur`)
        } else if (errorMessage.includes('nonce')) {
          throw new Error(`Erreur de séquence - veuillez réessayer dans quelques instants`)
        } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
          throw new Error(`Transaction refusée`)
        } else if (errorMessage.includes('PIN') || errorMessage.includes('password') || errorMessage.includes('decrypt')) {
          throw new Error(`Erreur d'authentification - PIN incorrect`)
        }
      }
      
      throw new Error(`Échec de la transaction: ${errorMessage}`)
    }
  }

  async getTransactionStatus(hash: Hash): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
      debugService.debug(`TransactionService: Vérification du statut de la transaction ${hash}`)
      const receipt = await walletService.getTransactionReceipt(hash)
      
      if (!receipt) {
        debugService.debug(`TransactionService: Transaction ${hash} toujours en attente`)
        return 'pending'
      }

      const status = receipt.status ? 'confirmed' : 'failed'
      debugService.info(`TransactionService: Transaction ${hash} est maintenant ${status}`)
      return status
    } catch (error) {
      debugService.error(`TransactionService: Échec de la vérification du statut: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  async estimateGas(request: TransactionRequest): Promise<string> {
    try {
      debugService.debug(`TransactionService: Estimation du gaz pour transaction vers ${request.to}`)
      const estimated = await walletService.estimateGas({
        to: request.to,
        value: request.value,
        data: request.data || '0x'
      })

      // Ajouter une marge de 20% pour la sécurité
      const withBuffer = (estimated * 120n) / 100n
      debugService.debug(`TransactionService: Gaz estimé: ${estimated}, avec marge de sécurité: ${withBuffer}`)

      // S'assurer que nous ne dépassons pas la limite maximale
      if (withBuffer > this.MAX_GAS_LIMIT) {
        debugService.debug(`TransactionService: Gaz estimé dépasse la limite maximale, utilisation de ${this.MAX_GAS_LIMIT}`)
        return this.MAX_GAS_LIMIT.toString()
      }
      
      return withBuffer.toString()
    } catch (error) {
      debugService.error(`TransactionService: Échec de l'estimation du gaz: ${error instanceof Error ? error.message : String(error)}`)
      // En cas d'erreur, retourner une valeur sécurisée par défaut
      debugService.debug(`TransactionService: Utilisation de la limite de gaz par défaut ${this.MAX_GAS_LIMIT}`)
      return this.MAX_GAS_LIMIT.toString()
    }
  }
  
  // Méthode utilitaire pour calculer le coût en gaz d'une transaction
  calculateGasCost(gasLimit: string, gasPrice: string): string {
    try {
      const limitBigInt = BigInt(gasLimit)
      const priceBigInt = BigInt(gasPrice)
      const gasCost = limitBigInt * priceBigInt
      return formatUnits(gasCost, 18) // Convertir en MATIC
    } catch (error) {
      debugService.error(`TransactionService: Erreur de calcul du coût en gaz: ${error instanceof Error ? error.message : String(error)}`)
      return "0.001" // Valeur par défaut raisonnable en cas d'erreur
    }
  }
}

export const transactionService = new TransactionService()