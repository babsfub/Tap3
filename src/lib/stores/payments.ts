// lib/stores/payment.ts
import { setContext, getContext } from 'svelte';
import type { Address, Hash } from 'viem';
import { transactionService } from '$lib/services/transactions.js';

export interface PaymentState {
  to?: Address;
  amount?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  hash?: Hash;
}

export function createPaymentState(initialState: PaymentState = {
  status: 'idle',
  error: null
}) {
  let state = (initialState);
  
  return {
    // Fonction pour accéder à l'état
    getState: () => state,
    
    // Actions
    async sendTransaction(to: Address, amount: string) {
      state.to = to;
      state.amount = amount;
      state.status = 'loading';
      state.error = null;
      state.hash = undefined;

      try {
        const hash = await transactionService.sendTransaction({
          to,
          value: amount
        });

        state.status = 'success';
        state.hash = hash;

        // Démarrer la surveillance
        this.watchTransactionStatus(hash);
        return hash;
      } catch (err) {
        state.status = 'error';
        state.error = err instanceof Error ? err.message : 'Payment failed';
        throw err;
      }
    },

    async watchTransactionStatus(hash: Hash) {
      const checkStatus = async () => {
        try {
          const status = await transactionService.getTransactionStatus(hash);
          if (status === 'confirmed' || status === 'failed') {
            state.status = status === 'confirmed' ? 'success' : 'error';
            state.error = status === 'failed' ? 'Transaction failed' : null;
            return true;
          }
          return false;
        } catch (error) {
          console.error('Failed to check transaction status:', error);
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
    }
  };
}

// Context key pour le payment state
const PAYMENT_STATE_KEY = 'paymentState';

// Fonctions helper pour utiliser le state via context
export function initializePaymentState() {
  const paymentState = createPaymentState();
  setContext(PAYMENT_STATE_KEY, () => paymentState);
  return paymentState;
}

export function usePaymentState() {
  return getContext<() => ReturnType<typeof createPaymentState>>(PAYMENT_STATE_KEY)();
}