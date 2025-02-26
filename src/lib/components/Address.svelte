<!-- lib/components/Address.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import type { Address } from 'viem';
  import { AddressUtils } from '$lib/utils/AddressUtils.js';
  import { debugService } from '$lib/services/DebugService.js';

  // Define props with defaults
  const { address = '', showFull = false, copyable = false, showPrefix = false, className = '' } = $props();

  // Component state
  let copied = $state(false);
  let copyTimeout: number | undefined;
  let error = $state<string | null>(null);

  // Format the address immediately rather than in a derived function
  // This ensures we have a string value, not a function reference
  let normalizedAddress: string | null = null;
  let formattedAddressValue = $state<string>('');

  // Normalize and format the address
  $effect(() => {
    try {
      normalizedAddress = AddressUtils.normalizeAddress(address);
      
      if (!normalizedAddress) {
        error = 'Invalid address format';
        formattedAddressValue = 'Invalid Address';
        return;
      }
      
      // Format based on showFull setting
      if (showFull) {
        formattedAddressValue = showPrefix ? normalizedAddress : normalizedAddress.slice(2);
      } else {
        formattedAddressValue = AddressUtils.formatAddress(normalizedAddress, true);
      }
    } catch (err) {
      error = 'Address formatting error';
      formattedAddressValue = 'Error';
      debugService.error(`Address component error: ${err}`);
    }
  });

  // Copy address to clipboard
  async function copyToClipboard(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!browser || !copyable || !normalizedAddress) return;
    
    try {
      await navigator.clipboard.writeText(normalizedAddress);
      debugService.debug(`Address copied to clipboard: ${normalizedAddress}`);
      
      // Show copy feedback
      copied = true;
      
      // Reset after delay
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }
      
      copyTimeout = window.setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      debugService.error(`Failed to copy address: ${err}`);
      error = 'Failed to copy address';
      
      // Reset error after delay
      setTimeout(() => {
        error = null;
      }, 3000);
    }
  }

  // Cleanup on destroy
  onDestroy(() => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
  });
</script>

<button 
  type="button"
  class={`address ${copyable ? 'cursor-pointer' : ''} ${className}`}
  class:copied
  onclick={copyable ? copyToClipboard : undefined}
  onkeydown={copyable ? (e) => e.key === 'Enter' && copyToClipboard(e) : undefined}
  title={copyable ? 'Click to copy' : undefined}
  aria-label={copyable ? 'Copy address' : undefined}
>
  {formattedAddressValue}
  
  {#if copyable}
    <span class="icon ml-1">
      {#if copied}
        <span class="text-green-500">✓</span>
      {:else}
        <span class="text-gray-400">📋</span>
      {/if}
    </span>
  {/if}
</button>

{#if error}
  <div 
    class="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50"
    role="alert"
  >
    {error}
  </div>
{/if}

{#if copied}
  <div 
    class="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50"
    role="status"
  >
    Address copied!
  </div>
{/if}

<style>
  .address {
    font-family: 'Roboto Mono', monospace;
    display: inline-flex;
    align-items: center;
  }
  
  .address.copied {
    color: #22c55e;
    transition: color 0.2s ease;
  }
  
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>