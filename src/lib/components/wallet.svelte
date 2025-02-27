<!-- lib/components/Wallet.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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

  // Component state with proper typing using Svelte 5 runes
  let currentCard = $state<CardInfo | null>(null);
  let isCardLocked = $state(true);
  let balance = $state('0');
  
  // État des modaux et autres états UI
  let showPinModal = $state(false);
  let showQRCode = $state(false);
  let showPaymentModal = $state(false);
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let pinAction = $state<'unlock' | 'payment'>('unlock');

  // Ajout d'un mécanisme pour s'assurer que PinModal est monté
  let pinModalMounted = $state(false);
  
  // États pour le suivi du wallet
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

  onMount(() => {
    debugService.info('Wallet component mounted');
    updateFromCardState();
    pinModalMounted = false;
    
    // Log lorsque le composant est monté pour faciliter le débogage
    console.log('Wallet component mounted, current card:', currentCard);
  });

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
  
  debugService.info('Initiating card unlock process');
  
  // Définir l'action et le modal
  pinAction = 'unlock';
  showPinModal = true;
}


  // Unlock card with PIN - processus complet
  async function handlePinSubmit(pin: string) {
    console.log('PIN submitted, starting processing');
    debugService.info('PIN submitted for processing');
    
    if (!currentCard) {
      console.error('No card available for unlocking');
      return;
    }

    try {
      isLoading = true;
      
      if (pinAction === 'unlock') {
        console.log('Unlocking card with PIN');
        // Déverrouiller la carte avec le PIN fourni
        const success = await cardState.unlockCard(pin);
        
        if (success) {
          // Vérifier le statut du wallet après déverrouillage
          updateWalletStatus();
          debugService.info(`Card unlocked successfully, wallet connected: ${walletConnected}`);
          
          if (!walletConnected) {
            // Tentative de connexion directe si le wallet n'est pas connecté
            debugService.warn('Wallet not connected after card unlock, trying direct connection');
            const connected = await walletService.connectCard(currentCard, pin);
            if (connected) {
              debugService.info('Direct wallet connection successful');
              isCardLocked = false;
              updateWalletStatus();
            } else {
              throw new Error('Failed to connect wallet directly');
            }
          }
          
          // Succès - masquer le modal et effacer les erreurs
          showPinModal = false;
          error = null;
          console.log('Unlock successful, PIN modal closed');
        } else {
          throw new Error('Invalid PIN or connection failed');
        }
      } else if (pinAction === 'payment') {
        // Gestion des actions de paiement
        showPinModal = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to unlock card';
      debugService.error(`Unlock error: ${error}`);
      console.error('PIN processing error:', error);
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
      
      updateWalletStatus();
      
      if (isCardLocked && walletConnected) {
        debugService.info('Payment successful but card still locked in UI, updating state');
        isCardLocked = false;
      }
    } catch (err) {
      debugService.error(`Payment failed: ${err}`);
      error = err instanceof Error ? err.message : 'Payment failed';
    }
  }

  // Fonction explicite pour fermer le modal PIN
  function closePinModal() {
    console.log('Closing PIN modal');
    showPinModal = false;
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
    <BalanceUpdater updateInterval={20} />
  {/if}

  <!-- Render PIN modal - simplification des tests de visibilité -->
  {#if showPinModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
      <PinModal 
        onSubmit={async (pin) => {
          debugService.info('PIN submitted, processing...');
          try {
            await handlePinSubmit(pin);
          } catch (e) {
            debugService.error(`Error in PIN processing: ${e}`);
            // Ne pas fermer le modal en cas d'erreur
          }
        }}
        onClose={() => {
          debugService.info('PIN modal closed by user');
          showPinModal = false;
        }}
        title={pinAction === 'unlock' ? 'Unlock Card' : 'Enter PIN'}
      />
    </div>
  </div>
{/if}

{#if showPaymentModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
      <PaymentModal
        onSubmit={handlePaymentSubmit}
        onClose={() => {
          debugService.info('Payment modal closed by user');
          showPaymentModal = false;
        }}
      />
    </div>
  </div>
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

  

  <!-- Bouton de débogage pour forcer l'affichage du modal PIN (développement uniquement) -->
  {#if import.meta.env.DEV}
    <div class="fixed bottom-4 right-4 flex flex-col gap-2">
      <button 
        class="bg-purple-600 text-white px-3 py-1 rounded-lg text-sm shadow"
        onclick={() => {
          showPinModal = true;
          console.log('PIN modal forced to show');
        }}
      >
        Force Show PIN Modal
      </button>
      <div class="text-xs text-gray-500 bg-white p-1 rounded">
        PIN modal state: {showPinModal ? 'visible' : 'hidden'}
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