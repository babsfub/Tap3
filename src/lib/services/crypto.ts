// lib/services/crypto.js - Version améliorée pour la compatibilité SvelteKit 2.x
import CryptoJS from 'crypto-js';
import type { Address } from 'viem';
import { AddressUtils } from '../utils/AddressUtils.js';
import { debugService } from './DebugService.js';

class CryptoService {
  /**
   * Sécurise les données sensibles pour les logs
   * @param data Les données à sécuriser
   * @returns Les données masquées
   */
  sanitizeLogData(data: string): string {
    if (!data) return 'empty';
    if (data.length <= 10) return data;
    
    // Masquer les données sensibles dans les logs
    return `${data.substring(0, 5)}...${data.substring(data.length - 5)}`;
  }

  /**
   * Parse une URL de carte Tap3 et extrait les informations
   * Compatible avec les anciennes et nouvelles cartes
   */
  parseCardUrl(data: string): { pub: Address; priv: CryptoJS.lib.WordArray; id: number } | null {
    try {
      debugService.debug(`Parsing card data: ${this.sanitizeLogData(data)}`);
      
      // Extraire la partie après le # si c'est une URL complète
      if (data.includes('#')) {
        const hashPart = data.split('#')[1];
        debugService.debug(`URL format détecté, extraction de la partie hash: ${this.sanitizeLogData(hashPart)}`);
        data = hashPart;
      }
      
      // Diviser les parties (pub:priv:id)
      const parts = data.split(':');
      if (parts.length !== 3) {
        debugService.error(`Format de données de carte invalide, attendu 3 parties mais reçu ${parts.length}`);
        return null;
      }
      
      const [pubKey, privKey, idRaw] = parts;
      
      // Validation des composants
      if (!pubKey || !privKey || !idRaw) {
        debugService.error('Composants de carte requis manquants');
        return null;
      }
      
      // Conversion de l'ID
      let id: number;
      try {
        id = this.base64ToBase10(idRaw);
        debugService.debug(`ID converti avec succès de base64 en nombre: ${id}`);
      } catch (e) {
        debugService.error(`Échec de conversion d'ID: ${idRaw}, erreur: ${e}`);
        return null;
      }
      
      // COMPATIBILITÉ: Support pour les anciennes cartes
      // Utiliser AddressUtils pour normaliser l'adresse avec support legacy
      let formattedPub = AddressUtils.normalizeAddress(pubKey) as Address;
      if (!formattedPub) {
        debugService.error(`Format d'adresse invalide: ${this.sanitizeLogData(pubKey)}`);
        
        // Fallback: utiliser l'adresse telle quelle pour les anciennes cartes
        formattedPub = pubKey as Address;
        debugService.warn(`Utilisation de l'adresse brute pour compatibilité: ${this.sanitizeLogData(pubKey)}`);
      }
      
      // Convertir la clé privée chiffrée en WordArray
      let privWordArray: CryptoJS.lib.WordArray;
      try {
        privWordArray = CryptoJS.enc.Base64.parse(privKey);
      } catch (e) {
        debugService.error(`Échec d'analyse de la clé privée: ${e}`);
        return null;
      }
      
      return {
        pub: formattedPub,
        priv: privWordArray,
        id
      };
    } catch (error) {
      debugService.error(`Erreur d'analyse de carte: ${error}`);
      return null;
    }
  }

  /**
   * Valide un mot de passe
   */
  validatePassword(password: string): boolean {
    // Minimum 3 caractères pour le mot de passe
    return typeof password === 'string' && password.length >= 3;
  }

