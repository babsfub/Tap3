<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { nfcService } from '$lib/services/nfc.js';
    import type { CardMode, CardInfo } from '$lib/types.js';
    
    interface Props {
      mode: CardMode;
      onCardDetected: (cardInfo: CardInfo) => void;
      onClose: () => void;
    }
  
    const { mode, onCardDetected, onClose } = $props<{ mode: CardMode, onCardDetected: (cardInfo: CardInfo) => void, onClose: () => void }>();
    
    let nfcStatut = $state('loading');
    let error = $state<string | null>(null);
    let isIOS = $state(false);
  
    async function initializeNFC() {
      if (!browser) return;
  
      try {
        // Vérifier iOS au démarrage
        isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
        // Pour iOS, on passe directement en mode attente
        if (isIOS) {
            nfcStatut = 'waiting';
          return;
        }
  
        // Vérifier le support NFC
        const supported = await nfcService.isSupported();
        if (!supported) {
          throw new Error('NFC is not supported on this device');
        }
  
        // Demander les permissions
        const permission = await nfcService.requestPermission();
        if (permission !== 'granted') {
          throw new Error('NFC permission denied');
        }
  
        // Démarrer le scan NFC
        nfcStatut = 'reading';
        await nfcService.startReading({
          onRead: (result) => {
            if (result.isValid) {
              onCardDetected(result.cardInfo);
            } else {
              error = 'Invalid card detected';
            }
          },
          onError: (e) => {
            error = e.message;
            nfcStatut = 'error';
          },
          onStateChange: (newState) => {
            nfcStatut = newState === 'reading' ? 'reading' : 'waiting';
          },
          mode: mode
        });
  
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to initialize NFC';
        nfcStatut = 'error';
      }
    }
  
    function handleRetry() {
      error = null;
      void initializeNFC();
    }
  
    
    onMount(() => {
      void initializeNFC();
      return () => {
        void nfcService.stopReading();
      };
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
            {#if isIOS}
              Scan with NFC Reader
            {:else}
              {mode === 'write' ? 'Write to Card' : 'Read Card'}
            {/if}
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
          <div 
            class="mb-4 p-3 rounded bg-red-100 border border-red-400 text-red-700
                   dark:bg-red-900/50 dark:border-red-800 dark:text-red-100"
            role="alert"
          >
            {error}
          </div>
        {/if}
  
        <div class="text-center">
          {#if nfcStatut === 'loading'}
            <div class="flex flex-col items-center gap-4">
              <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent 
                        rounded-full animate-spin" ></div>
              <p class="text-gray-600 dark:text-gray-300">
                Initializing NFC...
              </p>
            </div>
  
          {:else if nfcStatut === 'reading'}
            <div class="space-y-4">
              <div class="w-24 h-24 mx-auto">
                <img 
                  src="/images/nfc-scan-animation.svg" 
                  alt="NFC scanning animation"
                  class="w-full h-full"
                />
              </div>
              <p class="text-gray-600 dark:text-gray-300">
                Hold your device near the card
              </p>
            </div>
  
          {:else if nfcStatut === 'waiting'}
            <div class="space-y-4">
              {#if isIOS}
                <p class="text-gray-600 dark:text-gray-300">
                  Please scan your card with an NFC reader and follow the provided link.
                </p>
                <div class="w-24 h-24 mx-auto">
                  <img 
                    src="/images/external-nfc-reader.svg" 
                    alt="External NFC reader"
                    class="w-full h-full"
                  />
                </div>
              {:else}
                <p class="text-gray-600 dark:text-gray-300">
                  Ready to scan. Place a card near your device.
                </p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
  
      <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg
                 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
                 dark:hover:bg-gray-600 transition-colors"
          onclick={onClose}
        >
          Cancel
        </button>
        
        {#if nfcStatut === 'error'}
          <button
            type="button"
            class="px-4 py-2 text-white bg-blue-500 rounded-lg
                   hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700
                   transition-colors"
            onclick={handleRetry}
          >
            Try Again
          </button>
        {/if}
      </div>
    </div>
  </div>