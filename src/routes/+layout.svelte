<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { initializeHistoryState } from '$lib/stores/history.js';
	import { initializePaymentState } from '$lib/stores/payments.js';
	import { initializePreferencesState } from '$lib/stores/preferences.js';
	import { initializeCardState } from '$lib/stores/card.js';
	import { cryptoService } from '$lib/services/crypto.js';
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
  
	  // Vérifier si nous avons un hash pour la carte
	  if (browser && window.location.hash) {
		const parsedCard = cryptoService.parseCardUrl(window.location.hash);
		if (parsedCard) {
		  // Pre-initialiser le cardState avec les données de base
		  card.setCard({
			pub: parsedCard.pub as Address ?? '',
			id: parsedCard.id,
			priv: parsedCard.priv,
		  });
		}
	  }
	  
	  return { history, payment, preferences, card };
	}
	
	async function init() {
	  try {
		if (!stores) {
		  stores = await initStores();
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
  
  {#if !isInitialized}
	<div class="fixed inset-0 flex items-center justify-center">
	  <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
	</div>
  {:else}
	{@render children()}
  {/if}