// lib/stores/payment.ts
import { setContext, getContext } from 'svelte';
import type { Address, Hash } from 'viem';
import { formatUnits } from 'viem';
import { transactionService } from '$lib/services/transactions.js';
import { debugService } from '$lib/services/DebugService.js';
import { walletService } from '$lib/services/wallet.js';

export interface PaymentState {
  to?: Address;
  amount?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  hash?: Hash;
}

export function createPaymentState(initialState: PaymentState = { status: 'idle', error: null }) {
  let state = (initialState);
  
  return {
    getState: () => state,
    
    async sendTransaction(to: Address, amount: string, pin: string) {
      try {
        // Mettre à jour l'état avant la transaction
        state.to = to;
        state.amount = amount;
        state.status = 'loading';
        state.error = null;
        state.hash = undefined;

        debugService.info(`Preparing to send ${amount} MATIC to ${to}`);

        // Vérifier si le montant est valide
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          throw new Error('Invalid amount');
        }

        // Vérifier le solde avant l'envoi
        try {
          const address = walletService.getAddress();
          const balance = await walletService.getBalance(address);
          debugService.info(`Current balance: ${formatUnits(balance.value, 18)} MATIC`);
          
          // Vérifier si le solde est suffisant (avec marge pour les frais de gaz)
          const requiredWithGas = numAmount + 0.002; // Ajouter marge pour le gaz (~0.002 MATIC)
          if (parseFloat(formatUnits(balance.value, 18)) < requiredWithGas) {
            throw new Error(`Insufficient balance. You need at least ${requiredWithGas.toFixed(4)} MATIC (including gas fees)`);
          }
        } catch (balanceErr) {
          debugService.error(`Balance check failed: ${balanceErr}`);
          // Continuer malgré l'erreur - transactionService fera aussi cette vérification
        }

        // Envoyer la transaction
        debugService.info('Sending transaction...');
        const hash = await transactionService.sendTransaction({
          to,
          value: amount,
          pin 
        });

        // Mettre à jour l'état après succès
        debugService.info(`Transaction sent successfully! Hash: ${hash}`);
        state.status = 'success';
        state.hash = hash;
        
        // Surveiller la transaction
        this.watchTransactionStatus(hash);
        return hash;
      } catch (err) {
        // Gérer l'erreur
        const errorMessage = err instanceof Error ? err.message : 'Payment failed';
        debugService.error(`Transaction failed: ${errorMessage}`);
        
        state.status = 'error';
        state.error = errorMessage;
        throw err;
      }
    },

    async watchTransactionStatus(hash: Hash) {
      const checkStatus = async () => {
        try {
          debugService.debug(`Checking status of transaction ${hash}...`);
          const status = await transactionService.getTransactionStatus(hash);
          
          if (status === 'confirmed' || status === 'failed') {
            debugService.info(`Transaction ${hash} is now ${status}`);
            state.status = status === 'confirmed' ? 'success' : 'error';
            state.error = status === 'failed' ? 'Transaction failed on blockchain' : null;
            return true;
          }
          return false;
        } catch (error) {
          debugService.error(`Failed to check transaction status: ${error}`);
          return false;
        }
      };

      // Vérifier toutes les 5 secondes pendant maximum 10 minutes
      let attempts = 0;
      while (attempts < 120 && !await checkStatus()) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
    },

    reset() {
      state = ({
        status: 'idle',
        error: null
      });
      debugService.debug('Payment state reset');
    }
  };
}

// Context key pour le payment state
const PAYMENT_STATE_KEY = 'paymentState';

// Fonctions helper pour utiliser le state via context
export function initializePaymentState() {
  const paymentState = createPaymentState();
  setContext(PAYMENT_STATE_KEY, () => paymentState);
  debugService.info('Payment state initialized');
  return paymentState;
}

export function usePaymentState() {
  return getContext<() => ReturnType<typeof createPaymentState>>(PAYMENT_STATE_KEY)();
}