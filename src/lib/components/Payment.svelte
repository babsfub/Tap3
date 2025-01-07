<!-- src/lib/components/Payment.svelte -->
<script lang="ts">
  import { isAddress } from 'viem';
  import type { Address } from 'viem';
  import PinModal from '$lib/components/modals/PinModal.svelte';
  import { usePaymentState } from '$lib/stores/payments.js';
  import { nfcService } from '$lib/services/nfc.js';
  
  let props = $props<{
    onSubmit: (to: Address, amount: string) => Promise<void>;
    onClose: () => void;
  }>();

  const paymentState = usePaymentState();
  
  let address = $state('');
  let amount = $state('');
  let showPin = $state(false);
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let isScanning = $state(false);

  let isValidAddress = $derived(isAddress(address as Address));
  let isValidAmount = $derived(parseFloat(amount) > 0);
  let canSubmit = $derived( isValidAmount && !isLoading);

  // Fonction pour démarrer le scan NFC
  async function startNFCScan() {
    try {
      isScanning = true;
      error = null;

      await nfcService.startReading({
        onRead: ({ cardInfo }) => {
          address = cardInfo.pub;
          isScanning = false;
        },
        onError: (err) => {
          error = err.message;
          isScanning = false;
        },
        onStateChange: (state) => {
          if (state === 'stopped') {
            isScanning = false;
          }
        }
      });

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to scan card';
      isScanning = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    showPin = true;
  }

  async function handlePinSubmit(password: string) {
    try {
      isLoading = true;
      error = null;
      await props.onSubmit(address as Address, amount);
      showPin = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Payment failed';
      showPin = false;
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/50" role="dialog" aria-labelledby="modal-title">
  <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
    <header class="mb-6 flex justify-between items-center">
      <h2 id="modal-title" class="text-xl font-bold">Send Payment</h2>
      <button 
        onclick={props.onClose} 
        class="text-gray-500 hover:text-gray-700"
        aria-label="Close"
      >×</button>
    </header>

    {#if error}
      <div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
        {error}
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <!-- Scan NFC ou entrée manuelle -->
      <div class="flex flex-col gap-4">
        <button
          type="button"
          class="w-full px-4 py-3 bg-blue-500 text-white rounded-lg
                 hover:bg-blue-600 transition-colors"
          onclick={startNFCScan}
          disabled={isScanning}
        >
          {isScanning ? 'Scanning...' : 'Scan Recipient Card'}
        </button>

        <div class="text-center text-gray-500">or</div>

        <div>
          <label for="address" class="block font-medium mb-1">Enter Address Manually</label>
          <input
            id="address"
            type="text"
            bind:value={address}
            placeholder="0x..."
            class="w-full p-2 border rounded-md" 
            class:border-red-500={!isValidAddress && address}
            disabled={isLoading || isScanning}
          />
        </div>
      </div>

      <!-- Montant -->
      <div>
        <label for="amount" class="block font-medium mb-1">Amount (MATIC)</label>
        <input
          id="amount"
          type="number"
          bind:value={amount}
          step="0.000001"
          min="0"
          class="w-full p-2 border rounded-md"
          class:border-red-500={!isValidAmount && amount}
          disabled={isLoading || isScanning}
        />
      </div>

      <!-- Boutons d'action -->
      <footer class="flex justify-end gap-3 pt-4">
        <button 
          type="button"
          onclick={props.onClose}
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          disabled={isLoading || isScanning}
        >Cancel</button>
        
        <button 
          type="submit"
          class="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
          class:opacity-50={!canSubmit}
          disabled={!canSubmit || isScanning}
        >
          {isLoading ? 'Processing...' : 'Continue'}
        </button>
      </footer>
    </form>
  </div>
</div>

{#if showPin}
  <PinModal
    onSubmit={handlePinSubmit}
    onClose={() => showPin = false}
  />
{/if}

<!-- Instructions NFC visibles pendant le scan -->
{#if isScanning}
  <div class="fixed inset-0 flex items-center justify-center bg-black/80">
    <div class="text-center text-white p-6">
      <div class="mb-4">
        <div class="animate-pulse text-3xl mb-2">🔄</div>
        <h3 class="text-xl font-bold mb-2">Scanning for Card</h3>
        <p>Hold the recipient's card near your device</p>
      </div>
      <button
        class="px-4 py-2 bg-white text-black rounded-lg"
        onclick={() => isScanning = false}
      >
        Cancel Scan
      </button>
    </div>
  </div>
{/if}