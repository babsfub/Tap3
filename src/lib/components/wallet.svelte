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
  let recentlyUnlocked = $state(false);
  let pinUsedForUnlock = $state<string | null>(null);
  // Variable pour stocker le gestionnaire de PIN pour les paiements
  let paymentPinHandler = $state<((pin: string) => Promise<void>) | null>(null);
  
  // Variables d'état supplémentaires
  let lastTransactionHash = $state<`0x${string}` | null>(null);
  let lastTransactionStatus = $state<'pending' | 'success' | 'failed' | null>(null);
  
  // États pour le suivi du wallet
  let walletConnected = $state(false);
  let walletAddress = $state<string | null>(null);

  // Mise à jour automatique du statut après les transactions
  $effect(() => {
    if (lastTransactionHash && lastTransactionStatus === 'pending') {
      // Programmer une vérification après un court délai
      const timer = setTimeout(() => {
        void checkTransactionStatus(lastTransactionHash);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  });

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

  // Vérifier le statut d'une transaction
  async function checkTransactionStatus(hash: `0x${string}` | null) {
    if (!hash) return;
    
    try {
      const status = await paymentState.checkTransactionStatus(hash);
      if (status === 'confirmed') {
        lastTransactionStatus = 'success';
        showSuccessNotification('Transaction confirmée avec succès!');
      } else if (status === 'failed') {
        lastTransactionStatus = 'failed';
        error = 'La transaction a échoué sur la blockchain';
      } else {
        // Reprogrammer une autre vérification si la transaction est toujours en attente
        setTimeout(() => void checkTransactionStatus(hash), 10000);
      }
    } catch (e) {
      debugService.error(`Error checking transaction status: ${e}`);
    }
  }

  // Initialize state from card store
  function updateFromCardState() {
    const state = cardState.getState();
    currentCard = state.currentCard;
    isCardLocked = state.isLocked;
    balance = cardState.getFormattedBalance();
    updateWalletStatus(); // Check wallet status whenever card state updates
  }

  // Afficher une notification de succès temporaire
  function showSuccessNotification(message: string) {
    const tmpError = error;
    error = message;
    setTimeout(() => {
      // Ne réinitialiser que si le message n'a pas changé entre-temps
      if (error === message) {
        error = tmpError;
      }
    }, 3000);
  }

  onMount(() => {
    debugService.info('Wallet component mounted');
    updateFromCardState();
    
    // Log lorsque le composant est monté pour faciliter le débogage
    debugService.debug(`Wallet component mounted, current card: ${currentCard}`);
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
      showSuccessNotification('Adresse copiée!');
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
    
    // Vérifier si la carte est déverrouillée
    if (isCardLocked) {
      debugService.info('Need to unlock card before payment');
      showPinModal = true;
      pinAction = 'unlock';
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

  // Fonction explicite pour fermer le modal PIN
  function closePinModal() {
    debugService.info('Closing PIN modal');
    showPinModal = false;
    // Réinitialiser le gestionnaire de paiement à la fermeture
    paymentPinHandler = null;
  }

  // Unlock card with PIN - processus complet
  async function handlePinSubmit(pin: string) {
  debugService.info('PIN submitted for processing');
  
  if (!currentCard) {
    debugService.error('No card available for unlocking');
    throw new Error('Aucune carte disponible');
  }

  try {
    isLoading = true;
    
    if (pinAction === 'unlock') {
      debugService.info('Unlocking card with PIN');
      // Déverrouiller la carte avec le PIN fourni
      const success = await cardState.unlockCard(pin);
      
      if (success) {
        // Marquer comme récemment déverrouillé et stocker le PIN temporairement
        recentlyUnlocked = true;
        pinUsedForUnlock = pin;
        
        // Définir un délai pour réinitialiser l'état "récemment déverrouillé"
        setTimeout(() => {
          recentlyUnlocked = false;
          pinUsedForUnlock = null;
          debugService.debug('Reset recently unlocked state');
        }, 2 * 60 * 1000); // 5 minutes
        
        // Vérifier le statut du wallet
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
          closePinModal();
          error = null;
          
          // Si nous venons d'une tentative de paiement, continuer avec le paiement
          if (showPaymentModal) {
            debugService.info('Continuing to payment after unlock');
            // Déjà sur la modal de paiement, pas besoin de l'ouvrir à nouveau
          } else if (pinAction === 'unlock') {
            showSuccessNotification('Carte déverrouillée avec succès');
          }
        } else {
          throw new Error('Invalid PIN or connection failed');
        }
      } else if (pinAction === 'payment') {
        // Cette logique est maintenant gérée via paymentPinHandler
        closePinModal();
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
      const hash = await paymentState.sendTransaction(to, amount, pin);
      
      if (hash) {
        // Stocker le hash pour surveillance
        lastTransactionHash = hash;
        lastTransactionStatus = 'pending';
        
        // Fermer modal et mettre à jour l'état
        showPaymentModal = false;
        updateWalletStatus();
        
        // Afficher une notification de succès
        showSuccessNotification(`Transaction envoyée! Hash: ${hash.substring(0, 10)}...`);
        
        // Déclencher vérification après un délai
        setTimeout(() => void checkTransactionStatus(hash), 5000);
      }
      
      // Mettre à jour l'état de verrouillage si nécessaire
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

  {#if lastTransactionStatus === 'pending' && lastTransactionHash}
    <div class="fixed top-12 left-0 right-0 bg-yellow-500 text-white p-2 text-center z-40">
      Transaction en cours... Hash: {lastTransactionHash.substring(0, 8)}...
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
            debugService.info('PIN submitted from modal, processing...');
            try {
              // Si pinAction est 'payment', alors c'est le paiement qui a demandé le PIN
              if (pinAction === 'payment') {
                // Vérifier si nous sommes en mode paiement et qu'un gestionnaire est disponible
                if (paymentPinHandler) {
                  debugService.info('Handling payment PIN submission');
                  await paymentPinHandler(pin);
                } else {
                  debugService.error('No payment PIN handler available');
                  throw new Error('Configuration de paiement incorrecte');
                }
              } else {
                // Sinon, c'est un déverrouillage normal de carte
                await handlePinSubmit(pin);
              }
            } catch (e) {
              debugService.error(`Error in PIN processing: ${e instanceof Error ? e.message : String(e)}`);
              error = e instanceof Error ? e.message : 'Échec du traitement du PIN';
              // Ne pas fermer le modal en cas d'erreur pour permettre de réessayer
            }
          }}
          onClose={() => closePinModal()}
          title={pinAction === 'unlock' ? 'Unlock Card' : 'Enter PIN'}
        />
      </div>
    </div>
  {/if}

  {#if showPaymentModal && currentCard}
    <div class="fixed inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <PaymentModal
          onClose={() => {
            showPaymentModal = false;
            paymentPinHandler = null; // Nettoyage du gestionnaire
          }}
          onSubmit={handlePaymentSubmit}
          showPinFn={(action, onPinSubmit) => {
            debugService.info(`Payment requested PIN modal for action: ${action}`);
            
            // Mettre à jour l'état pinAction
            pinAction = 'payment';
            
            // Stocker le gestionnaire pour l'utiliser quand le PIN est soumis
            paymentPinHandler = onPinSubmit;
            
            // Afficher le modal PIN
            showPinModal = true;
            
            debugService.info('PIN modal opened for payment');
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
          debugService.debug('PIN modal forced to show');
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