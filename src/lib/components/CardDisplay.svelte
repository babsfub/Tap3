<!-- lib/components/CardDisplay.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardInfo } from '$lib/types.js';
  import { resourceService } from '$lib/services/ResourceService.js';
  import { debugService } from '$lib/services/DebugService.js';
  import { AddressUtils } from '$lib/utils/AddressUtils.js';

  let props = $props<{
    cardInfo: CardInfo;
    balance: string;
    onUnlock?: () => void;
    isLocked?: boolean; 
  }>();

  // Resource states
  let svgContent = $state('');
  let cardStyle = $state('');
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  
  // Direct formatting functions to avoid passing functions to display
  let formattedCardId = $derived(props.cardInfo ? 
    props.cardInfo.id.toString().padStart(4, '0') : '0000');
    
  let formattedAddress = $derived(props.cardInfo?.pub ? 
    AddressUtils.formatAddress(props.cardInfo.pub, true) : '');

  /**
   * Apply CSS just like in the original app.svelte
   */
  function applyCssFromModel(css: string, model?: number): string {
    // Start with a base style
    let baseStyle = '';
    
    // Apply model-specific background colors exactly as in app.svelte
    switch (model) {
      case 4:
        baseStyle = 'background-color: black; ';
        break;
      case 5:
        baseStyle = 'background-color: #c7252b; ';
        break;
      case 6:
        baseStyle = 'background-color: #006faf; ';
        break;
      default:
        baseStyle = 'background-color: white; ';
    }
    
    // Combine base style with provided CSS
    return baseStyle + (css || '');
  }

  /**
   * Load and process card style, following original app.svelte pattern
   */
  async function loadCardStyle() {
    if (!props.cardInfo) return '';
    
    try {
      let cardCss = props.cardInfo.css || '';
      
      // Apply CSS based on card model
      const appliedCss = applyCssFromModel(cardCss, props.cardInfo.model);
      
      // Fix URLs and other cleanup through resourceService
      const cleanedCss = resourceService.fixCssUrls(appliedCss);
      
      // Preload resources in background
      void resourceService.preloadCardResources(
        cleanedCss, 
        props.cardInfo.svg
      );
      
      return cleanedCss;
    } catch (error) {
      debugService.error(`Failed to load card style: ${error}`);
      loadError = error instanceof Error ? error.message : 'Style loading failed';
      
      // Apply fallback based on model
      return applyCssFromModel('', props.cardInfo.model);
    }
  }

  /**
   * Load card SVG content
   */
  async function loadCardSvg() {
    if (!props.cardInfo) return '';
    
    try {
      if (!props.cardInfo.svg) {
        return resourceService.loadCardSvg('default');
      }
      return await resourceService.loadCardSvg(props.cardInfo.svg);
    } catch (error) {
      debugService.error(`Failed to load card SVG: ${error}`);
      loadError = error instanceof Error ? error.message : 'SVG loading failed';
      
      // Create a simple fallback SVG to ensure something renders
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190">
        <rect width="100%" height="100%" fill="transparent" />
      </svg>`;
    }
  }

  /**
   * Initialize card resources
   */
  async function initializeCard() {
    if (!props.cardInfo) return;
    
    isLoading = true;
    loadError = null;
    
    try {
      // Load resources in parallel for efficiency
      const [styleResult, svgResult] = await Promise.all([
        loadCardStyle(),
        loadCardSvg()
      ]);
      
      cardStyle = styleResult;
      svgContent = svgResult;
    } catch (error) {
      debugService.error(`Card initialization error: ${error}`);
      loadError = error instanceof Error ? error.message : 'Card initialization failed';
    } finally {
      isLoading = false;
    }
  }

  // Initialize on mount and when card changes
  onMount(() => {
    void initializeCard();
  });
  
  $effect(() => {
    if (props.cardInfo && props.cardInfo.id) {
      void initializeCard();
    }
  });

  // Log the locked state to debug
  $effect(() => {
    debugService.debug(`Card locked state: ${props.isLocked}`);
  });
</script>

<div class="w-full max-w-[428px] mx-auto">
  {#if isLoading}
    <div class="w-full relative shadow-xl rounded-lg overflow-hidden mb-6 bg-gray-200 dark:bg-gray-700 animate-pulse" style="padding-top: 63.8%;">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  {:else}
    <div 
      class="w-full relative shadow-xl rounded-lg overflow-hidden mb-6"
      style={cardStyle}
    >
      <div class="w-full relative" style="padding-top: 63.8%;">
        <!-- SVG Content - using {@html} to render -->
        {#if svgContent}
          <div class="absolute inset-0" aria-hidden="true">
            {@html svgContent}
          </div>
        {/if}

        <!-- Card ID -->
        <div class="cardId">
          #{formattedCardId}
        </div>
        
        <!-- Card Address - direct formatted text -->
        <div class="cardAddr">
          {formattedAddress}
        </div>
        
        <!-- Balance -->
        <div class="nativeBalance">
          <div class="text-sm opacity-75">Balance</div>
          <div class="font-bold">{props.balance} MATIC</div>
        </div>

        <!-- Unlock Button (if locked) -->
        {#if props.isLocked === true && props.onUnlock}
          <div class="absolute inset-0 flex items-center justify-center bg-black/30">
            <button
              onclick={props.onUnlock}
              class="px-4 py-2 bg-white text-black rounded shadow 
                   hover:bg-gray-100 transition-colors"
            >
              🔒 Unlock Card
            </button>
          </div>
        {/if}
      </div>
    </div>
    
    {#if loadError}
      <div class="text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 p-2 rounded mb-4">
        Resource loading notice: {loadError}
      </div>
    {/if}
  {/if}
</div>

<style>
  .cardId {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    font-weight: bold;
    font-size: 1.25rem;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    color: white;
  }

  .cardAddr {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    font-size: 1rem;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    color: white;
  }

  .nativeBalance {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    color: white;
    text-align: right;
  }
</style>