// lib/utils/AddressUtils.ts - Version optimisée pour la compatibilité
import { isAddress } from 'viem';
import type { Address } from 'viem';
import { debugService } from '../services/DebugService.js';

/**
 * Classe utilitaire pour la gestion des adresses Ethereum avec prise en charge des formats legacy
 */
export class AddressUtils {
  /**
   * Normalise une adresse Ethereum en format checksum avec compatibilité legacy
   * @param address L'adresse à normaliser
   * @returns L'adresse normalisée ou null si invalide
   */
  static normalizeAddress(address: string | null | undefined): Address | null {
    if (!address) return null;
    
    try {
      // Nettoyer l'adresse
      let cleanAddr = address.trim();
      
      // COMPATIBILITÉ LEGACY: Support pour les anciennes cartes
      // Les anciennes cartes peuvent utiliser un format Base64 pour l'adresse
      if (cleanAddr.includes('=') || /[+/]/.test(cleanAddr)) {
        debugService.info(`Format legacy détecté pour l'adresse: ${cleanAddr.substring(0, 8)}...`);
        
        try {
          // Tenter de convertir l'adresse Base64 en format hexadécimal
          const hexAddr = this.base64ToAddress(cleanAddr);
          if (hexAddr && isAddress(hexAddr)) {
            return hexAddr;
          }
        } catch (e) {
          // Si la conversion échoue, conserver le format original
          debugService.warn(`Conversion Base64->Hex échouée, utilisation du format original: ${e}`);
        }
        
        // Retourner l'adresse legacy telle quelle
        return cleanAddr as Address;
      }
      
      // Ajouter le préfixe 0x si absent
      if (!cleanAddr.startsWith('0x')) {
        cleanAddr = `0x${cleanAddr}`;
      }
      
      // Vérifier si l'adresse est au format standard (40 caractères après 0x)
      if (cleanAddr.length !== 42) {
        debugService.warn(`Adresse non-standard: ${cleanAddr.substring(0, 10)}... (${cleanAddr.length} caractères)`);
        
        // Pour les adresses non-standard mais commençant par 0x, les accepter
        if (cleanAddr.startsWith('0x')) {
          return cleanAddr as Address;
        }
      }
      
      // Vérification standard pour les nouvelles cartes
      if (!isAddress(cleanAddr as Address)) {
        debugService.warn(`Format d'adresse invalide: ${cleanAddr.substring(0, 10)}...`);
        return null;
      }
      
      // Retourner l'adresse normalisée
      return cleanAddr.toLowerCase() as Address;
    } catch (error) {
      debugService.error(`Erreur de normalisation d'adresse: ${error}`);
      return null;
    }
  }
  
  /**
   * Convertit une chaîne Base64 en adresse hexadécimale
   * @param base64String La chaîne Base64 à convertir
   * @returns L'adresse au format hexadécimal
   */
  static base64ToAddress(base64String: string): Address {
    try {
      // Décodage Base64 -> binaire
      const binary = atob(base64String);
      
      // Conversion binaire -> hex
      let hex = '0x';
      for (let i = 0; i < binary.length; i++) {
        const hexByte = binary.charCodeAt(i).toString(16).padStart(2, '0');
        hex += hexByte;
      }
      
      // Vérifier si la longueur est correcte pour une adresse Ethereum (0x + 40 caractères)
      if (hex.length !== 42) {
        debugService.warn(`Longueur d'adresse convertie incorrecte: ${hex.length-2} chars (attendu: 40)`);
        
        // Si la conversion donne une adresse trop longue, tronquer
        if (hex.length > 42) {
          hex = `0x${hex.slice(2, 42)}`;
        }
        // Si la conversion donne une adresse trop courte, remplir avec des zéros
        else if (hex.length < 42) {
          hex = hex.padEnd(42, '0');
        }
      }
      
      return hex as Address;
    } catch (e) {
      debugService.error(`Échec de conversion Base64->Hex: ${e}`);
      throw new Error('Format Base64 invalide');
    }
  }
  
