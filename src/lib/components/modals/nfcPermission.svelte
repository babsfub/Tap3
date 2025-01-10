
<!-- lib/components/modals/nfcPermission.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { cryptoService } from '$lib/services/crypto.js';
  import { apiService } from '$lib/services/api.js';
  import type { CardInfo } from '$lib/types.js';
  import type { Address } from 'viem';
  import type { lib } from 'crypto-js';

  interface Props {
    onCardDetected: (cardInfo: CardInfo) => void;
    onClose: () => void;
  }

  let { onCardDetected, onClose }: Props = $props();
  let isWaitingForLink = $state(false);

  async function handleHashChange() {
    if (!browser || !window.location.hash) return;

    try {
      const parsedCard = cryptoService.parseCardUrl(window.location.hash);
      if (!parsedCard?.id || !parsedCard.pub || !parsedCard.priv) {
        throw new Error('Invalid card data');
      }

      const [design, style] = await Promise.all([
        apiService.getCardDesign(parsedCard.id),
        apiService.getCardStyle(parsedCard.id)
      ]);

      // S'assurer que toutes les propriétés requises sont présentes
      const cardInfo: CardInfo = {
        id: parsedCard.id,
        pub: parsedCard.pub as Address,
        priv: parsedCard.priv as lib.WordArray,
        css: style.css,
        model: style.model,
        svg: design.svg
      };

      const isValid = await apiService.verifyCard(
        cardInfo.id,
        cryptoService.generateCardUrl(cardInfo)
      );

      if (isValid) {
        isWaitingForLink = false;
        onCardDetected(cardInfo);
        onClose();
      }
    } catch (error) {
      console.error('Failed to process card data:', error);
    }
  }

  onMount(() => {
    isWaitingForLink = true;
    window.addEventListener('hashchange', handleHashChange);
    
    // Vérifier le hash initial si présent
    if (window.location.hash) {
      void handleHashChange();
    }
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  });
</script>




<div 
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
>
  <div class="max-w-md w-full mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-bold dark:text-white">
          Scan Card
        </h2>
        <button
          onclick={onClose}
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                 transition-colors"
          aria-label="Close"
        >
          <span class="text-2xl">×</span>
        </button>
      </div>
    </div>

    <div class="p-6">
      <div class="text-center space-y-6">
        <p class="text-gray-600 dark:text-gray-300">
          Please scan your card with an NFC reader and use the provided link.
        </p>
        
        <div class="w-32 h-32 mx-auto">
          <img 
            src="/images/scan-card.svg" 
            alt="Scan card illustration"
            class="w-full h-full"
          />
        </div>

        <p class="text-sm text-gray-500 dark:text-gray-400">
          The browser window will automatically update once the card is scanned.
        </p>
      </div>
    </div>

    <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
      <button
        type="button"
        class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg
               hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
               dark:hover:bg-gray-600 transition-colors"
        onclick={onClose}
      >
        Cancel
      </button>
    </div>
  </div>
</div>