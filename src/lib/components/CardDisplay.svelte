<!-- lib/components/CardDisplay.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardInfo } from '$lib/types.js';
  import { debugService } from '$lib/services/DebugService.js';
  import { AddressUtils } from '$lib/utils/AddressUtils.js';

  // Props definitions
  let props = $props<{
    cardInfo: CardInfo;
    balance: string;
    onUnlock?: () => void;
    isLocked?: boolean; 
    txCount?: number;
  }>();

  // States - using basic variables to avoid circular references
  let svgContent = $state('');
  let cardStyle = $state('');
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let hasRenderedSvg = $state(false);
  let transactionCount = $state<number | undefined>(undefined);
  let formattedCardId = $state('0000');
  let formattedAddress = $state('');
  
  // Format card ID
  function formatCardId(num?: number): string {
    if (!num) return '0000';
    return num.toString().padStart(4, '0');
  }
  
  // Update derived data manually (avoiding $derived)
  function updateDerivedData(): void {
    if (props.cardInfo) {
      formattedCardId = formatCardId(props.cardInfo.id);
      formattedAddress = props.cardInfo.pub ? 
        AddressUtils.formatAddress(props.cardInfo.pub, true) : '';
    }
    
    // Update transaction count
    if (props.txCount !== undefined) {
      transactionCount = props.txCount;
    } else if (props.cardInfo && 'tx_count' in props.cardInfo) {
      transactionCount = props.cardInfo.tx_count as number;
    }
  }

  /**
   * Create background style based on card model
   */
  function createCardStyle(cardInfo?: CardInfo): string {
    if (!cardInfo || !cardInfo.css) {
      return getModelStyle(cardInfo?.model);
    }
    
    // Fix URLs in CSS
    let css = cardInfo.css.replace(
      /url\(['"]?(?:\.\/)?bgs\//g, 
      `url('/bgs/`
    );
    
    // Improve rendering
    css = css.replace(/contain/g, 'cover').replace(/\s+/g, ' ').trim();
    
    // Combine with base style
    return getModelStyle(cardInfo.model) + css;
  }
  
  /**
   * Get base style for card model
   */
  function getModelStyle(model?: number): string {
    switch (model) {
      case 4: return 'background-color: black; ';
      case 5: return 'background-color: #c7252b; ';
      case 6: return 'background-color: #006faf; ';
      default: return 'background-color: white; ';
    }
  }

  /**
   * Create inline SVG
   */
  function createInlineSvg(id: string, address: string, balance: string, model?: number): string {
    // Determine background color based on model
    let bgColor = '#FFFFFF';
    let textColor = '#333333';
    let secondaryColor = '#666666';
    let tertiaryColor = '#888888';
    
    if (model === 4) {
      bgColor = '#000000';
      textColor = '#FFFFFF';
      secondaryColor = '#FFFFFF';
      tertiaryColor = '#FFFFFF';
    } else if (model === 5) {
      bgColor = '#c7252b';
      textColor = '#FFFFFF';
    } else if (model === 6) {
      bgColor = '#006faf';
      textColor = '#FFFFFF';
    }
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190">
      <rect width="100%" height="100%" fill="${bgColor}" />
      <text x="50%" y="30%" font-family="Arial" font-size="16" 
        text-anchor="middle" dominant-baseline="middle" fill="${textColor}">
        Card #${id}
      </text>
      <text x="50%" y="50%" font-family="monospace" font-size="12" 
        text-anchor="middle" dominant-baseline="middle" fill="${secondaryColor}">
        ${address}
      </text>
      <text x="50%" y="70%" font-family="Arial" font-size="14" 
        text-anchor="middle" dominant-baseline="middle" fill="${tertiaryColor}">
        Balance: ${balance} MATIC
      </text>
    </svg>`;
  }

  /**
   * Initialize card
   */
  async function initializeCard(): Promise<void> {
    if (!props.cardInfo) return;
    
    isLoading = true;
    loadError = null;
    
    try {
      // Update derived data
      updateDerivedData();
      
      // Create card style
      cardStyle = createCardStyle(props.cardInfo);
      
      // Try to load SVG or create inline fallback
      try {
        if (props.cardInfo.svg) {
          const svgPath = `/cards/${props.cardInfo.svg}.svg`;
          debugService.info(`Loading SVG from ${svgPath}`);
          
          const response = await fetch(svgPath);
          if (response.ok) {
            svgContent = await response.text();
            hasRenderedSvg = true;
          } else {
            throw new Error(`Failed to load SVG: ${response.status}`);
          }
        } else {
          // Use inline SVG
          svgContent = createInlineSvg(
            formattedCardId, 
            formattedAddress, 
            props.balance, 
            props.cardInfo.model
          );
        }
      } catch (svgError) {
        debugService.warn(`SVG loading error: ${svgError}, using fallback`);
        svgContent = createInlineSvg(
          formattedCardId, 
          formattedAddress, 
          props.balance, 
          props.cardInfo.model
        );
      }
    } catch (error) {
      debugService.error(`Card initialization error: ${error}`);
      loadError = error instanceof Error ? error.message : 'Card initialization failed';
      
      // Use fallback SVG
      svgContent = createInlineSvg(
        formattedCardId, 
        formattedAddress, 
        props.balance, 
        props.cardInfo?.model
      );
    } finally {
      isLoading = false;
    }
  }

  /**
   * Get model class name
   */
  function getModelClassName(): string {
    if (!props.cardInfo?.model) return '';
    return `card-model-${props.cardInfo.model}`;
  }

  // Handle SVG loading error
  function handleSvgError() {
    debugService.error('SVG rendering error, switching to fallback');
    svgContent = createInlineSvg(
      formattedCardId, 
      formattedAddress, 
      props.balance, 
      props.cardInfo?.model
    );
  }
  
  // Initialize on mount
  onMount(() => {
    updateDerivedData();
    void initializeCard();
    
    // Set up watcher for card changes
    return () => {
      // Cleanup if needed
    };
  });
  
  // Watch for prop changes using isolated effect
  let prevCardId = $state<number | null>(null);
  
  // Use root effect to avoid circular dependencies
  $effect.root(() => {
    const currentId = props.cardInfo?.id;
    if (currentId && currentId !== prevCardId) {
      prevCardId = currentId;
      updateDerivedData();
      void initializeCard();
    }
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
      class="w-full relative shadow-xl rounded-lg overflow-hidden mb-6 tap3-card {getModelClassName()}"
      style={cardStyle}
    >
      <div class="w-full relative" style="padding-top: 63.8%;">
        <!-- SVG Content -->
        <div class="absolute inset-0" aria-hidden="true">
          {#if svgContent}
            <div 
              class="w-full h-full tap3-card-svg-container"
              role="img"
              aria-label="Card design"
            >
              {@html svgContent}
              
              <!-- Error handling for external SVG -->
              {#if hasRenderedSvg}
                <img 
                  src={props.cardInfo?.svg ? `/cards/${props.cardInfo.svg}.svg` : '/cards/default.svg'}
                  alt=""
                  style="display: none;" 
                  onerror={handleSvgError}
                />
              {/if}
            </div>
          {/if}
        </div>

        <!-- Card ID -->
        <div class="cardId">
          #{formattedCardId}
        </div>
        
        <!-- Card Address -->
        <div class="cardAddr">
          {formattedAddress}
        </div>
        
        <!-- Balance -->
        <div class="nativeBalance">
          <div class="text-sm opacity-75">Balance</div>
          <div class="font-bold">{props.balance} MATIC</div>
        </div>

        <!-- Transaction Count -->
        {#if transactionCount !== undefined}
          <div class="txCount">
            <span>{transactionCount}</span> Tx
          </div>
        {/if}

        <!-- Unlock Button -->
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
    z-index: 5;
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
    z-index: 5;
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
    z-index: 5;
  }

  .txCount {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    font-size: 0.75rem;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 0.1rem 0.5rem;
    border-radius: 0.5rem;
    color: white;
    text-align: center;
    z-index: 5;
  }

  /* SVG container styles */
  :global(.tap3-card-svg-container svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* Card model styles */
  .card-model-4 {
    background-color: black;
  }
  
  .card-model-5 {
    background-color: #c7252b;
  }
  
  .card-model-6 {
    background-color: #006faf;
  }

  /* Card animation */
  .tap3-card {
    transition: transform 0.3s ease;
  }
  
  .tap3-card:active {
    transform: scale(0.98);
  }
</style>