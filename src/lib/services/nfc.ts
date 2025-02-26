// lib/services/nfc.ts - Version optimisée pour SvelteKit 2.x
import { browser } from '$app/environment';
import { cryptoService } from './crypto.js';  // Importer l'instance exportée, pas la classe
import { apiService } from './api.js';
import { debugService } from './DebugService.js';
import { AddressUtils } from '../utils/AddressUtils.js';
import type { CardMode, CardInfo } from '$lib/types.js';

/**
 * Options pour l'écriture NFC
 */
interface NFCWriteOptions {
  privateKey: string;
  pin: string;
}

/**
 * Options pour la lecture NFC
 */
interface NFCReadOptions {
  onRead: (result: { cardInfo: CardInfo; isValid: boolean }) => void;
  onError: (error: Error) => void;
  onStateChange: (state: 'reading' | 'stopped') => void;
  mode?: CardMode;
}

/**
 * Service de gestion des opérations NFC
 * Compatible avec les anciennes et nouvelles cartes
 */
class NFCService {
  private reader: NDEFReader | null = null;
  private isReading = false;
  private abortController: AbortController | null = null;
  private lastError: Error | null = null;

  /**
   * Vérifie si le NFC est supporté sur le dispositif actuel
   */
  async isSupported(): Promise<boolean> {
    return browser && 'NDEFReader' in window;
  }

  /**
   * Demande les permissions NFC avec une logique de repli améliorée
   */
  async requestPermission(): Promise<PermissionState> {
    if (!browser || !await this.isSupported()) {
      debugService.error('NFC non supporté sur ce dispositif');
      throw new Error('NFC non supporté sur ce dispositif');
    }
  
    try {
      debugService.info('Demande de permission NFC...');
      const permission = await navigator.permissions.query({ name: 'nfc' as PermissionName });
      
      if (permission.state === 'granted') {
        debugService.info('Permission NFC déjà accordée');
        return permission.state;
      }
      
      // Tentative de démarrage d'un scan pour déclencher la demande de permission
      try {
        const tempReader = new NDEFReader();
        const controller = new AbortController();
        
        // Démarrer un scan qui sera annulé rapidement
        debugService.info('Démarrage d\'un scan NFC temporaire pour déclencher la demande de permission');
        const scanPromise = tempReader.scan({ signal: controller.signal });
        
        // Attendre un court instant pour que la demande de permission s'affiche
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Annuler le scan
        controller.abort();
        
        try {
          await scanPromise;
        } catch (e) {
          // Ignorer l'erreur d'annulation attendue
          debugService.debug('Annulation attendue du scan temporaire');
        }
        
        // Vérifier l'état des permissions après cette tentative
        const newPermission = await navigator.permissions.query({ name: 'nfc' as PermissionName });
        debugService.info(`État de la permission NFC après demande: ${newPermission.state}`);
        return newPermission.state;
      } catch (scanError) {
        debugService.error(`Erreur lors de la demande de permission scan: ${scanError}`);
        return permission.state; 
      }
    } catch (error) {
      debugService.error(`Échec de la requête de permission NFC: ${error}`);
      throw new Error('Échec de l\'accès aux permissions NFC');
    }
  }

