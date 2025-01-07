<script lang="ts">
  import type { CardInfo } from '$lib/types.js';
  import Address from './Address.svelte';

  let props = $props<{
    cardInfo: CardInfo;
    balance: string;
    onUnlock?: () => void;
    isLocked?: boolean;
  }>();

  let cardStyle = $derived(() => {
    let style = '';
    
    if (props.cardInfo.model) {
      switch (props.cardInfo.model) {
        case 4:
          style += 'background-color: black;';
          break;
        case 5:
          style += 'background-color: #c7252b;';
          break;
        case 6:
          style += 'background-color: #006faf;';
          break;
        default:
          style += 'background-color: white;';
      }
    }
    
    if (props.cardInfo.css) {
      style += props.cardInfo.css;
    }

    return style;
  });
</script>

<div class="w-full max-w-[428px] mx-auto"> 
  <div 
    class="w-full relative shadow-xl rounded-lg overflow-hidden mb-6"
    style={cardStyle()}
  >
    <div class="w-full relative" style="padding-top: 63.8%;"> 
      {#if props.cardInfo.svg}
        <div class="absolute inset-0">
          {@html props.cardInfo.svg}
        </div>
      {/if}

      <!-- Les éléments superposés -->
      <div class="cardId">
        #{props.cardInfo.id.toString().padStart(4, '0')}
      </div>
      
      <div class="cardAddr">
        <Address 
          address={props.cardInfo.pub} 
          showFull={false} 
          showPrefix={true}
        />
      </div>
      
      <div class="nativeBalance">
        <div class="text-sm opacity-75">Balance</div>
        <div class="font-bold">{props.balance} MATIC</div>
      </div>

      {#if props.isLocked && props.onUnlock}
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
    font-size: 1.25rem;
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