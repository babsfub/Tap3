<!-- lib/components/Address.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import type { Address } from 'viem';

  interface Props {
    address: Address;
    showFull?: boolean;
    copyable?: boolean;
    showPrefix?: boolean;
  }

  let props = $props();
  
  let copied = $state(false);
  let copyTimeout: number;

  // Format address with or without prefix
  let displayAddress = $state('');
  $effect(() => {
    if (!props.address) return;
    const addr = props.address.toLowerCase();
    displayAddress = !props.showPrefix && addr.startsWith('0x') ? addr.slice(2) : addr;
  });

  let shortAddress = $state('');
  $effect(() => {
    if (!displayAddress || displayAddress.length <= 10) {
      shortAddress = displayAddress;
    } else {
      shortAddress = `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`;
    }
  });

  async function copyToClipboard() {
    if (!browser || !props.copyable || !props.address) return;

    try {
      await navigator.clipboard.writeText(props.address);
      copied = true;

      if (copyTimeout) {
        window.clearTimeout(copyTimeout);
      }

      copyTimeout = window.setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }

  onDestroy(() => {
    if (copyTimeout) {
      window.clearTimeout(copyTimeout);
    }
  });
</script>