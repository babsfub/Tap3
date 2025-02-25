// lib/services/nfc.ts
import { browser } from '$app/environment';
import { cryptoService } from './crypto.js';
import { apiService } from './api.js';
import type { CardMode,CardInfo } from '$lib/types.js';

interface NFCWriteOptions {
  privateKey: string;
  pin: string;
}

interface NFCReadResult {
  cardInfo: CardInfo;
  isValid: boolean;
}

class NFCService {
  private reader: NDEFReader | null = null;
  private isReading = false;
  private abortController: AbortController | null = null;

  async isSupported(): Promise<boolean> {
    return browser && 'NDEFReader' in window;
  }

  async requestPermission(): Promise<PermissionState> {
    if (!browser || !await this.isSupported()) {
      throw new Error('NFC not supported on this device');
    }

    try {
      const permission = await navigator.permissions.query({ name: 'nfc' as PermissionName });
      return permission.state;
    } catch (error) {
      console.error('Failed to query NFC permission:', error);
      throw new Error('Failed to access NFC permissions');
    }
  }

  async startReading({
    onRead,
    onError,
    onStateChange,
    mode = 'read' 
  }: {
    onRead: (result: NFCReadResult) => void;
    onError: (error: Error) => void;
    onStateChange: (state: 'reading' | 'stopped') => void;
    mode?: CardMode;
  }): Promise<void> {
    if (this.isReading || !browser) return;

    try {
      this.isReading = true;
      onStateChange?.('reading');
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        throw new Error('NFC permission denied');
      }

      // Initialisation du lecteur NFC
      this.reader = new NDEFReader();
      this.isReading = true;
      this.abortController = new AbortController();

      // Démarrage du scan NFC
      await this.reader.scan({
        signal: this.abortController.signal
      });

      // Gestion des événements de lecture
      this.reader.addEventListener('reading', async (event: Event) => {
        try {
          const ndefEvent = event as NDEFReadingEvent;
          const message = ndefEvent.message;

          // Décoder et valider le message
          const cardData = await this.decodeMessage(message);
          if (!cardData) {
            throw new Error('Invalid card data format');
          }

          // Traitement des données
          const cardInfo = await this.processCardData(cardData);
          if (!cardInfo) {
            throw new Error('Failed to process card data');
          }

          // Vérification avec l'API
          const isValid = await apiService.verifyCard(
            cardInfo.id,
            cryptoService.generateCardUrl(cardInfo)
          );

          onRead({
            cardInfo,
            isValid
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Card reading failed';
          onError(new Error(errorMessage));
          onStateChange?.('stopped'); 
        }
      });

      this.reader.addEventListener('readingerror', () => {
        onError(new Error('NFC read operation failed'));
      });

    } catch (error) {
      this.cleanupReader();
      const errorMessage = error instanceof Error ? error.message : 'NFC operation failed';
      onError(new Error(errorMessage));
    }
  }

  async writeCard(cardInfo: CardInfo, options: NFCWriteOptions): Promise<void> {
    if (!browser || !await this.isSupported()) {
      throw new Error('NFC not supported on this device');
    }

    try {
      // Validation du PIN
      if (!cryptoService.validatePassword(options.pin)) {
        throw new Error('Invalid PIN format');
      }

      // Chiffrement de la clé privée
      const encryptedKey = cryptoService.encryptPrivateKey(
        options.privateKey,
        options.pin
      );

      // Préparation des données NFC
      const cardData = cryptoService.generateCardUrl({
        ...cardInfo,
        priv: CryptoJS.enc.Base64.parse(encryptedKey)
      });

      const messageInit: NDEFMessageInit = {
        records: [{
          recordType: 'url',
          data: cardData,
          mediaType: 'application/x-tap3-card'
        }]
      };

      
      const writer = new NDEFReader();
      await writer.write(messageInit, {
        overwrite: true
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to write card';
      throw new Error(errorMessage);
    }
  }

  async stopReading(): Promise<void> {
    this.cleanupReader();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  private cleanupReader(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isReading = false;
    this.reader = null;
  }

  private async decodeMessage(message: NDEFMessage): Promise<string | null> {
    if (!message.records?.length) return null;

    const record = message.records[0];
    if (record.recordType !== 'url' || !record.data) {
      return null;
    }

    return new TextDecoder().decode(record.data);
  }

  // Dans nfcService, méthode processCardData
private async processCardData(data: string): Promise<CardInfo | null> {
  try {
    const parsedCard = cryptoService.parseCardUrl(data);
    if (!parsedCard?.id) return null;

    // Récupérer le design et le style de la carte
    const [design, style] = await Promise.all([
      apiService.getCardDesign(parsedCard.id),
      apiService.getCardStyle(parsedCard.id)
    ]);

    return {
      ...parsedCard,
      ...design,
      css: style.css,
      model: style.model
    } as CardInfo;

  } catch (error) {
    console.error('Card data processing failed:', error);
    return null;
  }
}
}

export const nfcService = new NFCService();