// lib/stores/card.ts
import { setContext, getContext } from 'svelte';
import { formatUnits } from 'viem';
import type { CardInfo } from '$lib/types.js';
import { walletService } from '$lib/services/wallet.js';

interface CardState {
  currentCard: CardInfo | null;
  balance: bigint;
  isLocked: boolean;
}

function createCardState(initialState: Partial<CardState> = {}) {
  // État initial
  let state = <CardState>({
    currentCard: null,
    balance: 0n,
    isLocked: true,
    ...initialState
  });

  // Dérivations
  let formattedBalance = (state.balance 
    ? formatUnits(state.balance, 18) 
    : '0'
  );

  // Effets
  (() => {
    if (state.currentCard?.pub) {
      void updateBalance();
    }
  });

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

  function getFormattedBalance() {
    return formattedBalance;
  }

  return {
    // Accesseurs
    getState,
    getFormattedBalance,

    // Actions
    setCard,
    unlockCard,
    lockCard,
    clearCard,
    updateBalance,
    formatAddress,
  };
}

// Clé pour le context
const CARD_STATE_KEY = 'cardState';

// Fonction d'initialisation
export function initializeCardState(initialData?: Partial<CardState>) {
  const cardState = createCardState(initialData);
  setContext(CARD_STATE_KEY, () => cardState);
  return cardState;
}

// Hook pour utiliser le store
export function useCardState() {
  const cardState = getContext<() => ReturnType<typeof createCardState>>(CARD_STATE_KEY);
  if (!cardState) {
    throw new Error('Card state not initialized. Call initializeCardState first.');
  }
  return cardState();
}

// Fonction pour la gestion du snapshot
export const snapshot = {
  capture: () => {
    const cardState = useCardState();
    return cardState.getState();
  },
  restore: (data: CardState) => {
    const cardState = createCardState(data);
    setContext(CARD_STATE_KEY, () => cardState);
  }
};