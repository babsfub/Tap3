<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { walletService } from '$lib/services/wallet.js';
  import { cryptoService } from '$lib/services/crypto.js';
  import CardDisplay from '$lib/components/CardDisplay.svelte';
  import CardActions from '$lib/components/CardActions.svelte';
  import TransactionHistory from '$lib/components/TransactionHistory.svelte';
  import PaymentModal from '$lib/components/Payment.svelte';
  import PinModal from '$lib/components/modals/PinModal.svelte';
  import QrCode from '$lib/components/QRcode.svelte';
  import { apiService } from '$lib/services/api.js';
  import NfcM from '$lib/components/modals/nfcPermission.svelte';
  import { useCardState } from '$lib/stores/card.js';
  import { useHistoryState } from '$lib/stores/history.js';
  import { usePaymentState } from '$lib/stores/payments.js';
  import type { CardInfo } from '$lib/types.js';
  import type { Address } from 'viem';
    import type { lib } from 'crypto-js';

  const cardState = useCardState();
  const historyState = useHistoryState();
  const paymentState = usePaymentState();

  let currentCardState = $derived(cardState.getState());
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showPaymentModal = $state(false);
  let showPinModal = $state(false);
  let showQRCode = $state(false);
  let showNFCPrompt = $state(false);
  let balanceInterval: number;
  let pendingPayment = $state(false);

  async function loadCard() {
    if (!browser) return;
    
    try {
        isLoading = true;
        error = null;

        const hash = window.location.hash;
        if (!hash) {
            throw new Error('No card data found');
        }

        const parsedCard = cryptoService.parseCardUrl(hash);
        if (!parsedCard || !parsedCard.id || !parsedCard.pub || !parsedCard.priv) {
            throw new Error('Invalid card data');
        }

        const design = await apiService.getCardDesign(parsedCard.id);
        const newCardInfo: CardInfo = {
            pub: parsedCard.pub as Address?? '',
            id: parsedCard.id,
            priv: parsedCard.priv as lib.WordArray?? '',
            svg: design.svg ?? 'default',
            css: design.css ?? '',
            model: design.id_model ?? 0
        };

        await walletService.initialize();
        cardState.setCard(newCardInfo);
        startBalancePolling();

    } catch (err) {
        console.error('Failed to load card:', err);
        error = err instanceof Error ? err.message : 'Failed to load card';
    } finally {
        isLoading = false;
    }
}

  function startBalancePolling() {
      if (!currentCardState.currentCard?.pub) return;
      
      if (balanceInterval) {
          clearInterval(balanceInterval);
      }
      
      balanceInterval = window.setInterval(async () => {
          await cardState.updateBalance();
      }, 12000);
  }

  async function handlePinSubmit(pin: string) {
      if (!currentCardState.currentCard) return;

      try {
          const success = await walletService.connectCard(currentCardState.currentCard, pin);
          if (success) {
              showPinModal = false;
              cardState.unlockCard();
          } else {
              throw new Error('Invalid PIN');
          }
      } catch (err) {
          error = err instanceof Error ? err.message : 'Failed to unlock card';
      }
  }

  function handleCardDetected(detectedCard: CardInfo) {
      showNFCPrompt = false;
      cardState.setCard(detectedCard);
      
      if (pendingPayment) {
          showPaymentModal = true;
          pendingPayment = false;
      }

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
      if (!currentCardState.currentCard?.pub) return;
      
      try {
          await navigator.clipboard.writeText(currentCardState.currentCard.pub);
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
      
      const handleHashChange = (event: HashChangeEvent) => {
          event.preventDefault(); 
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
  <div class="fixed top-0 left-0 right-0 bg-red-500 text-white p-4 text-center" role="alert">
      {error}
  </div>
{/if}

{#if currentCardState.currentCard && !isLoading}
  <div class="container mx-auto px-4 max-w-lg">
      <CardDisplay 
          cardInfo={currentCardState.currentCard}
          balance={cardState.getFormattedBalance()}
          onUnlock={() => showPinModal = true} 
      />
      
      <CardActions 
          onUnlock={() => showPinModal = true}
          onSend={initiatePayment} 
          onShowQR={() => showQRCode = true}
          onCopy={copyAddress}
          onBuyCrypto={() => {/* TODO */}}
          address={currentCardState.currentCard.pub}
          isUnlocked={!!currentCardState.currentCard.key}
      />

      {#if currentCardState.currentCard.key && historyState.getTransactionsByAddress(currentCardState.currentCard.pub).length > 0}
          <TransactionHistory 
              transactions={historyState.getTransactionsByAddress(currentCardState.currentCard.pub)} 
          />
      {/if}
  </div>
{/if}

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

{#if showQRCode && currentCardState.currentCard?.pub}
  <QrCode
      address={currentCardState.currentCard.pub}
      onClose={() => showQRCode = false}
  />
{/if}