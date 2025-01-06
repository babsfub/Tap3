<!-- src/routes/components/PaymentModal.svelte -->
<script lang="ts">
    import { isAddress } from 'viem';
    import type { Address } from 'viem';
    import PinModal from '$lib/components/modals/PinModal.svelte';
    import { usePaymentState } from '$lib/stores/payments.js';
    
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
  
    let isValidAddress = $derived(isAddress(address as Address));
    let isValidAmount = $derived(parseFloat(amount) > 0);
    let canSubmit = $derived(isValidAddress && isValidAmount && !isLoading);
  
    async function handleSubmit(e: Event) {
      e.preventDefault();
      if (!canSubmit) return;
      showPin = true;
    }
  
    async function handlePinSubmit(pin: string) {
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
        <div>
          <label for="address" class="block font-medium mb-1">Recipient Address</label>
          <input
            id="address"
            type="text"
            bind:value={address}
            placeholder="0x..."
            class="w-full p-2 border rounded-md" 
            class:border-red-500={!isValidAddress && address}
            disabled={isLoading}
          />
        </div>
  
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
            disabled={isLoading}
          />
        </div>
  
        <footer class="flex justify-end gap-3 pt-4">
          <button 
            type="button"
            onclick={props.onClose}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={isLoading}
          >Cancel</button>
          
          <button 
            type="submit"
            class="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
            class:opacity-50={!canSubmit}
            disabled={!canSubmit}
          >
            {isLoading ? 'Processing...' : 'Send'}
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