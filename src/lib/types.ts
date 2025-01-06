import type { Address, Hash } from 'viem'

export interface CardInfo {
  id: number
  pub: Address
  priv: CryptoJS.lib.WordArray
  css?: string
  svg?: string
  model?: number
  balance?: string
  key?: string
}

export interface TransactionRequest {
  to: Address
  value: string 
  gasPrice?: string
  gasLimit?: string
  data?: string
}

export interface TransactionRecord {
  hash: Hash
  timestamp: number
  from: Address
  to: Address
  amount: string
  status: 'pending' | 'confirmed' | 'failed'
}

export interface WalletSession {
  topic: string
  peer: {
    metadata: {
      name: string
      description: string
      url: string
      icons: string[]
    }
  }
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}
export type CardMode = 'read' | 'write' | 'payment' | 'verify' | 'setup';

export interface CardDesign {
  id_model: number
  css: string
  svg: string
}