  /**
   * Chiffre une clé privée avec un mot de passe
   */
  encryptPrivateKey(privateKey: string, password: string): string {
    if (!this.validatePassword(password)) {
      throw new Error('Mot de passe invalide (minimum 3 caractères)');
    }

    try {
      // Supprimer le préfixe 0x si présent
      const cleanKey = privateKey.replace('0x', '');
      
      // Convertir en WordArray
      const priv = CryptoJS.enc.Hex.parse(cleanKey);
      
      // Chiffrement AES
      const encrypted = CryptoJS.AES.encrypt(priv, password).toString();
      
      // Vérification du chiffrement (déchiffrement de test)
      const decrypted = CryptoJS.AES.decrypt(encrypted, password);
      if (cleanKey !== decrypted.toString(CryptoJS.enc.Hex)) {
        throw new Error('Échec de vérification du chiffrement');
      }

      return encrypted;
    } catch (error) {
      debugService.error(`Échec de chiffrement: ${error}`);
      throw new Error('Échec de chiffrement');
    }
  }

  /**
   * Déchiffre une clé privée avec un mot de passe
   * Compatible avec les formats WordArray et string
   */
  decryptPrivateKey(encryptedKey: CryptoJS.lib.WordArray | string, password: string): string {
    if (!this.validatePassword(password)) {
      throw new Error('Mot de passe invalide');
    }
  
    try {
      let encryptedStr: string;
      
      if (typeof encryptedKey === 'string') {
        encryptedStr = encryptedKey;
      } else {
        // Vérifier si c'est bien un WordArray avant conversion
        if (encryptedKey && typeof encryptedKey.toString === 'function') {
          encryptedStr = CryptoJS.enc.Base64.stringify(encryptedKey);
        } else {
          throw new Error('Format de clé chiffrée invalide');
        }
      }
      
      // Déchiffrement
      const decrypted = CryptoJS.AES.decrypt(encryptedStr, password).toString(CryptoJS.enc.Hex);
      
      // Validation du résultat
      if (!decrypted || decrypted.length !== 64) {
        throw new Error('Échec de déchiffrement');
      }
  
      // Ajouter le préfixe 0x pour la compatibilité avec les bibliothèques Ethereum
      return `0x${decrypted}`;
    } catch (error) {
      debugService.error(`Erreur de déchiffrement: ${error}`);
      throw new Error('Échec de déchiffrement');
    }
  }

  /**
   * Convertit une chaîne Base64 en WordArray hex
   */
  base64ToHex(str: string): CryptoJS.lib.WordArray {
    if (!str) throw new Error('Entrée invalide');
    
    try {
      return CryptoJS.enc.Base64.parse(str);
    } catch (error) {
      debugService.error(`Erreur de conversion Base64 vers Hex: ${error}`);
      throw new Error('Chaîne Base64 invalide');
    }
  }

  /**
   * Convertit une chaîne hex en Base64
   */
  hexToBase64(hex: string): string {
    const pub = CryptoJS.enc.Hex.parse(hex.replace('0x',''))
    return CryptoJS.enc.Base64.stringify(pub)
  }

  /**
   * Convertit un nombre base64 en nombre décimal
   * Utilisé pour les identifiants de carte
   */
  base64ToBase10(str: string): number {
    if (!str) throw new Error('Entrée invalide')

    const order = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    const base = order.length
    let num = 0
    
    for (const char of str) {
      const value = order.indexOf(char)
      if (value === -1) throw new Error('Caractère invalide')
      num = num * base + value
    }
    
    return num
  }

  /**
   * Convertit un nombre décimal en base64
   * Utilisé pour les identifiants de carte
   */
  base10ToBase64(num: number): string {
    const order = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    const base = order.length
    let str = ""
    
    while (num) {
      const r = num % base
      num = (num - r) / base
      str = order.charAt(r) + str
    }
    
    return str
  }

