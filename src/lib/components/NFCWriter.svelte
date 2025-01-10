<!-- lib/components/modals/NFCWriteModal.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { nfcService } from '$lib/services/nfc.js';
  import type { CardInfo } from '$lib/types.js';

  interface Props {
    cardInfo: CardInfo;
    pin: string;
    onSuccess: () => void;
    onError: (error: string) => void;
    onClose: () => void;
  }
  let props = $props();
  
  let nfcStatus = $state<'checking' | 'ready' | 'writing' | 'error'>('checking');
  let error = $state<string | null>(null);

  async function checkNFCPermission() {
    if (!browser) return;

    try {
      const supported = await nfcService.isSupported();
      if (!supported) {
        throw new Error('NFC is not supported on this device');
      }

      const permission = await nfcService.requestPermission();
      if (permission !== 'granted') {
        throw new Error('NFC permission denied');
      }

      nfcStatus = 'ready';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to initialize NFC';
      nfcStatus = 'error';
      props.onError(error);
    }
  }

  async function writeToCard() {
    try {
      nfcStatus = 'writing';
      await nfcService.writeCard(props.cardInfo, {
        pin: props.pin,
        privateKey: props.cardInfo.key || ''
      });
      props.onSuccess();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to write to card';
      nfcStatus = 'error';
      props.onError(error);
    }
  }

  onMount(() => {
    void checkNFCPermission();
  });
</script>

<div 
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
>
  <div class="max-w-md w-full mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-bold dark:text-white">
          Write to Card
        </h2>
        <button
          onclick={props.onClose}
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                 transition-colors"
          aria-label="Close"
        >
          <span class="text-2xl">×</span>
        </button>
      </div>
    </div>

    <div class="p-6">
      {#if error}
        <div 
          class="mb-4 p-3 rounded bg-red-100 border border-red-400 text-red-700
                 dark:bg-red-900/50 dark:border-red-800 dark:text-red-100"
          role="alert"
        >
          {error}
        </div>
      {/if}

      <div class="text-center space-y-6">
        {#if nfcStatus === 'checking'}
          <div class="w-12 h-12 mx-auto border-4 border-blue-500 border-t-transparent 
                    rounded-full animate-spin" ></div>
          <p class="text-gray-600 dark:text-gray-300">
            Checking NFC capabilities...
          </p>

        {:else if nfcStatus === 'ready'}
          <p class="text-gray-600 dark:text-gray-300">
            Ready to write. Tap to start writing to card.
          </p>
          <button
            onclick={() => void writeToCard()}
            class="px-4 py-2 bg-blue-500 text-white rounded-lg
                   hover:bg-blue-600 transition-colors"
          >
            Start Writing
          </button>

        {:else if nfcStatus === 'writing'}
          <div class="w-32 h-32 mx-auto">
            <img 
              src="/images/nfc-write-animation.svg" 
              alt="Writing to card"
              class="w-full h-full"
            />
          </div>
          <p class="text-gray-600 dark:text-gray-300">
            Hold your device near the card until the process is complete...
          </p>
        {/if}
      </div>
    </div>

    <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
      <button
        type="button"
        onclick={props.onClose}
        class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg
               hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
               dark:hover:bg-gray-600 transition-colors"
      >
        Cancel
      </button>
    </div>
  </div>
</div>