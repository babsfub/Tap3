// lib/stores/card.ts 
import { setContext, getContext } from 'svelte';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { CardInfo } from '$lib/types.js';
import { walletService } from '$lib/services/wallet.js';
import { debugService } from '$lib/services/DebugService.js';
import { browser } from '$app/environment';
// Use the cryptoService instead of direct CryptoJS
import { cryptoService } from '$lib/services/crypto.js';
import { AddressUtils } from '$lib/utils/AddressUtils.js';

interface CardState {
  currentCard: CardInfo | null;
  balance: bigint;
  isLocked: boolean;
  lastUpdated: number;
  error: string | null;
}

const STORAGE_KEY = 'tap3_card_state';

// Create a store with optional initial state
function createCardState(initialState: Partial<CardState> = {}) {
  // Default state
  const state: CardState = {
    currentCard: null,
    balance: 0n,
    isLocked: true,
    lastUpdated: 0,
    error: null,
    ...initialState
  };

  // Store for subscribers
  const subscribers = new Set<(state: CardState) => void>();

  // Restore from localStorage if available
  if (browser) {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        
        // Reconstruct with correct types
        if (parsed.currentCard) {
          try {
            // Use cryptoService for base64 operations
            state.currentCard = {
              ...parsed.currentCard,
              // Convert string to WordArray for priv if available
              priv: parsed.currentCard.priv ? 
                cryptoService.base64ToHex(parsed.currentCard.priv) : 
                parsed.currentCard.priv
            };
            
            // Use AddressUtils for address normalization
            if (state.currentCard && state.currentCard.pub) {
              state.currentCard.pub = AddressUtils.normalizeAddress(state.currentCard.pub) || 
                state.currentCard.pub as Address;
            }
          } catch (err) {
            debugService.warn(`Error processing card data, using partial data: ${err}`);
            // Set what we can from the parsed data
            state.currentCard = parsed.currentCard;
          }
        }
        
        // Convert balance to BigInt
        if (parsed.balance) {
          try {
            state.balance = BigInt(parsed.balance);
          } catch (err) {
            debugService.warn(`Error parsing balance: ${err}`);
            state.balance = 0n;
          }
        }
        
        state.isLocked = true; // Always locked on startup
        state.lastUpdated = parsed.lastUpdated || Date.now();
      }
    } catch (error) {
      debugService.error(`Failed to restore card state: ${error}`);
      // Continue with default state
    }
  }

  // Save to localStorage with proper error handling
  function saveToStorage() {
    if (browser && state.currentCard) {
      try {
        // Process card data for storage
        let privForStorage = null;
        
        if (state.currentCard.priv) {
          try {
            // Use cryptoService to convert WordArray to string
            privForStorage = cryptoService.sanitizeLogData(
              typeof state.currentCard.priv === 'string' ? 
                state.currentCard.priv : 
                cryptoService.hexToBase64(state.currentCard.priv.toString())
            );
          } catch (err) {
            debugService.warn(`Failed to process private key for storage: ${err}`);
            // Try to store what we have if it's a string
            if (typeof state.currentCard.priv === 'string') {
              privForStorage = state.currentCard.priv;
            }
          }
        }

        // Don't store decrypted private key
        const cardToSave = {
          ...state.currentCard,
          priv: privForStorage,
          key: undefined // Never store decrypted private key
        };
        
        const stateToSave = {
          ...state,
          currentCard: cardToSave,
          balance: state.balance.toString(), // BigInt to string
          isLocked: true // Always locked when saving
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        debugService.debug('Card state saved to localStorage');
      } catch (error) {
        debugService.error(`Failed to save card state: ${error}`);
        // Continue despite error - this is non-fatal
      }
    }
  }

  // Format balance helper
  function formattedBalance(): string {
    if (!state.balance) return '0';
    try {
      return formatUnits(state.balance, 18);
    } catch (error) {
      debugService.error(`Error formatting balance: ${error}`);
      return '0';
    }
  }

  // Update balance from blockchain
  async function updateBalance(): Promise<void> {
    if (!state.currentCard?.pub) return;

    try {
      debugService.info(`Updating balance for ${state.currentCard.pub}...`);
      const balance = await walletService.getBalance(state.currentCard.pub);
      
      const oldBalance = state.balance;
      if (balance.value !== oldBalance) {
        debugService.info(`Balance updated: ${formatUnits(balance.value, 18)} MATIC`);
        state.balance = balance.value;
        state.lastUpdated = Date.now();
        notifySubscribers();
        
        // Try to save but don't fail if it doesn't work
        try {
          saveToStorage();
        } catch (e) {
          // Log and continue
          debugService.warn(`Non-fatal error saving balance update: ${e}`);
        }
      }
    } catch (error) {
      debugService.error(`Failed to update balance: ${error}`);
      state.error = error instanceof Error ? error.message : 'Failed to update balance';
      notifySubscribers();
    }
  }

  // Set a new card
  function setCard(cardInfo: CardInfo): void {
    if (!cardInfo || !cardInfo.pub) {
      debugService.error('Attempted to set invalid card');
      return;
    }
    
    debugService.info(`Setting card ${cardInfo.id} (${cardInfo.pub.slice(0, 10)}...)`);
    
    // Normalize address using AddressUtils
    try {
      const normalizedAddr = AddressUtils.normalizeAddress(cardInfo.pub);
      if (normalizedAddr) {
        cardInfo.pub = normalizedAddr;
      }
    } catch (err) {
      debugService.warn(`Non-fatal error normalizing address: ${err}`);
      // Continue with the address as is
    }
    
    state.currentCard = cardInfo;
    state.isLocked = true;
    state.error = null;
    state.lastUpdated = Date.now();
    
    notifySubscribers();
    
    // Try to save but don't fail if it doesn't work
    try {
      saveToStorage();
    } catch (e) {
      // Log and continue
      debugService.warn(`Non-fatal error saving card: ${e}`);
    }
    
    // Fetch balance asynchronously
    void updateBalance();
  }

  // Unlock card (after PIN verification)
  function unlockCard(): void {
    if (state.currentCard) {
      debugService.info(`Unlocking card ${state.currentCard.id}`);
      state.isLocked = false;
      state.lastUpdated = Date.now();
      notifySubscribers();
      
      // Try to save but don't fail if it doesn't work
      try {
        saveToStorage();
      } catch (e) {
        // Log and continue
        debugService.warn(`Non-fatal error saving unlock state: ${e}`);
      }
    } else {
      debugService.warn('Attempted to unlock card but no card is set');
    }
  }

  // Lock card
  function lockCard(): void {
    debugService.info('Locking card');
    state.isLocked = true;
    
    // Remove decrypted private key if present
    if (state.currentCard?.key) {
      state.currentCard = {
        ...state.currentCard,
        key: undefined
      };
    }
    
    state.lastUpdated = Date.now();
    notifySubscribers();
    
    // Try to save but don't fail if it doesn't work
    try {
      saveToStorage();
    } catch (e) {
      // Log and continue
      debugService.warn(`Non-fatal error saving lock state: ${e}`);
    }
  }

  // Clear card data
  function clearCard(): void {
    debugService.info('Clearing card data');
    state.currentCard = null;
    state.balance = 0n;
    state.isLocked = true;
    state.error = null;
    state.lastUpdated = Date.now();
    
    notifySubscribers();
    
    if (browser) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Log and continue
        debugService.warn(`Non-fatal error clearing storage: ${e}`);
      }
    }
  }

  // Format address for display - use AddressUtils
  function formatAddress(address: string | undefined): string {
    if (!address) return '';
    return AddressUtils.formatAddress(address, true);
  }

  // Check if sufficient balance for transaction
  function hasSufficientBalance(amount: string): boolean {
    if (!state.balance) return false;
    
    try {
      const requestedAmount = parseFloat(amount);
      const currentBalance = parseFloat(formatUnits(state.balance, 18));
      
      // Allow margin for gas fees (0.001 MATIC)
      return currentBalance >= (requestedAmount + 0.001);
    } catch (error) {
      debugService.error(`Error checking balance: ${error}`);
      return false;
    }
  }

  // Calculate USD value from MATIC price
  function getUsdValue(maticPrice: number): string {
    if (!state.balance || !maticPrice) return '0.00';
    
    try {
      const matic = parseFloat(formatUnits(state.balance, 18));
      const usd = matic * maticPrice;
      return usd.toFixed(2);
    } catch (error) {
      debugService.error(`Error calculating USD value: ${error}`);
      return '0.00';
    }
  }

  // Notify all subscribers of state changes
  function notifySubscribers(): void {
    for (const subscriber of subscribers) {
      subscriber({ ...state });
    }
  }

  // Subscription management
  function subscribe(callback: (state: CardState) => void): () => void {
    subscribers.add(callback);
    
    // Call immediately with current state
    callback({ ...state });
    
    // Return unsubscribe function
    return () => {
      subscribers.delete(callback);
    };
  }

  // Test blockchain connection
  async function testConnection(): Promise<boolean> {
    try {
      await walletService.getGasPrice();
      return true;
    } catch (error) {
      debugService.error(`Blockchain connection error: ${error}`);
      return false;
    }
  }

  // Public API
  return {
    // State accessors
    getState: () => ({ ...state }),
    getFormattedBalance: () => formattedBalance(),
    subscribe,
    
    // Actions
    setCard,
    unlockCard,
    lockCard,
    clearCard,
    updateBalance,
    
    // Utilities
    formatAddress,
    hasSufficientBalance,
    getUsdValue,
    testConnection,
  };
}

// Svelte context key
const CARD_STATE_KEY = Symbol('cardState');

// Store initialization function
export function initializeCardState(initialData?: Partial<CardState>) {
  debugService.info('Initializing card state store');
  
  // Check if store already exists in context
  try {
    const existingStore = getContext<ReturnType<typeof createCardState>>(CARD_STATE_KEY);
    if (existingStore) {
      debugService.warn('Card state already initialized, reusing existing instance');
      return existingStore;
    }
  } catch (e) {
    // Context not available, continue with initialization
  }
  
  const cardState = createCardState(initialData);
  setContext(CARD_STATE_KEY, cardState);
  return cardState;
}

// Hook to use the store
export function useCardState() {
  try {
    const state = getContext<ReturnType<typeof createCardState>>(CARD_STATE_KEY);
    if (!state) {
      throw new Error('Card state not initialized');
    }
    return state;
  } catch (error) {
    debugService.error('Card state not initialized. Call initializeCardState first.');
    throw new Error('Card state not initialized. Call initializeCardState first.');
  }
}