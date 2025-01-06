<!-- lib/components/NFCWriter.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nfcService } from '$lib/services/nfc.js';
  import PinModal from './modals/PinModal.svelte';
  import type { CardInfo } from '$lib/types.js';

  let props = $props<{
    cardInfo: CardInfo;
    onError?: (error: string) => void;
    onSuccess?: () => void;
  }>();

  let isSupported = $state(false);
  let isWriting = $state(false);
  let showPinModal = $state(false);
  let error = $state<string | null>(null);
  let status = $state<string>('');

  onMount(async () => {
    try {
      isSupported = await nfcService.isSupported();
      if (!isSupported) {
        throw new Error('NFC is not supported on this device');
      }
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Failed to initialize NFC');
    }
  });

  function handleError(message: string) {
    error = message;
    if (props.onError) {
      props.onError(message);
    }
  }

  async function handlePinSubmit(pin: string) {
    try {
      isWriting = true;
      error = null;
      status = 'Writing to card...';

      await nfcService.writeCard(props.cardInfo, {
        privateKey: props.cardInfo.priv.toString(),
        pin
      });

      status = 'Card written successfully';
      showPinModal = false;

      if (props.onSuccess) {
        props.onSuccess();
      }

    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Failed to write card');
    } finally {
      isWriting = false;
    }
  }

  function startWriting() {
    error = null;
    showPinModal = true;
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
      NFC is not supported on your device
    </div>
  {:else}
    <div class="space-y-4">
      <button
        class="w-full py-3 px-4 bg-green-500 text-white rounded-lg
               hover:bg-green-600 transition-colors disabled:opacity-50"
        disabled={isWriting}
        onclick={startWriting}
      >
        {isWriting ? 'Writing...' : 'Write to Card'}
      </button>

      {#if status}
        <div class="text-center {isWriting ? 'animate-pulse' : ''}">
          {status}
        </div>
      {/if}

      {#if isWriting}
        <div class="flex justify-center mt-4">
          <div class="w-16 h-16 rounded-full border-4 border-green-500 
                    border-t-transparent animate-spin">
          </div>
        </div>
        <p class="text-center mt-2 text-gray-600">
          Hold your card against the device
        </p>
      {/if}
    </div>
  {/if}
</div>

{#if showPinModal}
  <PinModal
    onSubmit={handlePinSubmit}
    onClose={() => showPinModal = false}
    title="Enter Card PIN"
  />
{/if}