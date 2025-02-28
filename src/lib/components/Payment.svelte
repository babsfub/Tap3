<!-- lib/components/Payment.svelte -->
<script lang="ts">
  import { isAddress } from 'viem';
  import type { Address } from 'viem';
  import type { CardInfo } from '$lib/types.js';
  import { usePaymentState } from '$lib/stores/payments.js';
  import { useCardState } from '$lib/stores/card.js';
  import { nfcService } from '$lib/services/nfc.js';
  import { debugService } from '$lib/services/DebugService.js';
  import { walletService } from '$lib/services/wallet.js';
  
  let { onSubmit, onClose, showPinFn, reusePreviousPin = false } = $props<{
    onSubmit: (to: Address, amount: string, pin: string) => Promise<void>;
    onClose: () => void;
    showPinFn?: (action: string, onPinSubmit: (pin: string) => Promise<void>) => void;
    reusePreviousPin?: boolean; // Nouvelle prop pour réutiliser le PIN précédent
  }>();

  const paymentState = usePaymentState();
  const cardState = useCardState();

  // État des composants - mode scan par défaut
  let scanMode = $state(true); // Commencer directement en mode scan
  let address = $state('');
  let amount = $state('');
  let processingPayment = $state(false);
  let connectionAttempts = $state(0);
  
  // États dérivés
  let currentCard = $derived(cardState.getState().currentCard);
  let paymentStatus = $derived(paymentState.getState().status);
  let error = $state<string | null>(null);
  let isLoading = $derived(paymentStatus === 'loading' || processingPayment);

  let pendingTo = $state<Address | null>(null);
  let pendingAmount = $state<string | null>(null);

  let isValidAddress = $derived(isAddress(address as Address));
  let isValidAmount = $derived(parseFloat(amount) > 0);
  let canSubmit = $derived(isValidAddress && isValidAmount && !isLoading && currentCard);
  
  // Mode débogage pour tracer le processus de paiement
  let debugSteps = $state<string[]>([]);
  function logStep(step: string) {
    debugSteps = [...debugSteps, `${new Date().toISOString().split('T')[1]}: ${step}`];
    debugService.info(`Payment process: ${step}`);
  }

  // Fonction pour gérer la lecture de la carte destinataire
  async function handleRecipientCardRead(cardInfo: CardInfo) {
    try {
      debugService.info(`Payment: Recipient card read, ID: ${cardInfo.id}`);
      
      // Stop reading immediately
      await nfcService.stopReading().catch(e => {
        debugService.warn(`Payment: Error stopping NFC reader: ${e}`);
      });
      
      // Small delay to ensure proper cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (cardInfo.pub) {
        // Check it's not the same card
        if (currentCard?.pub && cardInfo.pub === currentCard.pub) {
          const errorMsg = "Cannot send to the same card";
          debugService.error(`Payment: ❌ ${errorMsg}`);
          error = errorMsg;
          return;
        }
        
        // Update address and hide NFC reader
        debugService.info(`Payment: Recipient address set: ${cardInfo.pub}`);
        address = cardInfo.pub;
        scanMode = false; // Désactiver le mode scan après lecture réussie
        error = null;
      } else {
        const errorMsg = 'Invalid recipient card - missing address';
        debugService.error(`Payment: ❌ ${errorMsg}`);
        error = errorMsg;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error processing recipient card';
      debugService.error(`Payment: ❌ Error processing card: ${errorMsg}`);
      error = errorMsg;
    }
  }

  // Fonction pour basculer entre les modes de saisie d'adresse
  function toggleInputMode() {
    scanMode = !scanMode;
    
    if (scanMode) {
      // Activer directement le lecteur NFC quand on passe en mode scan
      void startNFCReading();
    }
  }

  // Démarrer la lecture NFC
  async function startNFCReading(e?: Event) {
    // Prevent default behavior if called from event
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    
    error = null;
    
    try {
      debugService.info('Payment: Starting NFC reading for recipient card...');
      
      // Make sure reader is stopped before starting
      await nfcService.stopReading().catch((e) => {
        debugService.warn(`Payment: Error stopping NFC reader: ${e}`);
      });
      
      // Longer delay to ensure proper cleanup
      debugService.debug('Payment: Waiting before restarting NFC reader...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Activer directement le lecteur NFC sans passer par showNFCReader
      await nfcService.startReading({
        mode: 'payment',
        onRead: ({ cardInfo, isValid }) => {
          if (!isValid) {
            error = 'Invalid card';
            return;
          }
          void handleRecipientCardRead(cardInfo);
        },
        onError: (err) => {
          error = err.message;
          debugService.error(`Payment: NFC reader error: ${err.message}`);
        },
        onStateChange: (state) => {
          debugService.debug(`Payment: NFC reader state: ${state}`);
        }
      });
      
      debugService.info('Payment: NFC reader started successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start NFC reader';
      debugService.error(`Payment: ❌ ${errorMsg}`);
      error = errorMsg;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) {
      debugService.warn('Payment: Attempted submission with invalid form');
      return;
    }
    
    debugService.info(`Payment: 📝 Transaction requested: ${amount} MATIC to ${address}`);
    
    // Store values for confirmation
    pendingTo = address as Address;
    pendingAmount = amount;
    
    // Reset debug steps
    debugSteps = [];
    logStep('Transaction initiated');
    
    // Si reusePreviousPin est true et que walletService est connecté,
    // on peut procéder directement au paiement sans demander le PIN
    if (reusePreviousPin && walletService.isConnected()) {
      debugService.info('Payment: Wallet already connected, processing payment without PIN');
      try {
        await handlePaymentWithoutPin();
      } catch (error) {
        // En cas d'erreur, on revient à la demande de PIN classique
        debugService.warn(`Payment: Direct payment failed, falling back to PIN: ${error}`);
        requestPIN();
      }
    } else {
      // Demander le PIN normalement
      requestPIN();
    }
  }
  
  // Nouvelle fonction pour traiter le paiement sans PIN
  async function handlePaymentWithoutPin() {
    if (!pendingTo || !pendingAmount || !currentCard) {
      throw new Error('Données de transaction incomplètes');
    }
    
    logStep('Processing transaction without PIN request...');
    processingPayment = true;
    
    try {
      // On utilise une chaîne vide comme PIN car le wallet est déjà connecté
      await onSubmit(pendingTo, pendingAmount, '');
      logStep('✅ Transaction submitted successfully!');
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Payment failed';
      logStep(`❌ Transaction failed: ${errorMsg}`);
      error = errorMsg;
      throw err;
    } finally {
      processingPayment = false;
      pendingTo = null;
      pendingAmount = null;
    }
  }
  
  // Fonction pour demander le PIN
  function requestPIN() {
    if (showPinFn) {
      debugService.info('Payment: Using parent function to show PIN modal');
      showPinFn('payment', async (pin: string) => {
        debugService.info(`Payment: PIN received from modal, forwarding to handlePinSubmit`);
        return handlePinSubmit(pin);
      });
    } else {
      debugService.warn('Payment: No showPinFn provided, cannot show PIN modal');
      error = 'Cannot proceed with payment: PIN verification not available';
    }
  }

  async function handlePinSubmit(pin: string): Promise<void> {
    if (!pendingTo || !pendingAmount || !currentCard) {
      debugService.error('Payment: Incomplete transaction data when submitting PIN');
      logStep('❌ Incomplete transaction data');
      throw new Error('Données de transaction incomplètes');
    }
    
    logStep('PIN submitted, processing transaction...');
    debugService.info(`Payment: PIN submitted, processing transaction...`);
    connectionAttempts = 0;
    
    try {
      // Show we're processing
      processingPayment = true;
      
      // Initialize WalletKit explicitly before connecting
      logStep('Ensuring wallet service is initialized...');
      try {
        const initialized = await walletService.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize wallet service');
        }
        logStep('Wallet service initialized successfully');
      } catch (initError) {
        logStep(`❌ Wallet initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
        throw new Error(`Wallet initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}`);
      }
      
      // Connect card with PIN - clear logging for debugging
      logStep('Connecting card with PIN...');
      let connected = false;
      
      connectionAttempts++;
      try {
        debugService.info(`Payment: Attempt ${connectionAttempts} to connect with PIN: ${pin ? '****' : 'empty'}`);
        logStep(`Tentative de connexion avec le PIN fourni...`);
        
        connected = await walletService.connectCard(currentCard, pin);
        
        if (!connected) {
          debugService.error(`Payment: Connection result is false - PIN likely incorrect`);
          logStep(`Échec de connexion - le PIN est probablement incorrect`);
          throw new Error('PIN incorrect. Veuillez vérifier votre mot de passe et réessayer.');
        } else {
          debugService.info(`Payment: Card successfully connected!`);
          logStep(`Carte connectée avec succès`);
        }
      } catch (connError) {
        debugService.error(`Payment: Connection error: ${connError instanceof Error ? connError.message : String(connError)}`);
        logStep(`❌ Erreur de connexion: ${connError instanceof Error ? connError.message : String(connError)}`);
        throw new Error(`Échec de connexion: ${connError instanceof Error ? connError.message : 'PIN incorrect'}`);
      }
      
      // Vérifier la connexion du wallet
      logStep('Verifying wallet connection...');
      let connectionRetries = 0;
      const maxRetries = 5;
      
      while (!walletService.isConnected() && connectionRetries < maxRetries) {
        debugService.info(`Payment: Waiting for wallet connection (attempt ${connectionRetries + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        connectionRetries++;
      }
      
      if (!walletService.isConnected()) {
        debugService.error(`Payment: Failed to confirm wallet connection after ${maxRetries} attempts`);
        throw new Error('Impossible de confirmer la connexion du portefeuille');
      }
      
      // Vérifier l'adresse
      const address = walletService.getAddress({ throwIfNotConnected: true });
      if (!address) {
        debugService.error(`Payment: Address not available after connection`);
        throw new Error("Adresse du portefeuille non disponible après connexion");
      }
      
      debugService.info(`Payment: Wallet confirmed connected with address ${address}`);
      logStep(`Wallet connected to address ${address}`);
      
      // Déverrouiller la carte localement
      logStep('Unlocking card state...');
      cardState.unlockCard();
      
      // Attendre que les changements d'état se propagent
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Soumettre la transaction
      logStep(`Sending transaction: ${pendingAmount} MATIC to ${pendingTo}`);
      debugService.info(`Payment: Executing transaction: ${pendingAmount} MATIC to ${pendingTo}`);
      await onSubmit(pendingTo, pendingAmount, pin);
      
      // Nettoyage après succès
      logStep('✅ Transaction submitted successfully!');
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Payment failed';
      logStep(`❌ Transaction failed: ${errorMsg}`);
      debugService.error(`Payment: ❌ Transaction failed: ${errorMsg}`);
      error = errorMsg;
      
      // Verrouiller la carte pour la sécurité
      debugService.debug('Payment: Locking card after failure');
      cardState.lockCard();
      
      // Déconnecter le wallet en cas d'erreur
      try {
        await walletService.disconnect();
        debugService.debug('Payment: Wallet disconnected after failure');
      } catch (disconnectErr) {
        debugService.warn(`Payment: Failed to disconnect wallet: ${disconnectErr}`);
      }
    } finally {
      processingPayment = false;
      pendingTo = null;
      pendingAmount = null;
    }
  }
</script>

<header class="mb-6 flex justify-between items-center">
  <h2 id="modal-title" class="text-xl font-bold dark:text-white">Send Payment</h2>
  <button 
    onclick={onClose} 
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

{#if debugSteps.length > 0 && import.meta.env.DEV}
  <div class="mb-4 p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono overflow-y-auto max-h-32">
    <h3 class="font-bold mb-1">Debug log:</h3>
    <ol class="list-decimal pl-5 space-y-1">
      {#each debugSteps as step}
        <li>{step}</li>
      {/each}
    </ol>
  </div>
{/if}

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <div class="flex justify-between items-center mb-2">
      <label for="address" class="font-medium dark:text-gray-200">
        Recipient
      </label>
      <button 
        type="button" 
        onclick={toggleInputMode}
        class="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        {scanMode ? 'Enter Address Manually' : 'Scan Card'}
      </button>
    </div>
    
    {#if scanMode}
      <!-- Mode scan - Lecteur NFC directement intégré -->
      <div class="p-4 border rounded-md bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div class="text-center">
          <p class="mb-4 text-blue-700 dark:text-blue-300">
            Hold recipient card near your device
          </p>
          <div class="w-12 h-12 mx-auto rounded-full border-4 border-blue-500 
                    border-t-transparent animate-spin"></div>
        </div>
      </div>
    {:else}
      <!-- Mode manuel - Input d'adresse -->
      <input
        id="address"
        type="text"
        bind:value={address}
        placeholder="0x..."
        class="w-full p-2 border rounded-md dark:bg-gray-700 
               dark:border-gray-600 dark:text-white" 
        class:border-red-500={!isValidAddress && address}
        disabled={isLoading}
      />
    {/if}
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
      onclick={() => {
        onClose();
        debugService.info('Payment: Modal closed by user');
      }}
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
