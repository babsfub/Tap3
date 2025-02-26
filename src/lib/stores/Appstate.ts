// lib/stores/AppState.ts - Utilisant correctement AddressUtils
import { getContext, setContext } from 'svelte';
import { initializeCardState, useCardState } from './card.js';
import { initializeHistoryState, useHistoryState } from './history.js';
import { initializePaymentState, usePaymentState } from './payments.js';
import { initializePreferencesState, usePreferencesState } from './preferences.js';
import { debugService } from '../services/DebugService.js';
import { browser } from '$app/environment';
import { cryptoService } from '../services/crypto.js';
import { AddressUtils } from '../utils/AddressUtils.js';
import type { lib } from 'crypto-js';

// Symbole unique pour le contexte
const APP_STATE_KEY = Symbol('app_state');

/**
 * Interface représentant l'état global de l'application
 */
export interface AppState {
  card: ReturnType<typeof initializeCardState>;
  history: ReturnType<typeof initializeHistoryState>;
  payment: ReturnType<typeof initializePaymentState>;
  preferences: ReturnType<typeof initializePreferencesState>;
  initialized: boolean;
}

/**
 * Initialise l'état global de l'application et configure les stores
 */
export async function initializeAppState(): Promise<AppState> {
  debugService.info('Initializing app state...');
  
  try {
    // Initialiser tous les stores
    const history = initializeHistoryState();
    const payment = initializePaymentState();
    const preferences = initializePreferencesState();
    const card = initializeCardState();
    
    // État initial
    const appState: AppState = {
      card,
      history,
      payment,
      preferences,
      initialized: true
    };
    
    // Enregistrer dans le contexte Svelte
    setContext(APP_STATE_KEY, appState);
    
    // Si on est dans le navigateur et qu'il y a un hash dans l'URL, analyser les données de la carte
    if (browser && window.location.hash) {
      try {
        await loadCardFromHash(window.location.hash, card);
      } catch (error) {
        debugService.error(`Failed to load card from hash, but continuing: ${error}`);
        // On continue malgré l'erreur pour éviter un blocage complet
      }
    }
    
    debugService.info('App state initialized successfully');
    return appState;
  } catch (error) {
    debugService.error(`Failed to initialize app state: ${error}`);
    
    // Même en cas d'erreur, créer un état minimal
    const minimalState: AppState = {
      card: initializeCardState(),
      history: initializeHistoryState(),
      payment: initializePaymentState(),
      preferences: initializePreferencesState(),
      initialized: false
    };
    
    setContext(APP_STATE_KEY, minimalState);
    return minimalState;
  }
}

/**
 * Récupère l'état global de l'application depuis le contexte
 */
export function useAppState(): AppState {
  const state = getContext<AppState | undefined>(APP_STATE_KEY);
  
  if (!state) {
    debugService.error('App state not initialized! Call initializeAppState() first.');
    throw new Error('App state not initialized');
  }
  
  return state;
}

/**
 * Charge les données d'une carte à partir d'un hash d'URL
 * Gère les anciennes et nouvelles cartes en utilisant AddressUtils
 */
async function loadCardFromHash(
  hash: string,
  cardState: ReturnType<typeof initializeCardState>
): Promise<void> {
  try {
    debugService.info('Loading card from hash...');
    
    const parsedCard = cryptoService.parseCardUrl(hash);
    if (!parsedCard || !parsedCard.id || !parsedCard.pub) {
      throw new Error('Invalid card data in URL');
    }
    
    // Utiliser AddressUtils pour déterminer le format d'adresse
    const isBase64 = parsedCard.pub.includes('=') || /[+/]/.test(parsedCard.pub);
    debugService.info(`Card data parsed: ID=${parsedCard.id}, Address format: ${isBase64 ? 'Base64' : 'Hex'}`);
    
    // Utiliser AddressUtils.normalizeAddress pour obtenir l'adresse formatée correctement
    // Cela gère automatiquement les deux formats (Base64 et Hex)
    const normalizedAddr = AddressUtils.normalizeAddress(parsedCard.pub);
    
    if (!normalizedAddr) {
      throw new Error(`Could not normalize address: ${parsedCard.pub.substring(0, 10)}...`);
    }
    
    // Mettre à jour l'état de la carte
    cardState.setCard({
      pub: normalizedAddr,
      id: parsedCard.id,
      priv: parsedCard.priv as lib.WordArray,
    });
    
    debugService.info(`Card loaded successfully: ID ${parsedCard.id}`);
  } catch (error) {
    debugService.error(`Failed to load card from hash: ${error}`);
    throw error;
  }
}

/**
 * Synchronise les stores entre eux
 */
export function syncStores(appState: AppState): void {
  // Exemple de synchronisation : quand une transaction est effectuée, mettre à jour l'historique
  const unsubscribePayment = appState.payment.getState();
  
  debugService.info('Stores synchronized');
}