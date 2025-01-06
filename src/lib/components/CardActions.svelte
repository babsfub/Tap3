<!-- lib/components/CardActions.svelte -->
<script lang="ts">
    let props = $props<{
      onUnlock: () => void;
      onSend: () => void;
      onShowQR: () => void;
      onCopy: () => void;
    }>();
  </script>
  
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
    <button
      class="flex flex-col items-center p-4 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
      onclick={props.onUnlock}
    >
      <span class="material-icons mb-2">lock_open</span>
      <span>Unlock</span>
    </button>
  
    <button
      class="flex flex-col items-center p-4 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
      onclick={props.onSend}
    >
      <span class="material-icons mb-2">send</span>
      <span>Send</span>
    </button>
  
    <button
      class="flex flex-col items-center p-4 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
      onclick={props.onShowQR}
    >
      <span class="material-icons mb-2">qr_code</span>
      <span>QR Code</span>
    </button>
  
    <button
      class="flex flex-col items-center p-4 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-colors"
      onclick={props.onCopy}
    >
      <span class="material-icons mb-2">content_copy</span>
      <span>Copy Address</span>
    </button>
  </div>