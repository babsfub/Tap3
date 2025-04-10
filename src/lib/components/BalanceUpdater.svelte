<!-- lib/components/BalanceUpdater.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { useCardState } from '$lib/stores/card.js';
  import { apiService } from '$lib/services/api.js';

  // Global tracker for active instance to prevent multiple polling instances
  const INSTANCE_ID = Math.random().toString(36).substring(2, 9);
  let ACTIVE_INSTANCE: string | null = null;

  // Interval configurations
  const { updateInterval = 40 } = $props();
  
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
    if (!isActive || isUpdating) return;
    
    const cardInfo = getCardInfo();
    if (!cardInfo?.pub) return;
    
    isUpdating = true;
    
    try {
      (`[${INSTANCE_ID}] Updating balance for ${cardInfo.pub.slice(0, 10)}...`);
      await cardState.updateBalance();
    } catch (error) {
      (`[${INSTANCE_ID}] Failed to update balance: ${error}`);
    } finally {
      isUpdating = false;
    }
  }
  
  // Update MATIC price independently from balance
  async function updateMaticPrice() {
    if (!isActive) return;
    
    try {
      (`[${INSTANCE_ID}] Fetching MATIC price...`);
      const price = await apiService.getMaticPrice();
      maticPrice = price;
      lastPriceUpdate = new Date();
      (`[${INSTANCE_ID}] MATIC price updated: $${price}`);
    } catch (error) {
      (`[${INSTANCE_ID}] Failed to fetch MATIC price: ${error}`);
    }
  }
  
  // Stop all polling cleanly
  function stopAllPolling() {
    if (!isActive) return;
    
    (`[${INSTANCE_ID}] Stopping all balance and price polling`);
    
    if (balanceIntervalId) {
      window.clearInterval(balanceIntervalId);
      balanceIntervalId = undefined;
    }
    
    if (priceIntervalId) {
      window.clearInterval(priceIntervalId);
      priceIntervalId = undefined;
    }
    
    isActive = false;
    
    if (ACTIVE_INSTANCE === INSTANCE_ID) {
      ACTIVE_INSTANCE = null;
    }
  }
  
  // Start polling with safeguards against multiple instances
  function startPolling() {
    if (ACTIVE_INSTANCE && ACTIVE_INSTANCE !== INSTANCE_ID) {
      (`[${INSTANCE_ID}] Not starting polling: another instance (${ACTIVE_INSTANCE}) is already active`);
      return;
    }
    
    stopAllPolling();
    
    ACTIVE_INSTANCE = INSTANCE_ID;
    isActive = true;
    
    const cardInfo = getCardInfo();
    if (!cardInfo?.pub) {
      (`[${INSTANCE_ID}] Not starting polling: no card connected`);
      isActive = false;
      ACTIVE_INSTANCE = null;
      return;
    }
    
    const msInterval = updateInterval * 1000;
    
    void updateBalance();
    void updateMaticPrice();
    
    balanceIntervalId = window.setInterval(() => {
      void updateBalance();
    }, msInterval);
    
    priceIntervalId = window.setInterval(() => {
      void updateMaticPrice();
    }, 5 * 60 * 1000); 
    
    (`[${INSTANCE_ID}] Balance polling started (${updateInterval}s interval)`);
  }
  
  function checkCardChanged() {
    const cardInfo = getCardInfo();
    return !!cardInfo?.pub;
  }
  
  onMount(() => {
   (`[${INSTANCE_ID}] BalanceUpdater mounted`);
    
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
    (`[${INSTANCE_ID}] BalanceUpdater destroyed`);
    stopAllPolling();
  });
</script>

<!-- Hidden component that manages balance updates -->
<div hidden aria-hidden="true">
  <span data-component="balance-updater" data-instance-id={INSTANCE_ID} data-active={isActive}></span>
</div>