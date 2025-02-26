<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import '../app.css';
	
	// Import services and stores
	import { debugService } from '$lib/services/DebugService.js';
	import { initializeCardState } from '$lib/stores/card.js';
	import { initializeHistoryState } from '$lib/stores/history.js';
	import { initializePaymentState } from '$lib/stores/payments.js';
	import { initializePreferencesState } from '$lib/stores/preferences.js';
	
	// Debug panel (only visible in development)
	import DebugPanel from '$lib/components/DebugPanel.svelte';
  
	let { children } = $props<{ 
	  children: () => any 
	}>();
	
	// Application state
	let isInitialized = $state(false);
	let stores = $state<{
	  history: ReturnType<typeof initializeHistoryState>;
	  payment: ReturnType<typeof initializePaymentState>;
	  preferences: ReturnType<typeof initializePreferencesState>;
	  card: ReturnType<typeof initializeCardState>;
	} | null>(null);
	let initError = $state<string | null>(null);
	let initTimeout: number | undefined;
	
	/**
	 * Initialize all stores
	 * This function creates singleton instances of all stores
	 */
	async function initStores() {
	  try {
		debugService.info('Initializing stores...');
		
		// Create stores only once
		const history = initializeHistoryState();
		const payment = initializePaymentState();
		const preferences = initializePreferencesState();
		const card = initializeCardState();
		
		debugService.info('Stores initialized successfully');
		
		// Make stores available via context
		setContext('app:stores', { history, payment, preferences, card });
		
		return { history, payment, preferences, card };
	  } catch (error) {
		debugService.error(`Store initialization failed: ${error}`);
		throw error;
	  }
	}
	
	/**
	 * Complete application initialization
	 * Uses a safety timeout to avoid hanging indefinitely
	 */
	async function init() {
	  // Set safety timeout
	  if (initTimeout) {
	    clearTimeout(initTimeout);
	  }
	  
	  initTimeout = window.setTimeout(() => {
	    debugService.warn('Initialization timeout reached, forcing initialization');
	    if (!isInitialized) {
	      isInitialized = true;
	      initError = 'Initialization timed out';
	    }
	  }, 3000);
  
	  try {
		if (!stores) {
		  stores = await initStores();
		}
		isInitialized = true;
		debugService.info('Application initialized successfully');
	  } catch (error) {
		debugService.error(`Initialization failed: ${error}`);
		initError = error instanceof Error ? error.message : 'Unknown initialization error';
		isInitialized = true; // Mark as initialized despite error to avoid blocking
	  } finally {
	    if (initTimeout) {
	      clearTimeout(initTimeout);
	      initTimeout = undefined;
	    }
	  }
	}
	
	// Clean up on destroy
	onDestroy(() => {
	  if (initTimeout) {
	    clearTimeout(initTimeout);
	  }
	  debugService.info('Layout component destroyed');
	});
	
	// Initialize on mount - ONLY ONCE
	onMount(() => {
	  debugService.info('Layout component mounted');
	  void init();
	  
	  return () => {
	    // Additional cleanup if needed
	  };
	});
</script>

{#if isInitialized}
	<!-- Render main content -->
	{@render children()}
	
	<!-- Debug panel (only visible in development) -->
	<DebugPanel />
	
	<!-- Show any initialization errors -->
	{#if initError}
	  <div class="fixed bottom-4 left-4 right-4 bg-red-500 text-white p-4 rounded shadow-lg z-50">
	    <p class="font-bold">Initialization Error:</p>
	    <p>{initError}</p>
	  </div>
	{/if}
{:else}
	<!-- Loading screen -->
	<div class="fixed inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
	  <div class="flex flex-col items-center gap-4">
		<div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
		<p class="text-gray-600 dark:text-gray-300">Loading Tap3...</p>
	  </div>
	</div>
{/if}