  /**
   * Génère une URL de carte complète à partir des informations de carte
   * Compatible avec le format attendu par les applications
   */
  generateCardUrl(cardInfo: { pub: string; id: number; priv: CryptoJS.lib.WordArray }): string {
    // Déterminer le domaine actuel ou utiliser tap3.me par défaut
    const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://tap3.me';
    
    try {
      // Convertir l'adresse publique en Base64 si elle n'est pas déjà dans ce format
      let pubBase64: string;
      if (cardInfo.pub.includes('=') || /[+/]/.test(cardInfo.pub)) {
        // L'adresse est déjà en Base64, utiliser telle quelle
        pubBase64 = cardInfo.pub;
      } else {
        // L'adresse est en format hex, convertir en Base64
        pubBase64 = this.hexToBase64(cardInfo.pub);
      }
      
      // Convertir l'ID en Base64
      const idBase64 = this.base10ToBase64(cardInfo.id);
      
      // Obtenir la clé privée en Base64
      const privBase64 = CryptoJS.enc.Base64.stringify(cardInfo.priv);
      
      // Construire l'URL complète
      return `${currentDomain}/#${pubBase64}:${privBase64}:${idBase64}`;
    } catch (error) {
      debugService.error(`Erreur lors de la génération de l'URL de carte: ${error}`);
      throw new Error('Impossible de générer l\'URL de carte');
    }
  }
  
  /**
   * Fonction avancée pour la migration de cartes anciennes vers le nouveau format
   * @param legacyCardData Données de la carte au format ancien
   * @returns Données de la carte au format nouveau
   */
  migrateCardFormat(legacyCardData: any): { pub: Address; id: number; priv: CryptoJS.lib.WordArray } {
    try {
      debugService.info(`Migration d'une carte ancien format vers le nouveau format`);
      
      // Vérifier si les données contiennent une adresse au format Base64
      if (!legacyCardData.pub) {
        throw new Error('Données de carte incomplètes: adresse manquante');
      }
      
      // Convertir l'adresse Base64 en format hex si nécessaire
      let address: Address;
      if (legacyCardData.pub.includes('=') || /[+/]/.test(legacyCardData.pub)) {
        // Tenter de convertir l'adresse Base64 en hex
        address = AddressUtils.normalizeAddress(
          AddressUtils.base64ToAddress(legacyCardData.pub)
        ) as Address;
        
        if (!address) {
          // Fallback: utiliser l'adresse telle quelle
          address = legacyCardData.pub as Address;
        }
      } else {
        // L'adresse est probablement déjà au format hex
        address = AddressUtils.normalizeAddress(legacyCardData.pub) as Address;
      }
      
      // S'assurer que nous avons un ID valide
      const id = typeof legacyCardData.id === 'number' ? 
        legacyCardData.id : 
        (typeof legacyCardData.id === 'string' ? parseInt(legacyCardData.id, 10) : 0);
      
      if (isNaN(id) || id <= 0) {
        throw new Error('ID de carte invalide');
      }
      
      // Traitement de la clé privée
      let privKey: CryptoJS.lib.WordArray;
      
      if (legacyCardData.priv) {
        if (typeof legacyCardData.priv === 'string') {
          // La clé est une chaîne, la convertir en WordArray
          privKey = CryptoJS.enc.Base64.parse(legacyCardData.priv);
        } else {
          // La clé est probablement déjà un WordArray
          privKey = legacyCardData.priv;
        }
      } else {
        throw new Error('Clé privée manquante');
      }
      
      debugService.info(`Migration réussie: ID=${id}, Adresse=${this.sanitizeLogData(address)}`);
      
      return {
        pub: address,
        id,
        priv: privKey
      };
    } catch (error) {
      debugService.error(`Échec de la migration de format de carte: ${error}`);
      throw new Error(`Échec de la migration de format de carte: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Vérifie si une carte est dans l'ancien format
   */
  isLegacyCard(cardData: any): boolean {
    // Les anciennes cartes ont généralement l'adresse en format Base64
    if (cardData && cardData.pub) {
      return cardData.pub.includes('=') || /[+/]/.test(cardData.pub);
    }
    return false;
  }
}

// Exporter une instance de CryptoService au lieu de la classe elle-même
export const cryptoService = new CryptoService();