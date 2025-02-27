<!-- lib/components/Payment.svelte -->
<script lang="ts">
  import { isAddress } from 'viem';
  import type { Address } from 'viem';
  import type { CardInfo } from '$lib/types.js';
  import NFCReader from './NFCReader.svelte';
  import { usePaymentState } from '$lib/stores/payments.js';
  import { useCardState } from '$lib/stores/card.js';
  import { nfcService } from '$lib/services/nfc.js';
  import { debugService } from '$lib/services/DebugService.js';
  import { walletService } from '$lib/services/wallet.js';
  
  let { onSubmit, onClose, showPinFn } = $props<{
    onSubmit: (to: Address, amount: string, pin: string) => Promise<void>;
    onClose: () => void;
    showPinFn?: (action: string, onPinSubmit: (pin: string) => Promise<void>) => void;
  }>();

  const paymentState = usePaymentState();
  const cardState = useCardState();

  let showNFCReader = $state(false);
  let address = $state('');
  let amount = $state('');
  let processingPayment = $state(false);
  let connectionAttempts = $state(0);
  
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
        showNFCReader = false;
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

  async function startNFCReading(e: Event) {
    // Prevent default behavior
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
      
      // After cleanup, show NFC reader
      debugService.info('Payment: Showing NFC reader');
      showNFCReader = true;
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
    
    // Show PIN modal using the parent's function if available
    if (showPinFn) {
      debugService.info('Payment: Using parent function to show PIN modal');
      
      // CORRECTION CRITIQUE: S'assurer que handlePinSubmit est correctement appelé
      // quand le PIN est soumis dans le modal
      showPinFn('payment', async (pin: string) => {
        // Cette fonction sera appelée par le PinModal
        debugService.info(`Payment: PIN received from modal, forwarding to handlePinSubmit`);
        return handlePinSubmit(pin);
      });
    } else {
      // Fallback for backward compatibility
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
        // Ajout d'un log plus détaillé
        debugService.info(`Payment: Attempt ${connectionAttempts} to connect with PIN: ${pin ? '****' : 'empty'}`);
        logStep(`Tentative de connexion avec le PIN fourni...`);
        
        connected = await walletService.connectCard(currentCard, pin);
        
        // Vérification explicite du résultat et logging détaillé
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
      
      // CORRECTION CRITIQUE: Attendre explicitement que la connexion soit établie
      // et vérifier que l'adresse est disponible avant de continuer
      logStep('Verifying wallet connection...');
      let connectionRetries = 0;
      const maxRetries = 5;
      
      while (!walletService.isConnected() && connectionRetries < maxRetries) {
        debugService.info(`Payment: Waiting for wallet connection (attempt ${connectionRetries + 1}/${maxRetries})...`);
        // Pause pour laisser le temps au wallet de se connecter
        await new Promise(resolve => setTimeout(resolve, 500));
        connectionRetries++;
      }
      
      if (!walletService.isConnected()) {
        debugService.error(`Payment: Failed to confirm wallet connection after ${maxRetries} attempts`);
        throw new Error('Impossible de confirmer la connexion du portefeuille');
      }
      
      // Vérifier explicitement que l'adresse est disponible
      const address = walletService.getAddress({ throwIfNotConnected: true });
      if (!address) {
        debugService.error(`Payment: Address not available after connection`);
        throw new Error("Adresse du portefeuille non disponible après connexion");
      }
      
      debugService.info(`Payment: Wallet confirmed connected with address ${address}`);
      logStep(`Wallet connected to address ${address}`);
      
      // Unlock card state AFTER successful connection
      logStep('Unlocking card state...');
      cardState.unlockCard();
      
      // Wait to ensure state changes are propagated
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Submit transaction with all information
      logStep(`Sending transaction: ${pendingAmount} MATIC to ${pendingTo}`);
      debugService.info(`Payment: Executing transaction: ${pendingAmount} MATIC to ${pendingTo}`);
      await onSubmit(pendingTo, pendingAmount, pin);
      
      // Cleanup after success
      logStep('✅ Transaction submitted successfully!');
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Payment failed';
      logStep(`❌ Transaction failed: ${errorMsg}`);
      debugService.error(`Payment: ❌ Transaction failed: ${errorMsg}`);
      error = errorMsg;
      
      // Lock card for security
      debugService.debug('Payment: Locking card after failure');
      cardState.lockCard();
      
      // Explicitly disconnect wallet on error
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

{#if showNFCReader}
  <NFCReader
    mode="payment"
    onRead={handleRecipientCardRead}
    onError={(message) => {
      error = message;
      debugService.error(`Payment: NFC reader error: ${message}`);
    }}
    onSuccess={() => {
      error = null;
      debugService.info('Payment: NFC reader completed successfully');
    }}
    onClose={() => {
      showNFCReader = false;
      error = null;
      debugService.info('Payment: NFC reader closed');
    }}
    updateCardState={false} 
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
{/if}