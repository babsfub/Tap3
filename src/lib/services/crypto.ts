import CryptoJS from 'crypto-js'
import type { Address } from 'viem'
import type { CardInfo } from '$lib/types.js'

class CryptoService {
  public parseCardUrl(hash: string): Partial<CardInfo> | null {
    if (!hash) return null

    try {
      const [pub, priv, id] = hash.replace('#', '').split(':')
      
      if (!pub || !priv || !id) {
        throw new Error('Missing card data')
      }

      return {
        pub: `0x${this.base64ToHex(pub)}` as Address,
        priv: CryptoJS.enc.Base64.parse(priv), 
        id: this.base64ToBase10(id)
      }
    } catch (error) {
      console.error('Failed to parse card URL:', error)
      return null
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
    const pubBase64 = this.hexToBase64(cardInfo.pub)
    const idBase64 = this.base10ToBase64(cardInfo.id)
    const privBase64 = CryptoJS.enc.Base64.stringify(cardInfo.priv)
    
    return `#${pubBase64}:${privBase64}:${idBase64}`
  }
}

export const cryptoService = new CryptoService()