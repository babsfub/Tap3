import CryptoJS from 'crypto-js'
import type { Address } from 'viem'
import type { CardInfo } from '$lib/types.js'
import { debugService } from './DebugService.js'

class CryptoService {
  // Exemple de modification pour cryptoService.parseCardUrl
parseCardUrl(data: string): any {
  try {
    debugService.debug(`Parsing card data: ${data.substring(0, 20)}...`);
    
    // Extraire la partie après le # si c'est une URL complète
    if (data.includes('#')) {
      const hashPart = data.split('#')[1];
      debugService.debug(`Found URL format, extracting hash part: ${hashPart.substring(0, 20)}...`);
      data = hashPart;
    }
    
    // Diviser les parties (pub:priv:id)
    const parts = data.split(':');
    if (parts.length !== 3) {
      debugService.error(`Invalid card data format, expected 3 parts but got ${parts.length}`);
      return null;
    }
    
    // Traiter l'ID explicitement
    const pubKey = parts[0];
    const privKey = parts[1];
    const idRaw = parts[2];
    
    // Conversion explicite de l'ID
    let id: number;
    try {
      id = this.base64ToBase10(idRaw);
      debugService.debug(`Successfully converted ID from base64 to number: ${id}`);
    } catch (e) {
      debugService.error(`Failed to convert ID: ${idRaw}, error: ${e}`);
      return null;
    }
    
    return {
      pub: pubKey.startsWith('0x') ? pubKey : `0x${pubKey}`,
      priv: this.base64ToHex(privKey),
      id: id
    };
  } catch (error) {
    debugService.error(`Card parsing error: ${error}`);
    return null;
  }
}

  public validatePassword(password: string): boolean {
    return password.length >= 3
  }

  public encryptPrivateKey(privateKey: string, password: string): string {
    if (!this.validatePassword(password)) {
      throw new Error('Invalid password')
    }

    try {
      const priv = CryptoJS.enc.Hex.parse(
        privateKey.replace('0x','')
      )
      const encrypted = CryptoJS.AES.encrypt(priv, password).toString()
      const decrypted = CryptoJS.AES.decrypt(encrypted, password)
      if (privateKey.replace('0x', '') !== decrypted.toString()) {
        throw new Error('Encryption verification failed')
      }

      return encrypted
    } catch (error) {
      throw new Error('Encryption failed')
    }
  }

  public decryptPrivateKey(encryptedKey: CryptoJS.lib.WordArray | string, password: string): string {
    if (!this.validatePassword(password)) {
      throw new Error('Invalid password')
    }

    try {
      const encryptedStr = typeof encryptedKey === 'string' 
        ? encryptedKey 
        : CryptoJS.enc.Base64.stringify(encryptedKey)
      
      const decrypted = CryptoJS.AES.decrypt(encryptedStr, password).toString()
      
      if (!decrypted || decrypted.length !== 64) {
        throw new Error('Decryption failed')
      }

      return `0x${decrypted}`
    } catch (error) {
      throw new Error('Failed to decrypt')
    }
  }

  private base64ToHex(str: string): string {
    if (!str) throw new Error('Invalid input')
    
    try {
      const raw = atob(str)
      let result = ''
      for (let i = 0; i < raw.length; i++) {
        const hex = raw.charCodeAt(i).toString(16)
        result += (hex.length === 2 ? hex : '0' + hex)
      }
      return result.toLowerCase()
    } catch (error) {
      throw new Error('Invalid base64 string')
    }
  }

  private hexToBase64(hex: string): string {
    const pub = CryptoJS.enc.Hex.parse(hex.replace('0x',''))
    return CryptoJS.enc.Base64.stringify(pub)
  }

  private base64ToBase10(str: string): number {
    if (!str) throw new Error('Invalid input')

    const order = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    const base = order.length
    let num = 0
    
    for (const char of str) {
      const value = order.indexOf(char)
      if (value === -1) throw new Error('Invalid character')
      num = num * base + value
    }
    
    return num
  }

  private base10ToBase64(num: number): string {
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

  public generateCardUrl(cardInfo: CardInfo): string {
    const currentDomain = window.location.origin;
    const pubBase64 = this.hexToBase64(cardInfo.pub)
    const idBase64 = this.base10ToBase64(cardInfo.id)
    const privBase64 = CryptoJS.enc.Base64.stringify(cardInfo.priv)
    
    return `${currentDomain}/#${pubBase64}:${privBase64}:${idBase64}`
  }
}

export const cryptoService = new CryptoService()