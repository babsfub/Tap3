// lib/stores/history.ts
import { setContext, getContext } from 'svelte';
import type { Address, Hash } from 'viem';
import type { TransactionRecord } from '../types.js';
import { walletService } from '../services/wallet.js';


interface TransactionHistory {
  [address: string]: TransactionRecord[];
}

interface Transaction {
  id: number;
  hash: Hash;
  from: Address;
  to: Address;
  value: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  confirmedAt?: number;
}

export function createHistoryState(initialState: TransactionHistory = {}) {
  let state = <TransactionHistory>(initialState);

  // Dérivations
  let recentTransactions = (
    Object.values(state)
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)
  );

  // Effets
  (() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('transactionHistory', JSON.stringify(state));
      } catch (error) {
        console.error('Failed to persist transaction history:', error);
      }
    }
  });

  async function monitorTransaction(hash: Hash, fromAddress: Address) {
    let retries = 0;
    const maxRetries = 50;

    const checkStatus = async () => {
      try {
        const receipt = await walletService.getTransactionReceipt(hash);
        
        if (receipt) {
          const status = receipt.status ? 'confirmed' : 'failed';
          updateStatus(hash, status);
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('Failed to check transaction status:', error);
        return false;
      }
    };

    if (await checkStatus()) return;

    const interval = setInterval(async () => {
      retries++;
      
      if (await checkStatus() || retries >= maxRetries) {
        clearInterval(interval);
      }
    }, 12000);
  }

  function updateStatus(hash: Hash, newStatus: TransactionRecord['status']) {
    for (const address of Object.keys(state)) {
      const transactions = state[address];
      const index = transactions.findIndex(tx => tx.hash === hash);
        
      if (index !== -1) {
        transactions[index] = {
          ...transactions[index],
          status: newStatus,
          ...(newStatus === 'confirmed' ? { confirmedAt: Date.now() } : {})
        };
          
        state[address] = [...transactions];
        break;
      }
    }
  }

  return {
    // Accesseurs réactifs
    getHistory: () => state,
    getRecentTransactions: (limit = 10) => recentTransactions.slice(0, limit),
    getTransactionsByAddress: (address: Address) => {
      const addr = address.toLowerCase();
      return state[addr] || [];
    },
    
    // Actions
    addTransaction(record: TransactionRecord) {
      const address = record.from.toLowerCase();
      
      if (!state[address]) {
        state[address] = [];
      }

      const existingTx = state[address].find(tx => tx.hash === record.hash);
      if (!existingTx) {
        state[address] = [
          {
            ...record,
            timestamp: Date.now(),
            status: 'pending'
          },
          ...state[address]
        ];

        void monitorTransaction(record.hash, record.from as Address);
      }
    },

    updateTransactionStatus(hash: Hash, status: TransactionRecord['status']) {
      updateStatus(hash, status);
    },

    loadTransactions(address: Address, transactions: TransactionRecord[]) {
      const addr = address.toLowerCase();
      if (!state[addr]) {
        state[addr] = transactions.map(tx => ({
          ...tx,
          status: 'confirmed',
          timestamp: tx.timestamp || Date.now()
        }));
      }
    },

    clear() {
      state = $state({});
      if (typeof window !== 'undefined') {
        localStorage.removeItem('transactionHistory');
      }
    }
  };
}

// Clé pour le context
const HISTORY_STATE_KEY = Symbol('historyState');

// Initialisation et utilisation du context
export function initializeHistoryState(initialData?: TransactionHistory) {
  let savedHistory: TransactionHistory | undefined;
  
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('transactionHistory');
      if (saved) {
        savedHistory = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load saved transaction history:', error);
    }
  }

  const historyState = createHistoryState(savedHistory || initialData);
  setContext(HISTORY_STATE_KEY, historyState);
  return historyState;
}

export function useHistoryState() {
  const state = getContext<ReturnType<typeof createHistoryState>>(HISTORY_STATE_KEY);
  if (!state) {
    throw new Error('History state not initialized. Call initializeHistoryState first.');
  }
  return state;
}