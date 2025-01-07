<script lang="ts">
    import { browser } from '$app/environment';
    import { onDestroy } from 'svelte';
  
    let props = $props<{
      address: string;
      showFull?: boolean;
      copyable?: boolean;
      showPrefix?: boolean;
    }>();
  
    let copied = $state(false);
    let copyTimeout: number;
  
    // Format address with or without prefix
    let displayAddress = $derived<string>(() => {
  const addr = props.address.toLowerCase();
  if (!props.showPrefix && addr.startsWith('0x')) {
    return addr.slice(2);
  }
  return addr;
});

let shortAddress = $derived<string>(() => {
  const addr = displayAddress;
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
});

    async function copyToClipboard() {
      if (!browser || !props.copyable) return;
  
      try {
        await navigator.clipboard.writeText(props.address);
        copied = true;
  
        if (copyTimeout) {
          window.clearTimeout(copyTimeout);
        }
  
        copyTimeout = window.setTimeout(() => {
          copied = false;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }

    onDestroy(() => {
      if (copyTimeout) {
        window.clearTimeout(copyTimeout);
      }
    });
  </script>
  
  <button
    class="inline-flex items-center space-x-1 font-mono text-sm
           {props.copyable ? 'hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500' : 'cursor-default'}"
    onclick={copyToClipboard}
    disabled={!props.copyable}
    title={props.copyable ? 'Click to copy' : undefined}
  >
    <span class="truncate">
      {props.showFull ? displayAddress : shortAddress}
    </span>
    
    {#if props.copyable}
      <span class="text-gray-400 dark:text-gray-500" aria-hidden="true">
        {#if copied}
          <!-- Success check -->
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <!-- Copy icon -->
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        {/if}
      </span>
    {/if}
  </button>
  
  {#if props.copyable && copied}
    <div 
      class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg"
      role="status"
      aria-live="polite"
    >
      Address copied!
    </div>
  {/if}