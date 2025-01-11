<!-- src/lib/components/Payment.svelte -->
<script lang="ts">
  import { isAddress } from 'viem';
  import type { Address } from 'viem';
  import type { CardInfo } from '$lib/types.js';
  import PinModal from '$lib/components/modals/PinModal.svelte';
  import NFCReader from './NFCReader.svelte';
  import { usePaymentState } from '$lib/stores/payments.js';
  import { useCardState } from '$lib/stores/card.js';
  import { nfcService } from '$lib/services/nfc.js';
  
  let props = $props<{
    onClose: () => void;
    onSubmit: (amount: number) => Promise<void>;
  }>();

  const paymentState = usePaymentState();
  const cardState = useCardState();

  let showNFCReader = $state(false);
  let showPin = $state(false);
  let address = $state('');
  let amount = $state('');
  
  let currentCard = $derived(cardState.getState().currentCard);
  let paymentStatus = $derived(paymentState.getState().status);
  let error = $state<string | null>(null);
  let isLoading = $derived(paymentStatus === 'loading');

  let pendingTo = $state<Address | null>(null);
  let pendingAmount = $state<string | null>(null);

  let isValidAddress = $derived(isAddress(address as Address));
  let isValidAmount = $derived(parseFloat(amount) > 0);
  let canSubmit = $derived(isValidAddress && isValidAmount && !isLoading && currentCard);

  // Gestion de la lecture NFC du destinataire
  async function handleRecipientCardRead(cardInfo: CardInfo) {
    // Arrêter la lecture immédiatement
    await nfcService.stopReading();
    
    if (cardInfo.pub) {
      // Vérifier que ce n'est pas la même carte
      if (cardInfo.pub === currentCard?.pub) {
        error = "Cannot send to the same card";
        return;
      }
      
      address = cardInfo.pub;
      showNFCReader = false;
      error = null; // Clear any previous error
    } else {
      error = 'Invalid recipient card';
    }
  }

  async function startNFCReading() {
    error = null; // Clear previous errors
    await nfcService.stopReading(); // Ensure previous reader is stopped
    await new Promise(resolve => setTimeout(resolve, 200)); // Add small delay
    showNFCReader = true;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    
    pendingTo = address as Address;
    pendingAmount = amount;
    showPin = true;
  }

  async function handlePinSubmit(pin: string) {
    if (!pendingTo || !pendingAmount || !currentCard) return;
    
    try {
      cardState.unlockCard(); 
      await paymentState.sendTransaction(pendingTo, pendingAmount, pin);
      showPin = false;
      props.onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Payment failed';
      showPin = false;
      cardState.lockCard(); 
    } finally {
      pendingTo = null;
      pendingAmount = null;
    }
  }
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/50" role="dialog" aria-labelledby="modal-title">
  <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
    <header class="mb-6 flex justify-between items-center">
      <h2 id="modal-title" class="text-xl font-bold dark:text-white">Send Payment</h2>
      <button 
        onclick={props.onClose} 
        class="text-gray-500 hover:text-gray-700 dark:text-gray-400 
               dark:hover:text-gray-300"
        aria-label="Close"
      >×</button>
    </header>

    {#if error}
      <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/50 border border-red-400 
                  dark:border-red-800 text-red-700 dark:text-red-100 rounded">
        {error}
      </div>
    {/if}

    {#if showNFCReader}
      <NFCReader
        mode="payment"
        onRead={handleRecipientCardRead}
        onError={(message) => error = message}
        onSuccess={() => error = null}
        onClose={() => {
          showNFCReader = false;
          error = null;
        }}
      />
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="address" class="block font-medium mb-1 dark:text-gray-200">
            Recipient Address
          </label>
          <div class="flex gap-2">
            <input
              id="address"
              type="text"
              bind:value={address}
              placeholder="0x..."
              class="flex-1 p-2 border rounded-md dark:bg-gray-700 
                     dark:border-gray-600 dark:text-white" 
              class:border-red-500={!isValidAddress && address}
              disabled={isLoading}
            />
            <button
              type="button"
              onclick={startNFCReading}
              class="px-4 py-2 bg-blue-500 text-white rounded-md
                     hover:bg-blue-600 dark:bg-blue-600 
                     dark:hover:bg-blue-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Scan Card
            </button>
          </div>
        </div>

        <div>
          <label for="amount" class="block font-medium mb-1 dark:text-gray-200">
            Amount (MATIC)
          </label>
          <input
            id="amount"
            type="number"
            bind:value={amount}
            step="0.000001"
            min="0"
            class="w-full p-2 border rounded-md dark:bg-gray-700 
                   dark:border-gray-600 dark:text-white"
            class:border-red-500={!isValidAmount && amount}
            disabled={isLoading}
          />
        </div>

        <footer class="flex justify-end gap-3 pt-4">
          <button 
            type="button"
            onclick={props.onClose}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md 
                   hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
                   dark:hover:bg-gray-600 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          
          <button 
            type="submit"
            class="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600
                   dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
            class:opacity-50={!canSubmit}
            disabled={!canSubmit}
          >
            {isLoading ? 'Processing...' : 'Send'}
          </button>
        </footer>
      </form>
    {/if}
  </div>
</div>

{#if showPin}
  <PinModal
    title="Confirm Payment"
    onSubmit={handlePinSubmit}
    onClose={() => {
      showPin = false;
      error = null;
    }}
  />
{/if}