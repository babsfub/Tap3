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
  
	async function init() {
	  try {
		await Promise.all([
		  initializeHistoryState(),
		  initializePaymentState(),
		  initializePreferencesState()
		]);
		isInitialized = true;
	  } catch (error) {
		console.error('Initialization failed:', error);
		// Même en cas d'erreur, on devrait continuer à afficher l'app
		isInitialized = true;
	  }
	}
  
	onMount(() => {
	  if (browser) {
		void init();
	  } else {
		// Si on est pas dans le browser, on initialise quand même
		isInitialized = true;
	  }
	});
  </script>
  
  <!-- Supprimons la condition browser car elle est gérée dans onMount -->
  {#if !isInitialized}
	<div class="fixed inset-0 flex items-center justify-center">
	  <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
	</div>
  {:else}
	{@render children()}
  {/if}