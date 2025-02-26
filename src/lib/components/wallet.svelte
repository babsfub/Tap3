<!-- lib/components/Wallet.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { useCardState } from '$lib/stores/card.js';
  import { useHistoryState } from '$lib/stores/history.js';
  import { usePaymentState } from '$lib/stores/payments.js';
  import CardDisplay from './CardDisplay.svelte';
  import CardActions from './CardActions.svelte';
  import TransactionHistory from './TransactionHistory.svelte';
  import PinModal from './modals/PinModal.svelte';
  import QrCode from './QRcode.svelte';
  import PaymentModal from './Payment.svelte';
  import BalanceUpdater from './BalanceUpdater.svelte';
  import type { Address } from 'viem';
  import { debugService } from '$lib/services/DebugService.js';
  import { walletService } from '$lib/services/wallet.js';
  import type { CardInfo } from '$lib/types.js';

  // Get store instances
  const cardState = useCardState();
  const historyState = useHistoryState();
  const paymentState = usePaymentState();

  // Component state with proper typing
  let currentCard = $state<CardInfo | null>(null);
  let isCardLocked = $state(true);
  let balance = $state('0');
  
  let showPinModal = $state(false);
  let showQRCode = $state(false);
  let showPaymentModal = $state(false);
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  // Initialize state from card store
  function updateFromCardState() {
    const state = cardState.getState();
    currentCard = state.currentCard;
    isCardLocked = state.isLocked;
    balance = cardState.getFormattedBalance();
    debugService.debug(`Card state updated: card=${currentCard?.id}, locked=${isCardLocked}`);
  }

  // Initial state load
  updateFromCardState();

  // Set up subscription for state changes
  let unsubscribe = cardState.subscribe((state) => {
    currentCard = state.currentCard;
    isCardLocked = state.isLocked;
    balance = cardState.getFormattedBalance();
  });

  // Clean up subscription when component is destroyed
  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
      debugService.debug('Cleaned up card state subscription');
    }
  });

  // Copy card address to clipboard
  async function copyAddress() {
    if (!currentCard?.pub) return;
    
    try {
      await navigator.clipboard.writeText(currentCard.pub);
      document.body.style.backgroundColor = 'green';
      setTimeout(() => {
        document.body.style.backgroundColor = '';
      }, 1000);
    } catch (err) {
      error = 'Failed to copy address';
    }
  }

  // Initiate payment
  function initiatePayment() {
  if (!currentCard) {
    error = 'No card connected';
    return;
  }
  
  debugService.info('Initiating payment from wallet');
  showPaymentModal = true;
}

  // Unlock card with PIN
  async function handlePinSubmit(pin: string) {
    if (!currentCard) return;

    try {
      isLoading = true;
      const success = await walletService.connectCard(currentCard, pin);
      if (success) {
        showPinModal = false;
        cardState.unlockCard();
        error = null;
      } else {
        throw new Error('Invalid PIN');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to unlock card';
    } finally {
      isLoading = false;
    }
  }

  // Handle payment submission
  async function handlePaymentSubmit(to: Address, amount: string, pin: string) {
    try {
      debugService.info(`Processing payment: ${amount} MATIC to ${to}`);
      await paymentState.sendTransaction(to, amount, pin);
      showPaymentModal = false;
    } catch (err) {
      debugService.error(`Payment failed: ${err}`);
      error = err instanceof Error ? err.message : 'Payment failed';
    }
  }
</script>

<div class="wallet-container">
  {#if error}
    <div 
      class="fixed top-0 left-0 right-0 bg-red-500 text-white p-4 text-center z-50"
      role="alert"
    >
      {error}
      <button 
        class="ml-2 text-white hover:text-gray-200" 
        onclick={() => error = null}
        aria-label="Close error message"
      >
        ×
      </button>
    </div>
  {/if}

  {#if currentCard}
    <CardDisplay 
      cardInfo={currentCard}
      balance={balance}
      onUnlock={() => showPinModal = true}
      isLocked={isCardLocked}
    />
    
    <CardActions 
      onUnlock={() => showPinModal = true}
      onSend={initiatePayment}
      onShowQR={() => showQRCode = true}
      onCopy={copyAddress}
      address={currentCard.pub}
      isUnlocked={!isCardLocked}
    />

    {#if !isCardLocked && historyState.getTransactionsByAddress(currentCard.pub).length > 0}
      <TransactionHistory 
        transactions={historyState.getTransactionsByAddress(currentCard.pub)}
      />
    {/if}
    
    <!-- Balance updater runs in background - INSTANCE UNIQUE -->
    <BalanceUpdater updateInterval={12} />
  {/if}

  {#if showPinModal}
    <PinModal 
      onSubmit={handlePinSubmit}
      onClose={() => showPinModal = false}
      title="Unlock Card"
    />
  {/if}

  {#if showPaymentModal}
    <PaymentModal
      onSubmit={handlePaymentSubmit}
      onClose={() => showPaymentModal = false}
    />
  {/if}

  {#if showQRCode && currentCard?.pub}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <QrCode 
          address={currentCard.pub} 
          onClose={() => showQRCode = false}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .wallet-container {
    max-width: 36rem;
    margin-left: auto;
    margin-right: auto;
    padding-left: 1rem;
    padding-right: 1rem;
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }
</style>