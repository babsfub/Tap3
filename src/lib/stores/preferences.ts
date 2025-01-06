// lib/stores/preferences.ts
import { setContext, getContext } from 'svelte';
import { browser } from '$app/environment';

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  showBalance: boolean;
  recentAddresses: string[];
  lastUsedAddress?: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  showBalance: true,
  recentAddresses: []
};

export function createPreferencesState(initialState: UserPreferences = DEFAULT_PREFERENCES) {
  // Charger les préférences depuis localStorage si disponible
  let loadedState = initialState;
  if (browser) {
    try {
      const stored = localStorage.getItem('userPreferences');
      if (stored) {
        loadedState = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }

  let state = (loadedState);

  // Sauvegarder automatiquement les changements dans localStorage
  (() => {
    if (browser) {
      localStorage.setItem('userPreferences', JSON.stringify(state));
    }
  });

  // Dérivation pour le thème effectif
  let effectiveTheme = (() => {
    if (state.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 
        'dark' : 'light';
    }
    return state.theme;
  });

  return {
    // Accesseurs réactifs
    getPreferences: () => state,
    getTheme: () => effectiveTheme,

    // Actions
    setTheme(theme: UserPreferences['theme']) {
      state.theme = theme;
    },

    toggleBalance() {
      state.showBalance = !state.showBalance;
    },

    addRecentAddress(address: string) {
      state.recentAddresses = [
        address,
        ...state.recentAddresses.filter(addr => addr !== address)
      ].slice(0, 5); // Garder uniquement les 5 plus récentes
      state.lastUsedAddress = address;
    },

    clearRecentAddresses() {
      state.recentAddresses = [];
      state.lastUsedAddress = undefined;
    },

    reset() {
      state = (DEFAULT_PREFERENCES);
    }
  };
}

// Clé pour le context
const PREFERENCES_STATE_KEY = 'preferencesState';

// Fonctions d'initialisation et d'utilisation du context
export function initializePreferencesState() {
  const preferencesState = createPreferencesState();
  setContext(PREFERENCES_STATE_KEY, () => preferencesState);
  return preferencesState;
}

export function usePreferencesState() {
  return getContext<() => ReturnType<typeof createPreferencesState>>(PREFERENCES_STATE_KEY)();
}

// Gestion des snapshots
export const snapshot = {
  capture: () => {
    const preferences = getContext<() => ReturnType<typeof createPreferencesState>>(PREFERENCES_STATE_KEY)();
    return preferences.getPreferences();
  },
  restore: (data: UserPreferences) => {
    const preferences = createPreferencesState(data);
    setContext(PREFERENCES_STATE_KEY, () => preferences);
  }
};