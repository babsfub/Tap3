// lib/utils/walletkit-init.js
import { walletService } from '$lib/services/wallet.js';
import { debugService } from '$lib/services/DebugService.js';

/**
 * Vérifie la configuration de Reown WalletKit
 * À exécuter au démarrage de l'application
 * 
 * @returns {Promise<boolean>} true si l'initialisation a réussi, false sinon
 */
async function verifyReownConfig() {
  debugService.info('Vérification de la configuration Reown WalletKit...');
  
  // Vérifier si VITE_REOWN_ID est défini
  const reownId = import.meta.env.VITE_REOWN_ID;
  if (!reownId) {
    debugService.error('ERREUR CRITIQUE: Variable d\'environnement VITE_REOWN_ID manquante');
    console.error('ERREUR: La variable d\'environnement VITE_REOWN_ID n\'est pas définie. WalletKit ne fonctionnera pas correctement.');
    
    // Afficher un message pour le développeur
    if (import.meta.env.DEV) {
      console.warn(`
      ================================================================
      🔴 ERREUR DE CONFIGURATION: VITE_REOWN_ID MANQUANT
      ================================================================
      
      Veuillez créer un fichier .env.local à la racine du projet avec:
      
      VITE_REOWN_ID=votre_projet_id_de_reown_cloud
      
      Vous pouvez obtenir un ID de projet sur https://cloud.reown.com
      ================================================================
      `);
    }
    return false;
  }
  
  // Tester l'initialisation de WalletKit
  try {
    debugService.info('Test d\'initialisation WalletKit...');
    const initialized = await walletService.initialize();
    
    if (initialized) {
      debugService.info('✅ WalletKit initialisé avec succès!');
      return true;
    } else {
      debugService.error('❌ Échec d\'initialisation de WalletKit');
      return false;
    }
  } catch (error) {
    debugService.error(`❌ Erreur lors de l'initialisation de WalletKit: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Ajoute la vérification WalletKit dans le fichier +layout.svelte:
 * 
 * ```svelte
 * <script>
 *   import { onMount } from 'svelte';
 *   import { verifyReownConfig } from '$lib/utils/walletkit-init.js';
 *   
 *   onMount(() => {
 *     void verifyReownConfig();
 *   });
 * </script>
 * ```
 */

export { verifyReownConfig };