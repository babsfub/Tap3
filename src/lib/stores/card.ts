// lib/stores/card.ts
import { setContext, getContext, type Snippet } from 'svelte';
import { formatUnits } from 'viem';
import type { CardInfo } from '$lib/types.js';
import { walletService } from '$lib/services/wallet.js';

interface CardState {
  currentCard: CardInfo | null;
  balance: bigint;
  isLocked: boolean;
}

function createCardState(initialState: Partial<CardState> = {}) {
  const state = {
    currentCard: null,
    balance: 0n,
    isLocked: true,
    ...initialState
  };

  // Accesseurs
  let formattedBalance = () => {
    return state.balance ? formatUnits(state.balance, 18) : '0';
  };

  // Actions et méthodes
  async function updateBalance() {
    if (!state.currentCard?.pub) return;

    try {
      const balance = await walletService.getBalance(state.currentCard.pub);
      state.balance = balance.value;
    } catch (error) {
      console.error('Failed to update balance:', error);
    }
  }

  function setCard(cardInfo: CardInfo) {
    state.currentCard = cardInfo;
    state.isLocked = true;
    void updateBalance();
  }

  function unlockCard() {
    if (state.currentCard) {
      state.isLocked = false;
    }
  }

  function lockCard() {
    state.isLocked = true;
  }

  function clearCard() {
    state.currentCard = null;
    state.balance = 0n;
    state.isLocked = true;
  }

  function formatAddress(address: string | undefined): string {
    if (!address) return '';
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Accesseurs
  function getState() {
    return state;
  }

  return {
    getState,
    getFormattedBalance: () => formattedBalance(),
    setCard,
    unlockCard,
    lockCard,
    clearCard,
    updateBalance,
    formatAddress,
  };
}

// Clé pour le context
const CARD_STATE_KEY = Symbol('cardState');

// Fonction d'initialisation
export function initializeCardState(initialData?: Partial<CardState>) {
  const cardState = createCardState(initialData);
  setContext(CARD_STATE_KEY, cardState);
  return cardState;
}

// Hook pour utiliser le store
export function useCardState() {
  const state = getContext<ReturnType<typeof createCardState>>(CARD_STATE_KEY);
  if (!state) {
    throw new Error('Card state not initialized. Call initializeCardState first.');
  }
  return state;
}