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
    import NFCPromptModal from '$lib/components/modals/NFCPermission.svelte';
    import type { CardInfo } from '$lib/types.js';
    import type { Address } from 'viem';
  
    
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
      pub: parsedCard.pub ?? '',
      id: parsedCard.id ?? 0,
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
    }

  async function handlePaymentSubmit(to: Address, amount: string) {
    if (!cardInfo) return;

    try {
      const tx = await walletService.sendTransaction({
        to,
        value: amount
      });

      historyState.addTransaction({
        hash: tx.hash,
        timestamp: Date.now(),
        from: cardInfo.pub,
        to,
        amount,
        status: 'pending'
      });
      
      showPaymentModal = false;
    } catch (err) {
      throw err;
    }
  }

  async function copyAddress() {
    if (!cardInfo?.pub) return;
    
    try {
      await navigator.clipboard.writeText(cardInfo.pub);
      // Feedback visuel temporaire
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

    // Gestion des changements d'URL
    const handleHashChange = () => void loadCard();
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
        onSend={() => showPaymentModal = true}
        onShowQR={() => showQRCode = true}
        onCopy={copyAddress}
      />
  
      {#if historyState.getTransactionsByAddress(cardInfo.pub).length > 0}
        <TransactionHistory 
          transactions={historyState.getTransactionsByAddress(cardInfo.pub)} 
        />
      {/if}
    </div>
  {/if}

  {#if showNFCPrompt}
    <NFCPromptModal
        mode="read"
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
  
  {#if showQRCode}
    {#if cardInfo?.pub}
      <QrCode
        address={cardInfo.pub}
        onClose={() => showQRCode = false}
      />
    {/if}
  {/if}