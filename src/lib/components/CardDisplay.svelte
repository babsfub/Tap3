<!-- lib/components/CardDisplay.svelte -->
<script lang="ts">
  import type { CardInfo } from '$lib/types.js';

  let props = $props<{
    cardInfo: CardInfo;
    balance: string;
    onUnlock?: () => void;
  }>();

  // Calculer le style complet
  let cardStyle = $derived(() => {
    let style = '';
    
    // Style de base selon le modèle
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
    
    // Ajouter le CSS personnalisé de la carte
    if (props.cardInfo.css) {
      style += ` ${props.cardInfo.css}`;
    }

    return style;
  });
</script>



<div class="w-full max-w-[428px] mx-auto"> <!-- Taille fixe basée sur le design original -->
  <div 
    class="w-full relative shadow-xl rounded-lg overflow-hidden mb-6"
    style={cardStyle()}
  >
    <!-- Container pour maintenir le ratio 854:545 -->
    <div class="w-full relative" style="padding-top: 63.8%;"> <!-- (545/854)*100 -->
      {#if props.cardInfo.svg}
        <img 
          src="/cards/{props.cardInfo.svg}.svg" 
          alt="Card Design" 
          class="absolute top-0 left-0 w-full h-full object-contain"
        />
      {/if}

      <!-- Les éléments superposés -->
      <div class="cardId">#{props.cardInfo.id.toString().padStart(4, '0')}</div>
      
      <div class="cardAddr">
        {props.cardInfo.pub.slice(0, 6)}...{props.cardInfo.pub.slice(-4)}
      </div>
      
      <div class="nativeBalance">
        <div class="text-sm opacity-75">Balance</div>
        <div class="font-bold">{props.balance} MATIC</div>
      </div>

      {#if !props.cardInfo.key && props.onUnlock}
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