  /**
   * Formate une adresse pour l'affichage
   * @param address L'adresse à formater
   * @param truncate Option pour tronquer l'adresse (true par défaut)
   * @returns L'adresse formatée
   */
  static formatAddress(address: string | null | undefined, truncate = true): string {
    if (!address) return '';
    
    // Support pour les adresses au format Base64 (Legacy)
    if (address.includes('=') || /[+/]/.test(address)) {
      // Adresse au format Base64, montrer telle quelle
      if (truncate && address.length > 10) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
      return address;
    }
    
    const normalizedAddr = this.normalizeAddress(address);
    if (!normalizedAddr) return '';
    
    if (truncate) {
      return `${normalizedAddr.slice(0, 6)}...${normalizedAddr.slice(-4)}`;
    }
    
    return normalizedAddr;
  }
  
  /**
   * Compare deux adresses en ignorant la casse et format
   * @param addr1 Première adresse
   * @param addr2 Deuxième adresse
   * @returns true si les adresses sont identiques
   */
  static compareAddresses(addr1: string | null | undefined, addr2: string | null | undefined): boolean {
    if (!addr1 || !addr2) return false;
    
    // Support legacy: si les deux adresses sont au format Base64, comparaison directe
    if ((addr1.includes('=') || /[+/]/.test(addr1)) && (addr2.includes('=') || /[+/]/.test(addr2))) {
      return addr1 === addr2;
    }
    
    // Pour les adresses mixtes (une Base64, une Hex), tenter la conversion
    if (addr1.includes('=') || /[+/]/.test(addr1)) {
      try {
        const hexAddr1 = this.base64ToAddress(addr1);
        if (hexAddr1) {
          addr1 = hexAddr1;
        }
      } catch (e) {
        // Si la conversion échoue, conserver l'original
      }
    }
    
    if (addr2.includes('=') || /[+/]/.test(addr2)) {
      try {
        const hexAddr2 = this.base64ToAddress(addr2);
        if (hexAddr2) {
          addr2 = hexAddr2;
        }
      } catch (e) {
        // Si la conversion échoue, conserver l'original
      }
    }
    
    // Normaliser les deux adresses avant comparaison
    const normalized1 = this.normalizeAddress(addr1);
    const normalized2 = this.normalizeAddress(addr2);
    
    if (!normalized1 || !normalized2) return false;
    
    return normalized1.toLowerCase() === normalized2.toLowerCase();
  }
  
  /**
   * Convertit une adresse hexadécimale en format base64
   * @param address L'adresse à convertir
   * @returns L'adresse au format base64
   */
  static addressToBase64(address: string | null | undefined): string {
    if (!address) return '';
    
    // Si déjà au format Base64, retourner telle quelle
    if (address.includes('=') || /[+/]/.test(address)) {
      return address;
    }
    
    const normalizedAddr = this.normalizeAddress(address);
    if (!normalizedAddr) return '';
    
    try {
      // Enlever le préfixe 0x
      const addrWithoutPrefix = normalizedAddr.slice(2);
      
      // Convertir en Uint8Array
      const bytes = new Uint8Array(addrWithoutPrefix.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        const hexByte = addrWithoutPrefix.substr(i * 2, 2);
        bytes[i] = parseInt(hexByte, 16);
      }
      
      // Convertir en base64
      const binary = String.fromCharCode(...bytes);
      const base64 = btoa(binary);
      
      return base64;
    } catch (error) {
      debugService.error(`Erreur de conversion Hex->Base64: ${error}`);
      return '';
    }
  }
  
  /**
   * Extrait l'adresse d'une URL de carte Tap3
   * @param url L'URL de la carte
   * @returns L'adresse extraite
   */
  static extractAddressFromCardUrl(url: string): Address | null {
    if (!url) return null;
    
    try {
      // Extraire la partie après le #
      const hashPart = url.includes('#') ? url.split('#')[1] : url;
      
      // Vérifier si le format est valide (pub:priv:id)
      const parts = hashPart.split(':');
      if (parts.length !== 3) {
        debugService.warn(`Format d'URL de carte invalide: ${url}`);
        return null;
      }
      
      // Support legacy: adresse au format Base64
      if (parts[0].includes('=') || /[+/]/.test(parts[0])) {
        return parts[0] as Address;
      }
      
      // Traiter comme une adresse Ethereum standard
      return this.normalizeAddress(parts[0]);
    } catch (error) {
      debugService.error(`Erreur d'extraction d'adresse depuis l'URL: ${error}`);
      return null;
    }
  }
}