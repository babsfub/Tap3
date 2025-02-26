<!-- lib/components/BalanceUpdater.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { useCardState } from '$lib/stores/card.js';
  import { apiService } from '$lib/services/api.js';
  import { debugService } from '$lib/services/DebugService.js';

  // Global tracker for active instance to prevent multiple polling instances
  const INSTANCE_ID = Math.random().toString(36).substring(2, 9);
  let ACTIVE_INSTANCE: string | null = null;

  // Interval configurations
  const { updateInterval = 12 } = $props();
  
  // Component state
  let balanceIntervalId: number | undefined;
  let priceIntervalId: number | undefined;
  let maticPrice = $state<number | null>(null);
  let lastPriceUpdate = $state<Date | null>(null);
  let isUpdating = $state(false);
  let isActive = $state(false);
  
  // Card state access - use get() pattern to avoid reactive loops
  const cardState = useCardState();
  
  // Function to get card state without creating reactivity
  function getCardInfo() {
    return cardState.getState().currentCard;
  }
  
  // Update balance without creating reactivity loops
  async function updateBalance() {
    // Guard clauses to prevent unnecessary updates
    if (!isActive || isUpdating) return;
    
    const cardInfo = getCardInfo();
    if (!cardInfo?.pub) return;
    
    isUpdating = true;
    
    try {
      debugService.info(`[${INSTANCE_ID}] Updating balance for ${cardInfo.pub.slice(0, 10)}...`);
      await cardState.updateBalance();
    } catch (error) {
      debugService.error(`[${INSTANCE_ID}] Failed to update balance: ${error}`);
    } finally {
      isUpdating = false;
    }
  }
  
  // Update MATIC price independently from balance
  async function updateMaticPrice() {
    if (!isActive) return;
    
    try {
      debugService.info(`[${INSTANCE_ID}] Fetching MATIC price...`);
      const price = await apiService.getMaticPrice();
      maticPrice = price;
      lastPriceUpdate = new Date();
      debugService.info(`[${INSTANCE_ID}] MATIC price updated: $${price}`);
    } catch (error) {
      debugService.error(`[${INSTANCE_ID}] Failed to fetch MATIC price: ${error}`);
    }
  }
  
  // Stop all polling cleanly
  function stopAllPolling() {
    if (!isActive) return;
    
    debugService.debug(`[${INSTANCE_ID}] Stopping all balance and price polling`);
    
    if (balanceIntervalId) {
      window.clearInterval(balanceIntervalId);
      balanceIntervalId = undefined;
    }
    
    if (priceIntervalId) {
      window.clearInterval(priceIntervalId);
      priceIntervalId = undefined;
    }
    
    isActive = false;
    
    // Only clear global instance if this instance is the active one
    if (ACTIVE_INSTANCE === INSTANCE_ID) {
      ACTIVE_INSTANCE = null;
    }
  }
  
  // Start polling with safeguards against multiple instances
  function startPolling() {
    // Prevent multiple active instances
    if (ACTIVE_INSTANCE && ACTIVE_INSTANCE !== INSTANCE_ID) {
      debugService.warn(`[${INSTANCE_ID}] Not starting polling: another instance (${ACTIVE_INSTANCE}) is already active`);
      return;
    }
    
    // First stop any existing polls to clean up
    stopAllPolling();
    
    // Register as active
    ACTIVE_INSTANCE = INSTANCE_ID;
    isActive = true;
    
    // Check if card is available
    const cardInfo = getCardInfo();
    if (!cardInfo?.pub) {
      debugService.debug(`[${INSTANCE_ID}] Not starting polling: no card connected`);
      isActive = false;
      ACTIVE_INSTANCE = null;
      return;
    }
    
    // Convert interval to milliseconds
    const msInterval = updateInterval * 1000;
    
    // Immediate updates
    void updateBalance();
    void updateMaticPrice();
    
    // Set intervals for regular updates
    balanceIntervalId = window.setInterval(() => {
      void updateBalance();
    }, msInterval);
    
    priceIntervalId = window.setInterval(() => {
      void updateMaticPrice();
    }, 5 * 60 * 1000); // 5 minutes
    
    debugService.info(`[${INSTANCE_ID}] Balance polling started (${updateInterval}s interval)`);
  }
  
  // Manual card state check function - not reactive
  function checkCardChanged() {
    const cardInfo = getCardInfo();
    return !!cardInfo?.pub;
  }
  
  // Setup and teardown
  onMount(() => {
    debugService.info(`[${INSTANCE_ID}] BalanceUpdater mounted`);
    
    // Initial start if card present
    if (checkCardChanged()) {
      startPolling();
    }
    
    // Set up polling restart/stop when card state changes
    const unsubscribeCard = cardState.subscribe((state) => {
      if (state.currentCard?.pub) {
        if (!isActive) {
          startPolling();
        }
      } else if (isActive) {
        stopAllPolling();
      }
    });
    
    // Clean up subscription on destroy
    return () => {
      if (unsubscribeCard) unsubscribeCard();
    };
  });
  
  onDestroy(() => {
    debugService.info(`[${INSTANCE_ID}] BalanceUpdater destroyed`);
    stopAllPolling();
  });
</script>

<!-- Hidden component that manages balance updates -->
<div hidden aria-hidden="true">
  <span data-component="balance-updater" data-instance-id={INSTANCE_ID} data-active={isActive}></span>
</div>