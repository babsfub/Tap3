<!-- lib/components/CardManager.svelte -->
<script lang="ts">
  import { useCardState } from '$lib/stores/card.js';
  import { usePaymentState } from '$lib/stores/payments.js';
  import NFCReader from './NFCReader.svelte';
  import NFCWriter from './NFCWriter.svelte';
  import PaymentModal from './Payment.svelte';
  import PinModal from './modals/PinModal.svelte';
  import type { CardInfo } from '$lib/types.js';

  const cardState = useCardState();
  const paymentState = usePaymentState();

  let currentCard = $derived(cardState.getState().currentCard);
  let isCardLocked = $derived(cardState.getState().isLocked);
  let formattedBalance = $derived(cardState.getFormattedBalance());

  let mode = $state<'read' | 'write' | 'payment' | 'verify' | 'setup'>('read');
  let showPaymentModal = $state(false);
  let showPinModal = $state(false);
  let error = $state<string | null>(null);
  let pin = $state('');

  function handleCardRead(cardInfo: CardInfo) {
    error = null;
    cardState.setCard(cardInfo);
    if (mode === 'payment' && cardInfo) {
      showPaymentModal = true;
    }
  }

  async function handlePinSubmit(password: string): Promise<void> {
    pin = password;
    showPinModal = false;
    cardState.unlockCard();
  }

  function handleError(errorMessage: string) {
    error = errorMessage;
  }

  function handleSuccess() {
    error = null;
    pin = '';
    if (mode === 'payment') {
      showPaymentModal = false;
    }
  }

  function switchMode(newMode: typeof mode) {
    error = null;
    if (newMode === 'write' && currentCard) {
      showPinModal = true;
    }
    mode = newMode;
  }
</script>


<div class="container mx-auto px-4 py-8 max-w-2xl">
  <div class="flex justify-center space-x-4 mb-8">
    <button
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-blue-500={mode === 'read'}
      class:text-white={mode === 'read'}
      class:bg-gray-200={mode !== 'read'}
      onclick={() => switchMode('read')}
    >
      Read Card
    </button>

    <button
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-green-500={mode === 'write'}
      class:text-white={mode === 'write'}
      class:bg-gray-200={mode !== 'write'}
      onclick={() => switchMode('write')}
    >
      Write Card
    </button>

    <button
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-purple-500={mode === 'payment'}
      class:text-white={mode === 'payment'}
      class:bg-gray-200={mode !== 'payment'}
      onclick={() => switchMode('payment')}
    >
      Payment Mode
    </button>
  </div>

  {#if error}
    <div class="mb-6 p-4 bg-red-100 text-red-700 rounded-lg" role="alert">
      {error}
    </div>
  {/if}

  <!-- Card Information -->
  {#if currentCard}
    <div class="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-2">Current Card</h2>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <span class="text-gray-500">Card ID:</span>
          <span class="font-mono">{currentCard.id}</span>
        </div>
        <div>
          <span class="text-gray-500">Balance:</span>
          <span class="font-mono">{formattedBalance} MATIC</span>
        </div>
        <div class="col-span-2">
          <span class="text-gray-500">Address:</span>
          <span class="font-mono break-all">
            {cardState.formatAddress(currentCard.pub)}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <!-- NFC Components -->
  {#if mode === 'read' || mode === 'payment'}
  <NFCReader
    {mode}
    onRead={handleCardRead}
    onError={handleError}
    onSuccess={handleSuccess}
  />
{:else if mode === 'write' && currentCard && pin}
  <NFCWriter
    cardInfo={currentCard}
    {pin}
    onClose={() => {
      pin = '';
      mode = 'read';
    }}
    onError={handleError}
    onSuccess={handleSuccess}
  />
{/if}

<!-- Modals -->
{#if showPinModal}
  <PinModal
    title="Enter Card Password"
    onSubmit={handlePinSubmit}
    onClose={() => {
      showPinModal = false;
      mode = 'read';
    }}
  />
{/if}

{#if showPaymentModal && currentCard}
  <PaymentModal
    onClose={() => showPaymentModal = false}
    onSubmit={async (amount: number) => {
      try {
        await paymentState.sendTransaction(currentCard.pub, amount.toString(), pin);
        handleSuccess();
      } catch (err) {
        handleError(err instanceof Error ? err.message : 'Payment failed');
      }
    }}
  />
{/if}
</div>