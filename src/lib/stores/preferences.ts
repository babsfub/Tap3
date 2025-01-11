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

  let effectiveTheme = (() => {
    if (state.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 
        'dark' : 'light';
    }
    return state.theme;
  });

  return {
    getPreferences: () => state,
    getTheme: () => effectiveTheme,
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
      ].slice(0, 5); 
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

const PREFERENCES_STATE_KEY = 'preferencesState';

export function initializePreferencesState() {
  const preferencesState = createPreferencesState();
  setContext(PREFERENCES_STATE_KEY, () => preferencesState);
  return preferencesState;
}

export function usePreferencesState() {
  return getContext<() => ReturnType<typeof createPreferencesState>>(PREFERENCES_STATE_KEY)();
}

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