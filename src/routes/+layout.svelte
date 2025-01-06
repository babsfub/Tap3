<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { walletService } from '$lib/services/wallet.js';
	import { initializeHistoryState } from '$lib/stores/history.js';
	import { initializePaymentState } from '$lib/stores/payments.js';
	import { initializePreferencesState } from '$lib/stores/preferences.js';
	import '../app.css';
  
	let { children } = $props();
	let isInitialized = $state(false);
  
	onMount(() => {
	  if (browser) {
		// Initialiser les services et les stores
		Promise.all([
		  walletService.initialize(),
		  initializeHistoryState(),
		  initializePaymentState(),
		  initializePreferencesState()
		]).then(() => {
		  isInitialized = true;
		});
	  }
	});
  </script>
  
  {#if browser && !isInitialized}
	<div class="flex items-center justify-center min-h-screen">
	  <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
	</div>
  {:else}
	{@render children()}
  {/if}