<!-- lib/components/Wallet.svelte (version corrigée) -->
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
  let pinAction = $state<'unlock' | 'payment'>('unlock');

  // Debug state to track wallet connections
  let walletConnected = $state(false);
  let walletAddress = $state<string | null>(null);

  // Check wallet connection status
  function updateWalletStatus() {
    try {
      walletConnected = walletService.isConnected();
      const addr = walletService.getAddress({ showErrors: false, throwIfNotConnected: false });
      walletAddress = addr ? addr : null;
      debugService.debug(`Wallet status: connected=${walletConnected}, address=${walletAddress || 'none'}`);
    } catch (e) {
      debugService.warn(`Error checking wallet status: ${e}`);
      walletConnected = false;
      walletAddress = null;
    }
  }

  // Initialize state from card store
  function updateFromCardState() {
    const state = cardState.getState();
    currentCard = state.currentCard;
    isCardLocked = state.isLocked;
    balance = cardState.getFormattedBalance();
    updateWalletStatus(); // Check wallet status whenever card state updates
    debugService.debug(`Card state updated: card=${currentCard?.id}, locked=${isCardLocked}, wallet connected=${walletConnected}`);
  }

  // Initial state load
  updateFromCardState();

  // Set up subscription for state changes
  let unsubscribe = cardState.subscribe((state) => {
    currentCard = state.currentCard;
    isCardLocked = state.isLocked;
    balance = cardState.getFormattedBalance();
    updateWalletStatus();
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

  // Initiate unlock process
  function initiateUnlock() {
    if (!currentCard) {
      error = 'No card connected';
      return;
    }
    
    debugService.info('Initiating card unlock');
    pinAction = 'unlock';
    showPinModal = true;
  }

  // Unlock card with PIN
  async function handlePinSubmit(pin: string) {
    if (!currentCard) return;

    try {
      isLoading = true;
      debugService.info('PIN submitted, processing...');
      
      if (pinAction === 'unlock') {
        // Important: await the unlockCard method now that it's async
        const success = await cardState.unlockCard(pin);
        
        if (success) {
          // Vérifier à nouveau le statut du wallet après le déverrouillage
          updateWalletStatus();
          debugService.info(`Card unlocked successfully, wallet connected: ${walletConnected}`);
          
          if (!walletConnected) {
            // Si le wallet n'est toujours pas connecté, essayer de le connecter directement
            debugService.warn('Wallet still not connected after card unlock, trying direct connection');
            const connected = await walletService.connectCard(currentCard, pin);
            if (connected) {
              debugService.info('Direct wallet connection successful');
              // Force UI update to reflect wallet connection
              isCardLocked = false;
              updateWalletStatus();
            } else {
              throw new Error('Failed to connect wallet directly');
            }
          }
          
          showPinModal = false;
          error = null;
        } else {
          throw new Error('Invalid PIN or connection failed');
        }
      } else if (pinAction === 'payment') {
        // Si c'était pour un paiement, géré ailleurs
        showPinModal = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to unlock card';
      debugService.error(`Unlock error: ${error}`);
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
      
      // Mettre à jour le statut du wallet après le paiement
      updateWalletStatus();
      
      // Vérifier que l'historique sera affiché
      if (isCardLocked && walletConnected) {
        debugService.info('Payment successful but card still locked in UI, updating state');
        isCardLocked = false;
      }
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

  {#if import.meta.env.DEV && walletAddress}
    <div class="fixed top-4 right-4 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100 p-2 text-xs rounded shadow-md z-40">
      Wallet connected: {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
    </div>
  {/if}

  {#if currentCard}
    <CardDisplay 
      cardInfo={currentCard}
      balance={balance}
      onUnlock={initiateUnlock}
      isLocked={isCardLocked}
    />
    
    <CardActions 
      onUnlock={initiateUnlock}
      onSend={initiatePayment}
      onShowQR={() => showQRCode = true}
      onCopy={copyAddress}
      address={currentCard.pub}
      isUnlocked={!isCardLocked}
    />

    <!-- Important: Display history based on wallet connection status not just card lock state -->
    {#if !isCardLocked && walletConnected && historyState.getTransactionsByAddress(currentCard.pub).length > 0}
      <TransactionHistory 
        transactions={historyState.getTransactionsByAddress(currentCard.pub)}
      />
    {:else if !isCardLocked && walletConnected && historyState.getTransactionsByAddress(currentCard.pub).length === 0}
      <div class="mt-6 p-4 text-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <p class="text-gray-600 dark:text-gray-300">No transaction history available</p>
      </div>
    {:else if !isCardLocked && !walletConnected}
      <div class="mt-6 p-4 text-center bg-yellow-100 dark:bg-yellow-800/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <p class="text-yellow-700 dark:text-yellow-200">
          Connected to card but wallet not initialized properly. Try unlocking again.
        </p>
        <button 
          onclick={initiateUnlock}
          class="mt-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
        >
          Retry Unlock
        </button>
      </div>
    {/if}
    
    <!-- Balance updater runs in background - INSTANCE UNIQUE -->
    <BalanceUpdater updateInterval={12} />
  {/if}

  {#if showPinModal}
    <PinModal 
      onSubmit={handlePinSubmit}
      onClose={() => showPinModal = false}
      title={pinAction === 'unlock' ? 'Unlock Card' : 'Enter PIN'}
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