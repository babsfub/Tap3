<!-- lib/components/Payment.svelte -->
<script lang="ts">
  import { isAddress } from 'viem';
  import type { Address } from 'viem';
  import type { CardInfo } from '$lib/types.js';
  import PinModal from '$lib/components/modals/PinModal.svelte';
  import NFCReader from './NFCReader.svelte';
  import { usePaymentState } from '$lib/stores/payments.js';
  import { useCardState } from '$lib/stores/card.js';
  import { nfcService } from '$lib/services/nfc.js';
  import { debugService } from '$lib/services/DebugService.js';
  
  let { onSubmit, onClose } = $props<{
    onSubmit: (to: Address, amount: string, pin: string) => Promise<void>;
    onClose: () => void;
  }>();

  const paymentState = usePaymentState();
  const cardState = useCardState();

  let showNFCReader = $state(false);
  let showPin = $state(false);
  let address = $state('');
  let amount = $state('');
  let processingPayment = $state(false); // État local pour indiquer le chargement
  
  let currentCard = $derived(cardState.getState().currentCard);
  let paymentStatus = $derived(paymentState.getState().status);
  let error = $state<string | null>(null);
  let isLoading = $derived(paymentStatus === 'loading' || processingPayment);

  let pendingTo = $state<Address | null>(null);
  let pendingAmount = $state<string | null>(null);

  let isValidAddress = $derived(isAddress(address as Address));
  let isValidAmount = $derived(parseFloat(amount) > 0);
  let canSubmit = $derived(isValidAddress && isValidAmount && !isLoading && currentCard);
  
  // Lors de l'initialisation, enregistrer l'état initial
  $effect(() => {
    debugService.debug(`Payment: Initialisation avec currentCard: ${currentCard?.id || 'aucune'}`);
  });

  // Gestion de la lecture NFC du destinataire
  async function handleRecipientCardRead(cardInfo: CardInfo) {
    try {
      debugService.info(`Payment: Carte destinataire lue, ID: ${cardInfo.id}`);
      
      // Arrêter la lecture immédiatement et complètement
      await nfcService.stopReading().catch((e) => {
        debugService.warn(`Payment: Erreur lors de l'arrêt du lecteur NFC: ${e}`);
      });
      
      if (cardInfo.pub) {
        // Vérifier que ce n'est pas la même carte
        if (currentCard?.pub && cardInfo.pub === currentCard.pub) {
          const errorMsg = "Impossible d'envoyer à la même carte";
          debugService.error(`Payment: ❌ ${errorMsg} - Source: ${currentCard.pub.slice(0, 8)}, Destination: ${cardInfo.pub.slice(0, 8)}`);
          error = errorMsg;
          return;
        }
        
        // Mettre à jour l'adresse et cacher le lecteur NFC
        debugService.info(`Payment: Adresse destinataire définie: ${cardInfo.pub}`);
        address = cardInfo.pub;
        
        // Important: attendez un peu avant de cacher le lecteur NFC
        await new Promise(resolve => setTimeout(resolve, 100));
        showNFCReader = false;
        error = null; // Effacer les erreurs précédentes
      } else {
        const errorMsg = 'Carte destinataire invalide - adresse manquante';
        debugService.error(`Payment: ❌ ${errorMsg}`);
        error = errorMsg;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors du traitement de la carte destinataire';
      debugService.error(`Payment: ❌ Erreur lors du traitement de la carte: ${errorMsg}`);
      error = errorMsg;
    }
  }

  async function startNFCReading(e: Event) {
    // Empêcher tout comportement par défaut
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    
    error = null; // Effacer les erreurs précédentes
    
    try {
      debugService.info('Payment: Début de la lecture NFC pour la carte destinataire...');
      
      // S'assurer que le lecteur est arrêté avant de commencer
      await nfcService.stopReading().catch((e) => {
        debugService.warn(`Payment: Erreur lors de l'arrêt du lecteur NFC: ${e}`);
      });
      
      // Un délai plus long pour s'assurer que tout est bien nettoyé
      debugService.debug('Payment: Attente avant redémarrage du lecteur NFC...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Après le nettoyage, montrer le lecteur NFC
      debugService.info('Payment: Affichage du lecteur NFC');
      showNFCReader = true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Échec du démarrage du lecteur NFC';
      debugService.error(`Payment: ❌ ${errorMsg}`);
      error = errorMsg;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) {
      debugService.warn('Payment: Tentative de soumission avec formulaire invalide');
      return;
    }
    
    debugService.info(`Payment: 📝 Transaction demandée: ${amount} MATIC vers ${address}`);
    
    // Stocker les valeurs pour la confirmation
    pendingTo = address as Address;
    pendingAmount = amount;
    
    // Afficher la modal de PIN
    debugService.info('Payment: Affichage de la modal de PIN pour confirmation');
    showPin = true;
  }

  async function handlePinSubmit(pin: string): Promise<void> {
    if (!pendingTo || !pendingAmount || !currentCard) {
      debugService.error('Payment: Données de transaction incomplètes lors de la soumission du PIN');
      return;
    }
    
    debugService.info(`Payment: PIN soumis, traitement de la transaction...`);
    
    try {
      // Afficher clairement que nous sommes en train de charger
      processingPayment = true;
      
      // Débloquer la carte avec le PIN fourni
      debugService.debug('Payment: Déverrouillage de la carte...');
      cardState.unlockCard();
      
      // Attendre un court instant pour s'assurer que le changement d'état est propagé
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Soumettre la transaction avec toutes les informations
      debugService.info(`Payment: Envoi de la transaction: ${pendingAmount} MATIC vers ${pendingTo}`);
      await onSubmit(pendingTo, pendingAmount, pin);
      
      // Nettoyage après succès
      debugService.info('Payment: ✅ Transaction soumise avec succès!');
      showPin = false;
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Échec du paiement';
      debugService.error(`Payment: ❌ Échec de la transaction: ${errorMsg}`);
      error = errorMsg;
      showPin = false;
      
      // Reverrouiller la carte pour la sécurité
      debugService.debug('Payment: Reverrouillage de la carte après échec');
      cardState.lockCard();
    } finally {
      processingPayment = false;
      pendingTo = null;
      pendingAmount = null;
    }
  }
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/50" role="dialog" aria-labelledby="modal-title">
  <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
    <header class="mb-6 flex justify-between items-center">
      <h2 id="modal-title" class="text-xl font-bold dark:text-white">Send Payment</h2>
      <button 
        onclick={onClose} 
        class="text-gray-500 hover:text-gray-700 dark:text-gray-400 
               dark:hover:text-gray-300"
        aria-label="Close"
      >×</button>
    </header>

    {#if error}
      <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/50 border border-red-400 
                  dark:border-red-800 text-red-700 dark:text-red-100 rounded">
        {error}
      </div>
    {/if}

    {#if showNFCReader}
      <NFCReader
        mode="payment"
        onRead={handleRecipientCardRead}
        onError={(message) => {
          error = message;
          debugService.error(`Payment: Erreur du lecteur NFC: ${message}`);
        }}
        onSuccess={() => {
          error = null;
          debugService.info('Payment: Lecteur NFC a terminé avec succès');
        }}
        onClose={() => {
          showNFCReader = false;
          error = null;
          debugService.info('Payment: Lecteur NFC fermé');
        }}
        updateCardState={false} 
      />
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="address" class="block font-medium mb-1 dark:text-gray-200">
            Recipient Address
          </label>
          <div class="flex gap-2">
            <input
              id="address"
              type="text"
              bind:value={address}
              placeholder="0x..."
              class="flex-1 p-2 border rounded-md dark:bg-gray-700 
                     dark:border-gray-600 dark:text-white" 
              class:border-red-500={!isValidAddress && address}
              disabled={isLoading}
            />
            <button
              type="button"
              onclick={startNFCReading}
              class="px-4 py-2 bg-blue-500 text-white rounded-md
                     hover:bg-blue-600 dark:bg-blue-600 
                     dark:hover:bg-blue-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Scan Card
            </button>
          </div>
        </div>

        <div>
          <label for="amount" class="block font-medium mb-1 dark:text-gray-200">
            Amount (MATIC)
          </label>
          <input
            id="amount"
            type="number"
            bind:value={amount}
            step="0.000001"
            min="0"
            class="w-full p-2 border rounded-md dark:bg-gray-700 
                   dark:border-gray-600 dark:text-white"
            class:border-red-500={!isValidAmount && amount}
            disabled={isLoading}
          />
        </div>

        <footer class="flex justify-end gap-3 pt-4">
          <button 
            type="button"
            onclick={() => {
              onClose();
              debugService.info('Payment: Modal fermée par l\'utilisateur');
            }}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md 
                   hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300
                   dark:hover:bg-gray-600 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          
          <button 
            type="submit"
            class="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600
                   dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
            class:opacity-50={!canSubmit}
            disabled={!canSubmit}
          >
            {isLoading ? 'Processing...' : 'Send'}
          </button>
        </footer>
      </form>
    {/if}
  </div>
</div>

{#if showPin}  
   <PinModal
      title="Confirm Payment"
      onSubmit={async (pin) => {
        debugService.debug('Payment: PIN soumis depuis la modal');
        await handlePinSubmit(pin);
      }}
      onClose={() => {
        showPin = false;
        error = null;
        debugService.info('Payment: Modal de PIN fermée par l\'utilisateur');
      }}
    />  
{/if}