  /**
   * Démarre la lecture NFC avec une gestion améliorée de l'état et des erreurs
   */
  async startReading(options: NFCReadOptions): Promise<void> {
    if (this.isReading || !browser) {
      debugService.warn(`Lecture NFC ignorée: ${!browser ? 'pas dans un navigateur' : 'déjà en lecture'}`);
      return;
    }

    try {
      // Nettoyage proactif
      await this.stopReading();
      
      this.isReading = true;
      this.lastError = null;
      options.onStateChange?.('reading');
      
      debugService.info('Démarrage du processus de lecture NFC');
      
      // Vérifier les permissions
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission NFC refusée');
      }

      // Initialiser un nouveau lecteur NFC
      this.reader = new NDEFReader();
      this.abortController = new AbortController();

      // Configurer les écouteurs d'événements
      const handleReading = async (event: Event) => {
        try {
          // Empêcher la propagation pour éviter les comportements indésirables
          event.stopPropagation();
          
          debugService.info('Tag NFC détecté, traitement en cours...');
          const ndefEvent = event as NDEFReadingEvent;
          const message = ndefEvent.message;

          // Décoder le message
          const cardData = await this.decodeMessage(message);
          if (!cardData) {
            throw new Error('Format de données de carte invalide');
          }

          // Traiter les données de la carte
          debugService.debug(`Traitement des données de carte: ${cardData.substring(0, 30)}...`);
          const cardInfo = await this.processCardData(cardData);
          if (!cardInfo) {
            throw new Error('Échec du traitement des données de carte');
          }

          // Vérifier la validité auprès de l'API
          debugService.info(`Vérification de la carte ${cardInfo.id} auprès de l'API...`);
          const isValid = await apiService.verifyCard(
            cardInfo.id,
            cryptoService.generateCardUrl(cardInfo)  // Utilise l'instance importée
          );

          // Notification de lecture réussie
          options.onRead({
            cardInfo,
            isValid
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Échec de lecture de carte';
          debugService.error(`Erreur de lecture NFC: ${errorMessage}`);
          this.lastError = error instanceof Error ? error : new Error(errorMessage);
          options.onError(new Error(errorMessage));
        }
      };

      const handleReadingError = (event: Event) => {
        event.stopPropagation();
        debugService.error('Événement d\'erreur de lecture NFC déclenché');
        const error = new Error('Échec de l\'opération de lecture NFC');
        this.lastError = error;
        options.onError(error);
      };

      // Démarrer le scan avec gestion des signaux
      debugService.info('Initialisation du scan NFC...');
      await this.reader.scan({
        signal: this.abortController.signal
      });

      // Ajouter les écouteurs d'événements après le démarrage du scan
      this.reader.addEventListener('reading', handleReading);
      this.reader.addEventListener('readingerror', handleReadingError);
      
      debugService.info('Scan NFC démarré avec succès');

    } catch (error) {
      // Nettoyage en cas d'erreur
      this.cleanupReader();
      options.onStateChange?.('stopped');
      
      const errorMessage = error instanceof Error ? error.message : 'Échec de l\'opération NFC';
      debugService.error(`Erreur d'initialisation du scan NFC: ${errorMessage}`);
      this.lastError = error instanceof Error ? error : new Error(errorMessage);
      options.onError(new Error(errorMessage));
    }
  }

  /**
   * Arrête la lecture NFC de manière sûre avec des délais pour éviter les problèmes
   */
  async stopReading(): Promise<void> {
    if (!this.reader && !this.isReading) {
      return; // Rien à faire
    }
    
    debugService.info('Arrêt du lecteur NFC...');
    
    try {
      // Si un lecteur actif existe
      if (this.reader && this.isReading) {
        // Annuler via AbortController si disponible
        if (this.abortController) {
          debugService.debug('Annulation du scan NFC via AbortController');
          this.abortController.abort();
          this.abortController = null;
        }
        
        // Réinitialiser l'état
        this.isReading = false;
        this.reader = null;
      }
      
      // Période de calme pour assurer que tout est bien arrêté
      debugService.debug('Attente pour le nettoyage NFC...');
      await new Promise(resolve => setTimeout(resolve, 300));
      debugService.info('Lecteur NFC arrêté avec succès');
    } catch (error) {
      debugService.error(`Erreur lors de l'arrêt du lecteur NFC: ${error}`);
      // Réinitialisation forcée en cas d'erreur
      this.isReading = false;
      this.reader = null;
      this.abortController = null;
    }
  }

  /**
   * Écrit des données sur une carte NFC
   * Compatible avec les anciennes et nouvelles cartes
   */
  async writeCard(cardInfo: CardInfo, options: NFCWriteOptions): Promise<void> {
    if (!browser || !await this.isSupported()) {
      throw new Error('NFC non supporté sur ce dispositif');
    }

    debugService.info(`Démarrage du processus d'écriture pour la carte ID: ${cardInfo.id}`);

    try {
      // Validation du PIN
      if (!cryptoService.validatePassword(options.pin)) {  // Utilise l'instance importée
        debugService.error('Format de PIN invalide pour l\'écriture de carte');
        throw new Error('Format de PIN invalide');
      }

      // Chiffrement de la clé privée
      debugService.debug('Chiffrement de la clé privée avec le PIN...');
      const encryptedKey = cryptoService.encryptPrivateKey(  // Utilise l'instance importée
        options.privateKey,
        options.pin
      );

      // Préparation des données pour la carte NFC
      debugService.debug('Génération de l\'URL de données de carte...');
      const cardData = cryptoService.generateCardUrl({  // Utilise l'instance importée
        ...cardInfo,
        priv: CryptoJS.enc.Base64.parse(encryptedKey)
      });

      // Formater le message NDEF
      const messageInit: NDEFMessageInit = {
        records: [{
          recordType: 'url',
          data: cardData,
          mediaType: 'application/x-tap3-card'
        }]
      };

      // Écrire sur la carte
      debugService.info('Écriture des données sur la carte NFC...');
      const writer = new NDEFReader();
      await writer.write(messageInit, {
        overwrite: true
      });
      
      debugService.info('Écriture de carte réussie');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Échec d\'écriture de carte';
      debugService.error(`Échec d\'écriture de carte: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * Récupère l'erreur la plus récente
   */
  getLastError(): Error | null {
    return this.lastError;
  }
  
  /**
   * Nettoyage interne du lecteur
   */
  private cleanupReader(): void {
    debugService.debug('Nettoyage des ressources du lecteur NFC');
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    this.isReading = false;
    this.reader = null;
  }

  /**
   * Décode un message NDEF
   */
  private async decodeMessage(message: NDEFMessage): Promise<string | null> {
    if (!message.records?.length) {
      debugService.warn('Message NDEF vide, aucun enregistrement trouvé');
      return null;
    }

    const record = message.records[0];
    if (record.recordType !== 'url' || !record.data) {
      debugService.warn(`Type d'enregistrement NDEF non supporté: ${record.recordType}`);
      return null;
    }

    const textData = new TextDecoder().decode(record.data);
    debugService.debug(`Données NDEF décodées: ${textData.substring(0, 30)}...`);
    return textData;
  }

  /**
   * Traite les données de carte lues depuis un tag NFC
   * Compatible avec les anciennes et nouvelles cartes
   */
  private async processCardData(data: string): Promise<CardInfo | null> {
    try {
      debugService.info("Traitement des données de carte...");
      
      // Parsage des données
      const parsedCard = cryptoService.parseCardUrl(data);  // Utilise l'instance importée
      if (!parsedCard) {
        debugService.error("Échec complet du parsage de carte");
        return null;
      }
      
      debugService.info(`Carte parsée avec ID: ${parsedCard.id || 'MANQUANT'}`);
      
      // Validation de l'ID
      if (!parsedCard.id) {
        debugService.error("ID de carte invalide (indéfini ou null)");
        return null;
      }
      
      // Conversion de l'ID en nombre si nécessaire
      if (typeof parsedCard.id !== 'number') {
        debugService.warn(`L'ID de carte n'est pas un nombre, conversion depuis: ${typeof parsedCard.id}`);
        const numericId = Number(parsedCard.id);
        if (isNaN(numericId)) {
          debugService.error(`Impossible de convertir l'ID de carte en nombre: ${parsedCard.id}`);
          return null;
        }
        parsedCard.id = numericId;
      }
      
      // Normaliser l'adresse
      const normalizedAddr = AddressUtils.normalizeAddress(parsedCard.pub);
      if (!normalizedAddr) {
        debugService.warn(`Adresse de carte non valide: ${parsedCard.pub}`);
        // Pour les anciennes cartes, utiliser l'adresse telle quelle
        parsedCard.pub = parsedCard.pub;
      } else {
        parsedCard.pub = normalizedAddr;
      }
      
      // Récupérer le design et le style de la carte
      let cardDesign: { svg?: string } = {};
      let cardStyle = { css: "", model: 0 };
      
      try {
        debugService.debug(`Récupération du design de carte pour l'ID: ${parsedCard.id}`);
        cardDesign = await apiService.getCardDesign(parsedCard.id);
        
        debugService.debug(`Récupération du style de carte pour l'ID: ${parsedCard.id}`);
        cardStyle = await apiService.getCardStyle(parsedCard.id);
      } catch (apiError) {
        debugService.warn(`Erreur API, utilisation de valeurs par défaut: ${apiError}`);
        // Continuer avec les valeurs par défaut
      }
      
      // Fusionner toutes les données
      const result = {
        ...parsedCard,
        ...cardDesign,
        css: cardStyle?.css || "",
        model: cardStyle?.model || 0,
        svg: cardDesign?.svg || "default"
      };
      
      debugService.info(`Traitement de carte terminé pour l'ID: ${result.id}`);
      return result as CardInfo;
      
    } catch (error) {
      debugService.error(`Échec du traitement des données de carte: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

export const nfcService = new NFCService();