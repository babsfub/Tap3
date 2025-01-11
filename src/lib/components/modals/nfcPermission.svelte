<!-- lib/components/modals/nfcPermission.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nfcService } from '$lib/services/nfc.js';
  import type { CardInfo } from '$lib/types.js';

  interface Props {
    onCardDetected: (cardInfo: CardInfo) => void;
    onClose: () => void;
  }

  let { onCardDetected, onClose }: Props = $props();
  
  let isSupported = $state(false);
  let isReading = $state(false);
  let error = $state<string | null>(null);
  let status = $state<string>('');

  onMount(async () => {
    try {
      isSupported = await nfcService.isSupported();
      if (!isSupported) {
        error = 'NFC is not supported on this device';
        return;
      }
      
      const permission = await nfcService.requestPermission();
      if (permission !== 'granted') {
        error = 'NFC permission was not granted';
        return;
      }

      // Démarrer automatiquement la lecture
      if (isSupported && permission === 'granted') {
        void startReading();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to initialize NFC';
    }
  });

  onDestroy(() => {
    if (isReading) {
      void nfcService.stopReading();
    }
  });

  async function startReading() {
    try {
      await nfcService.startReading({
        mode: 'payment',
        onRead: ({ cardInfo, isValid }) => {
          if (!isValid) {
            error = 'Invalid card';
            status = 'Card validation failed';
            return;
          }
          status = 'Card read successfully';
          onCardDetected(cardInfo);
          onClose();
        },
        onError: (err) => {
          error = err.message;
          status = 'Reading failed';
        },
        onStateChange: (state: "reading" | "stopped") => {
          isReading = state === "reading";
        }
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to start reading';
    }
  }
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
          {isReading ? 'Scanning Card...' : 'Scan Card'}
        </h2>
        <button
          onclick={onClose}
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
        <div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded" role="alert">
          {error}
        </div>
      {/if}

      <div class="text-center space-y-6">
        {#if !isSupported}
          <div class="mb-4 p-3 bg-yellow-100 text-yellow-700 rounded-lg">
            NFC is not supported on this device.
          </div>
        {:else}
          {#if isReading}
            <div class="w-16 h-16 mx-auto rounded-full border-4 border-blue-500 
                      border-t-transparent animate-spin"></div>
            <p class="text-gray-600 dark:text-gray-300">
              Hold your card against the back of your device
            </p>
          {:else}
            <p class="text-gray-600 dark:text-gray-300">
              Ready to scan card
            </p>
            
            <div class="w-32 h-32 mx-auto">
              <img 
                src="/images/scan-card.svg" 
                alt="Scan card illustration"
                class="w-full h-full"
              />
            </div>
          {/if}

          {#if status}
            <div class="text-center {isReading ? 'animate-pulse' : ''}">
              {status}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
      <button
        type="button"
        class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg
               hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
               dark:hover:bg-gray-600 transition-colors"
        onclick={onClose}
      >
        Cancel
      </button>
    </div>
  </div>
</div>