<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { initializeHistoryState } from '$lib/stores/history.js';
	import { initializePaymentState } from '$lib/stores/payments.js';
	import { initializePreferencesState } from '$lib/stores/preferences.js';
	import { initializeCardState } from '$lib/stores/card.js';
	import { cryptoService } from '$lib/services/crypto.js';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import type { Address } from 'viem';
	import type { lib } from 'crypto-js';
	import '../app.css';

	
	let { children } = $props();
	let isInitialized = $state(false);
	let stores = $state<{
	  history: ReturnType<typeof initializeHistoryState>;
	  payment: ReturnType<typeof initializePaymentState>;
	  preferences: ReturnType<typeof initializePreferencesState>;
	  card: ReturnType<typeof initializeCardState>;
	} | null>(null);
	
	async function initStores() {
	  
	  const history = initializeHistoryState();
	  const payment = initializePaymentState();
	  const preferences = initializePreferencesState();
	  const card = initializeCardState();
  
	  if (browser && window.location.hash) {
		const parsedCard = cryptoService.parseCardUrl(window.location.hash);
		if (parsedCard) {
		  card.setCard({
			pub: (parsedCard.pub && parsedCard.pub.startsWith('0x') ? parsedCard.pub : `0x${parsedCard.pub ?? ''}`) as Address ?? '',
			id: parsedCard.id ?? 0,
			priv: parsedCard.priv as lib.WordArray ?? '',
		  });
		}
	  }
	  
	  return { history, payment, preferences, card };
	}
	
	async function init() {
  // Timeout de sécurité
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.warn('Timeout reached, forcing initialization');
      resolve(null);
    }, 3000);
  });

  try {
    if (!stores) {
      // Utiliser Promise.race pour ne pas attendre indéfiniment
	  stores = await Promise.race([initStores(), timeoutPromise]) as {
		history: ReturnType<typeof initializeHistoryState>;
		payment: ReturnType<typeof initializePaymentState>;
		preferences: ReturnType<typeof initializePreferencesState>;
		card: ReturnType<typeof initializeCardState>;
	  } | null;
    }
    isInitialized = true;
  } catch (error) {
    console.error('Initialization failed:', error);
    isInitialized = true;
  }
}
	onMount(() => {
	  void init();
	});
  </script>
  
  {#if isInitialized}
  {@render children()}
  <DebugPanel />
{:else}
  <div class="fixed inset-0 flex items-center justify-center">
    <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
  </div>
{/if}