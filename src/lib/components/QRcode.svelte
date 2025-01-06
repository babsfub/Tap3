<!-- lib/components/QrCode.svelte -->
<script lang="ts">
    import QRCode from 'qrcode'
    import { onMount } from 'svelte'
    import type { Address } from 'viem'
  
    let props = $props<{
      address: Address
      size?: number 
      onClose: () => void
    }>();
  
    let canvas: HTMLCanvasElement
  
    onMount(() => {
      if (!canvas) return
      QRCode.toCanvas(canvas, props.address, {
        width: props.size ?? 300,
        margin: 2,
        color: {
          dark: '#000',
          light: '#FFF'
        }
      })
    })
  </script>
  
  <div class="qr-container">
    <div class="qr-header">
      <h3>Scan Address</h3>
      <button onclick={props.onClose} class="close-btn">
        <span class="material-icons">close</span>
      </button>
    </div>
  
    <canvas 
      bind:this={canvas}
      class="qr-canvas"
    ></canvas>
  
    <p class="qr-help">
      Scan this QR code to get the card's address
    </p>
  </div>
  
  <style lang="postcss">
    .qr-container {
      @apply p-6 bg-white dark:bg-gray-800 rounded-xl;
    }
  
    .qr-header {
      @apply flex justify-between items-center mb-4;
    }
  
    .close-btn {
      @apply p-2 rounded-full hover:bg-gray-100 
             dark:hover:bg-gray-700 transition-colors;
    }
  
    .qr-canvas {
      @apply mx-auto block;
    }
  
    .qr-help {
      @apply text-center mt-4 text-sm text-gray-600 dark:text-gray-400;
    }
  </style>