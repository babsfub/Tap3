<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { initializeHistoryState } from '$lib/stores/history.js';
	import { initializePaymentState } from '$lib/stores/payments.js';
	import { initializePreferencesState } from '$lib/stores/preferences.js';
	import '../app.css';
  
	let { children } = $props();
	let isInitialized = $state(false);
	let stores = $state<ReturnType<typeof initStores> | null>(null);
  
	function initStores() {
	  const history = initializeHistoryState();
	  const payment = initializePaymentState();
	  const preferences = initializePreferencesState();
	  return { history, payment, preferences };
	}
  
	async function init() {
	  if (!browser) {
		isInitialized = true;
		return;
	  }
  
	  try {
		// Initialiser les stores une seule fois
		if (!stores) {
		  stores = initStores();
		}
		isInitialized = true;
	  } catch (error) {
		console.error('Initialization failed:', error);
		isInitialized = true;
	  }
	}
  
	onMount(() => {
	  void init();
	  
	  // Fallback en cas de problème d'initialisation
	  const timeout = setTimeout(() => {
		if (!isInitialized) {
		  console.warn('Forced initialization after timeout');
		  isInitialized = true;
		}
	  }, 5000);
  
	  return () => clearTimeout(timeout);
	});
  </script>
  
  {#if !isInitialized}
	<div class="fixed inset-0 flex items-center justify-center">
	  <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
	</div>
  {:else}
	{@render children()}
  {/if}