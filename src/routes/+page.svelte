<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { walletService } from '$lib/services/wallet.js';
  import { cryptoService } from '$lib/services/crypto.js';
  import { debugService } from '$lib/services/DebugService.js';
  import { useCardState } from '$lib/stores/card.js';
  import { AddressUtils } from '$lib/utils/AddressUtils.js';
  import Wallet from '$lib/components/wallet.svelte';
  import { apiService } from '$lib/services/api.js';
  import NFCModal from '$lib/components/modals/nfcPermission.svelte';
  import type { CardInfo } from '$lib/types.js';

  // Get card state
  const cardState = useCardState();

  // Page state
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showNFCPrompt = $state(false);
  let cardLoaded = $state(false);

  // Load card data from URL hash
  async function loadCard(): Promise<void> {
    if (!browser) return;
    
    try {
      isLoading = true;
      error = null;
      
      const hash = window.location.hash;
      if (!hash) {
        debugService.warn('No card data found in URL hash');
        isLoading = false;
        return;
      }
      
      debugService.info('Parsing card data from URL hash');
      const parsedCard = cryptoService.parseCardUrl(hash);
      if (!parsedCard || !parsedCard.id || !parsedCard.pub) {
        throw new Error('Invalid card data format');
      }
      
      // Support for both legacy and new card formats
      const address = AddressUtils.normalizeAddress(parsedCard.pub);
      if (!address) {
        throw new Error('Invalid card address format');
      }
      
      // Load card design and metadata
      const design = await apiService.getCardDesign(parsedCard.id);
      const newCardInfo: CardInfo = {
        pub: address,
        id: parsedCard.id,
        priv: parsedCard.priv,
        svg: design.svg || 'default',
        css: design.css || '',
        model: design.id_model || 0
      };
      
      // Initialize wallet and update card state
      await walletService.initialize();
      cardState.setCard(newCardInfo);
      cardLoaded = true;
      
      debugService.info(`Card loaded successfully: ID=${parsedCard.id}`);
    } catch (err) {
      debugService.error(`Failed to load card: ${err}`);
      error = err instanceof Error ? err.message : 'Failed to load card';
    } finally {
      isLoading = false;
    }
  }

  // Handle NFC card detection
  function handleCardDetected(detectedCard: CardInfo): void {
    showNFCPrompt = false;
    cardState.setCard(detectedCard);
    cardLoaded = true;
  }

  // Lifecycle hooks
  onMount(() => {
    debugService.info('Tap3 application mounted');
    void loadCard();
    
    // Listen for hash changes to reload card data
    const handleHashChange = (event: HashChangeEvent) => {
      debugService.info('URL hash changed, reloading card data');
      event.preventDefault(); 
      void loadCard();
    };

    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      void walletService.disconnect();
      debugService.info('Tap3 application cleaned up');
    };
  });
</script>

<svelte:head>
  <title>Tap3 Card Wallet</title>
  <meta name="description" content="Tap3 Card - Your NFC crypto wallet" />
</svelte:head>

{#if isLoading}
  <div class="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
    <div class="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent"></div>
  </div>
{/if}

{#if error}
  <div class="fixed top-0 left-0 right-0 bg-red-500 text-white p-4 text-center z-40" role="alert">
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

<!-- Main content -->
{#if cardLoaded && !isLoading}
  <Wallet />
{:else if !isLoading}
  <div class="container mx-auto px-4 py-12 max-w-lg text-center">
    <h1 class="text-2xl font-bold mb-4">Welcome to Tap3</h1>
    <p class="mb-6">Scan your Tap3 card to get started</p>
    <button 
      class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg transition-colors"
      onclick={() => showNFCPrompt = true}
    >
      Scan Card
    </button>
  </div>
{/if}

<!-- NFC Prompt Modal -->
{#if showNFCPrompt}
  <NFCModal
    onCardDetected={handleCardDetected}
    onClose={() => showNFCPrompt = false}
  />
{/if}