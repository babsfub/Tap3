<!-- lib/components/modals/PinModal.svelte -->
<script lang="ts">
  import { cryptoService } from '$lib/services/crypto.js';

  let { onSubmit, onClose, title = 'Enter PIN' } = $props<{
    onSubmit: (pin: string) => Promise<void>;
    onClose: () => void;
    title?: string;
  }>();

  let password = $state('');
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let shakeError = $state(false);

  // Utilisation de validatePassword
  let isValidInput = $derived(cryptoService.validatePassword(password));
  
  

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!isValidInput || isLoading) return;
    
    try {
      isLoading = true;
      error = null;
      await onSubmit(password);
      password = ''; // Reset password après succès
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid password';
      password = ''; // Reset password après erreur
      shakeError = true;
      setTimeout(() => shakeError = false, 500);
    } finally {
      isLoading = false;
    }
  }

  // Auto-focus du champ password
  let passwordInput: HTMLInputElement;
  $effect(() => {
    passwordInput?.focus();
  });
</script>

<div 
  class="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50"
  aria-labelledby="password-modal-title"
  role="dialog"
  aria-modal="true"
>
  <div 
    class="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl
           {shakeError ? 'animate-shake' : ''}"
  >
    <div class="flex justify-between items-center mb-6">
      <h2 
        id="password-modal-title" 
        class="text-xl font-bold dark:text-white"
      >
        {title ?? 'Enter Password'}
      </h2>
      
      <button 
        onclick={onClose}
        class="text-gray-500 hover:text-gray-700 dark:text-gray-400 
               dark:hover:text-gray-300 transition-colors"
        aria-label="Close"
      >
        <span class="material-icons">close</span>
      </button>
    </div>

    {#if error}
      <div 
        class="bg-red-100 dark:bg-red-900/50 border border-red-400 
               dark:border-red-800 text-red-700 dark:text-red-100 
               px-4 py-3 rounded mb-4"
        role="alert"
      >
        {error}
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label 
          for="password-input"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Password
        </label>

        <input
          id="password-input"
          bind:this={passwordInput}
          type="password"
          bind:value={password}
          placeholder="Enter your password"
          class="w-full px-4 py-2 text-lg
                 bg-white dark:bg-gray-700 border border-gray-300 
                 dark:border-gray-600 rounded-lg focus:outline-none 
                 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors duration-200
                 {error ? 'border-red-500 focus:ring-red-500' : ''}"
          class:error={password && !isValidInput}
          autocomplete="current-password"
          disabled={isLoading}
          aria-invalid={password && !isValidInput ? 'true' : undefined}
          
        />

       
      </div>

      <div class="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg
                 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
                 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          onclick={onClose}
          disabled={isLoading}
        >
          Cancel
        </button>

        <button
          type="submit"
          class="px-4 py-2 bg-blue-500 text-white rounded-lg
                 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isValidInput || isLoading}
        >
          {isLoading ? 'Validating...' : 'Submit'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .animate-shake {
    animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
  }

  @keyframes shake {
    10%, 90% { transform: translate3d(-1px, 0, 0); }
    20%, 80% { transform: translate3d(2px, 0, 0); }
    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
    40%, 60% { transform: translate3d(4px, 0, 0); }
  }
</style>