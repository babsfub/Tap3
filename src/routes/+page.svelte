<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { walletService } from '$lib/services/wallet.js';
    import { cryptoService } from '$lib/services/crypto.js';
    import { initializeHistoryState } from '$lib/stores/history.js';
    import { initializePaymentState } from '$lib/stores/payments.js';
    import { initializePreferencesState } from '$lib/stores/preferences.js';
    import CardDisplay from '$lib/components/CardDisplay.svelte';
    import CardActions from '$lib/components/CardActions.svelte';
    import TransactionHistory from '$lib/components/TransactionHistory.svelte';
    import PaymentModal from '$lib/components/Payment.svelte';
    import PinModal from '$lib/components/modals/PinModal.svelte';
    import QrCode from '$lib/components/QRcode.svelte';
    import { apiService } from '$lib/services/api.js';
    import NfcM from '$lib/components/modals/nfcPermission.svelte';
    import type { CardInfo } from '$lib/types.js';
    import type { Address } from 'viem';
    import type { lib } from 'crypto-js';
  
    
     // Initialize stores
  const historyState = initializeHistoryState();
  const paymentState = initializePaymentState();
  const preferencesState = initializePreferencesState();

  // Reactive state
  let cardInfo = $state<CardInfo | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showPaymentModal = $state(false);
  let showPinModal = $state(false);
  let showQRCode = $state(false);
  let balance = $state<string>('0');
  let showNFCPrompt = $state(false);

  // Polling interval reference
  let balanceInterval: number;
  let pendingPayment = $state(false);

  // Dans +page.svelte
async function loadCard() {
  if (!browser) return;
  
  try {
    isLoading = true;
    error = null;

    const hash = window.location.hash;
    if (!hash) {
      throw new Error('No card data found');
    }

    // Parser les données de la carte depuis l'URL
    const parsedCard = cryptoService.parseCardUrl(hash);
    if (!parsedCard) {
      throw new Error('Invalid card data');
    }

    // Récupérer le design et le style de la carte depuis l'API
    if (parsedCard.id === undefined) {
      throw new Error('Card ID is undefined');
    }
    const design = await apiService.getCardDesign(parsedCard.id);
    
    // Combiner les données
    cardInfo = {
      pub: parsedCard.pub as Address ?? '',
      id: parsedCard.id ?? 0,
      priv: parsedCard.priv as lib.WordArray,
      svg: design.svg,
      css: design.css,
      model: design.id_model
    };

    // Initialiser le wallet service
    await walletService.initialize();
    
    // Charger le solde initial
    if (!cardInfo) throw new Error('Card info is null');
    const balanceInfo = await walletService.getBalance(cardInfo.pub);
    balance = balanceInfo.formatted;

  } catch (err) {
    console.error('Failed to load card:', err);
    error = err instanceof Error ? err.message : 'Failed to load card';
  } finally {
    isLoading = false;
  }
}



  function startBalancePolling() {
    if (!cardInfo?.pub) return;
    
    balanceInterval = window.setInterval(async () => {
      try {
        const balanceInfo = await walletService.getBalance(cardInfo!.pub);
        balance = balanceInfo.formatted;
      } catch (err) {
        console.error('Failed to fetch balance:', err);
      }
    }, 12000);
  }

  async function handlePinSubmit(pin: string) {
    if (!cardInfo) return;

    try {
      const success = await walletService.connectCard(cardInfo, pin);
      if (success) {
        showPinModal = false;
        // Sauvegarder la dernière adresse utilisée
        preferencesState.addRecentAddress(cardInfo.pub);
      } else {
        throw new Error('Invalid PIN');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to unlock card';
    }
  }

  function handleCardDetected(detectedCard: CardInfo) {
    showNFCPrompt = false;
    cardInfo = detectedCard;
    
    if (pendingPayment) {
        showPaymentModal = true;
        pendingPayment = false;
    }

    void walletService.getBalance(detectedCard.pub).then(balanceInfo => {
        balance = balanceInfo.formatted;
    });
    startBalancePolling();
}


async function handlePaymentSubmit(to: Address, amount: string, pin: string) {
    try {
        await paymentState.sendTransaction(to, amount, pin);
        showPaymentModal = false;
    } catch (error) {
        
        console.error('Payment failed:', error);
    }
}

  async function copyAddress() {
    if (!cardInfo?.pub) return;
    
    try {
      await navigator.clipboard.writeText(cardInfo.pub);
      document.body.style.backgroundColor = 'green';
      setTimeout(() => {
        document.body.style.backgroundColor = '';
      }, 1000);
    } catch (err) {
      error = 'Failed to copy address';
    }
  }

  function initiatePayment() {
        pendingPayment = true;
        showNFCPrompt = true;
    }
  

    onMount(() => {
      void loadCard();
      startBalancePolling();

      // Gestion des changements d'URL sans recharger la page
      const handleHashChange = (event: HashChangeEvent) => {
        event.preventDefault(); // Empêcher le rechargement par défaut
        void loadCard();
      };

      window.addEventListener('hashchange', handleHashChange);
      
      return () => {
        window.removeEventListener('hashchange', handleHashChange);
        if (balanceInterval) {
          clearInterval(balanceInterval);
        }
        void walletService.disconnect();
      };
    });
        
  </script>
  
  <svelte:head>
    <title>Tap3 Card Wallet</title>
  </svelte:head>
  
  {#if isLoading}
    <div class="fixed inset-0 flex items-center justify-center bg-black/50">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
    </div>
  {/if}
  
  {#if error}
    <div 
      class="fixed top-0 left-0 right-0 bg-red-500 text-white p-4 text-center"
      role="alert"
    >
      {error}
    </div>
  {/if}
  
  {#if cardInfo && !isLoading}
    <div class="container mx-auto px-4 max-w-lg">
      <CardDisplay 
        {cardInfo} 
        {balance} 
        onUnlock={() => showPinModal = true} 
      />
      
      <CardActions 
        onUnlock={() => showPinModal = true}
        onSend={initiatePayment} 
        onShowQR={() => showQRCode = true}
        onCopy={copyAddress}
        onBuyCrypto={() => {/* TODO */}}
        address={cardInfo?.pub}
        isUnlocked={!!cardInfo?.key}
      />
  
      <!-- Historique conditionné au déverrouillage -->
      {#if cardInfo?.key && historyState.getTransactionsByAddress(cardInfo.pub).length > 0}
        <TransactionHistory 
          transactions={historyState.getTransactionsByAddress(cardInfo.pub)} 
        />
      {/if}
    </div>
  {/if}
  
  <!-- Modaux -->
  {#if showNFCPrompt}
    <NfcM
      onCardDetected={handleCardDetected}
      onClose={() => {
        showNFCPrompt = false;
        pendingPayment = false;
      }}
    />
  {/if}
  
  {#if showPaymentModal}
    <PaymentModal
      onSubmit={handlePaymentSubmit}
      onClose={() => showPaymentModal = false}
    />
  {/if}
  
  {#if showPinModal}
    <PinModal
      onSubmit={handlePinSubmit}
      onClose={() => showPinModal = false}
    />
  {/if}
  
  {#if showQRCode && cardInfo?.pub}
    <QrCode
      address={cardInfo.pub}
      onClose={() => showQRCode = false}
    />
  {/if}