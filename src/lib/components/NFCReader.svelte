<!-- lib/components/NFCReader.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nfcService } from '$lib/services/nfc.js';
  import { useCardState } from '$lib/stores/card.js';
  import type { CardMode, CardInfo } from '$lib/types.js';

  let props = $props<{
    onRead?: (cardInfo: CardInfo) => void;
    onError?: (error: string) => void;
    onSuccess?: () => void;
    onClose?: () => void;  
    mode?: CardMode;
  }>();
    
  const cardState = useCardState();
  
  
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
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to initialize NFC';
    }
  });

  onDestroy(() => {
    if (isReading) {
      void nfcService.stopReading();
    }
  });

  async function startReading(e: Event) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    try {
      await nfcService.startReading({
        mode: props.mode,
        onRead: ({ cardInfo, isValid }) => {
          if (!isValid) {
            error = 'Invalid card';
            status = 'Card validation failed';
            return;
          }
          status = 'Card read successfully';
          cardState.setCard(cardInfo);
          props.onRead?.(cardInfo);
          props.onSuccess?.();
        },
        onError: (err) => {
          error = err.message;
          status = 'Reading failed';
          props.onError?.(err.message);
        },
        onStateChange: (state: "reading" | "stopped") => {
          isReading = state === "reading";
        }
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to start reading';
      props.onError?.(error);
    }
  }
</script>

  <div class="w-full max-w-md mx-auto p-4">
    {#if error}
      <div class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg" role="alert">
        {error}
      </div>
    {/if}
  
    {#if !isSupported}
      <div class="mb-4 p-3 bg-yellow-100 text-yellow-700 rounded-lg">
        NFC is not supported on this device.
      </div>
    {:else}
      <div class="space-y-4">
        <button
          class="w-full py-3 px-4 bg-blue-500 text-white rounded-lg
                 hover:bg-blue-600 transition-colors disabled:opacity-50
                 disabled:cursor-not-allowed"
          disabled={isReading}
          onclick={startReading}
        >
          {isReading ? 'Scanning...' : 'Scan Card'}
        </button>
  
        {#if status}
          <div class="text-center {isReading ? 'animate-pulse' : ''}">
            {status}
          </div>
        {/if}
  
        {#if isReading}
          <div class="flex justify-center mt-4">
            <div class="w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
          </div>
          <p class="text-center mt-2 text-gray-600">
            Hold your card against the back of your device
          </p>
        {/if}
      </div>
    {/if}
  </div>