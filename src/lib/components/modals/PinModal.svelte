<!-- lib/components/modals/PinModal.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { cryptoService } from '$lib/services/crypto.js';
  import { debugService } from '$lib/services/DebugService.js';

  // Utilisation de $props avec Svelte 5
  let { onSubmit, onClose, title = 'Enter PIN' } = $props<{
    onSubmit: (pin: string) => Promise<void>;
    onClose: () => void;
    title?: string;
  }>();

  let password = $state('');
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let hasInteracted = $state(false); // Nouvelle variable pour suivre l'interaction utilisateur
  
  // Validation du mot de passe UNIQUEMENT après interaction utilisateur
  let isValidInput = $derived(() => {
    // Si l'utilisateur n'a pas encore interagi, considérer comme valide
    if (!hasInteracted) return true;
    
    // Sinon, appliquer la validation normale
    return cryptoService.validatePassword(password);
  });

  onMount(() => {
    debugService.info('PinModal: Component mounted');
    
    // Mettre le focus sur l'input au montage
    setTimeout(() => {
      try {
        const input = document.getElementById('password-input');
        if (input) {
          (input as HTMLInputElement).focus();
          debugService.debug('PinModal: Input focused');
        }
      } catch (e) {
        debugService.warn(`Failed to focus input: ${e}`);
      }
    }, 100);
  });

  // Marquer l'interaction utilisateur
  function handleInputChange() {
    hasInteracted = true;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    
    // Marquer comme interagi au moment de la soumission
    hasInteracted = true;
    
    // Valider explicitement le mot de passe lors de la soumission
    const isPasswordValid = cryptoService.validatePassword(password);
    if (!isPasswordValid || isLoading) {
      debugService.warn(`Submission prevented: valid=${isPasswordValid}, loading=${isLoading}`);
      return;
    }
    
    try {
      isLoading = true;
      error = null;
      
      debugService.info(`PinModal: Processing PIN submission...`);
      await onSubmit(password);
      
      password = ''; // Reset password après succès
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid password';
      debugService.error(`PinModal: Submission error: ${error}`);
      password = '';
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- Structure simplifiée, contenu du modal uniquement -->
<div class="p-6">
  <header class="mb-6 flex justify-between items-center">
    <h2 class="text-xl font-bold dark:text-white">{title}</h2>
    <button 
      onclick={onClose} 
      type="button"
      class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
    >×</button>
  </header>

  {#if error}
    <div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
      {error}
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="space-y-4">
    <div>
      <label for="password-input" class="block font-medium mb-1 dark:text-gray-200">
        PIN
      </label>
      <input
        id="password-input"
        type="password"
        bind:value={password}
        oninput={handleInputChange}
        placeholder="Enter your PIN"
        class="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        class:border-red-500={hasInteracted && !isValidInput}
        disabled={isLoading}
      />
    </div>

    <footer class="flex justify-end gap-3 pt-4">
      <button 
        type="button"
        onclick={onClose}
        class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        disabled={isLoading}
      >
        Cancel
      </button>
      
      <button 
        type="submit"
        class="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
        class:opacity-50={hasInteracted && !isValidInput}
        disabled={hasInteracted && !isValidInput || isLoading}
      >
        {isLoading ? 'Processing...' : 'Submit'}
      </button>
    </footer>
  </form>
</div>