<!-- lib/components/CardActions.svelte -->

<script lang="ts">
  import type { Address } from 'viem';
  import { onDestroy } from 'svelte';

  interface Props {
    onUnlock: () => void;
    onSend: () => void;
    onShowQR: () => void;
    address?: Address;
    disableCopy?: boolean;
  }

  let props = $props();
  
  let copied = $state(false);
  let copyTimeout: number;

  async function handleCopy() {
    if (!props.address || props.disableCopy) return;

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

<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
  <button
    class="flex flex-col items-center p-4 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
    onclick={props.onUnlock}
  >
    <span class="material-icons mb-2">lock_open</span>
    <span>Unlock</span>
  </button>

  <button
    class="flex flex-col items-center p-4 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
    onclick={props.onSend}
  >
    <span class="material-icons mb-2">send</span>
    <span>Send</span>
  </button>

  <button
    class="flex flex-col items-center p-4 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
    onclick={props.onShowQR}
  >
    <span class="material-icons mb-2">qr_code</span>
    <span>QR Code</span>
  </button>

  <button
    class="flex flex-col items-center p-4 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-colors"
    onclick={handleCopy}
    disabled={!props.address || props.disableCopy}
  >
    <span class="material-icons mb-2">
      {copied ? 'check' : 'content_copy'}
    </span>
    <span>Copy Address</span>
  </button>
</div>

{#if copied}
  <div 
    class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg"
    role="status"
    aria-live="polite"
  >
    Address copied!
  </div>
{/if}