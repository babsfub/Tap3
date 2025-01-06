import { parseUnits, type Hash } from 'viem'
import type { TransactionRequest } from '../types.js'
import { walletService } from './wallet.js'

class TransactionService {
  private MAX_GAS_LIMIT = 21000n // Standard ETH transfer
  
  async sendTransaction(request: TransactionRequest): Promise<Hash> {
    try {
      // Validate inputs
      if (!request.to || !request.value) {
        throw new Error('Invalid transaction parameters')
      }

      // Estimate gas if not provided
      if (!request.gasLimit) {
        request.gasLimit = await this.estimateGas(request)
      }

      // Get current gas price if not provided
      if (!request.gasPrice) {
        request.gasPrice = await walletService.getGasPrice()
      }

      const tx = await walletService.sendTransaction({
        to: request.to,
        value: parseUnits(request.value, 18).toString(), // Always use 18 decimals for MATIC
        gasPrice: BigInt(request.gasPrice!).toString(),
        gasLimit: BigInt(request.gasLimit).toString(),
        data: request.data || '0x'
      })

      return tx.hash
    } catch (error) {
      console.error('Transaction failed:', error)
      throw new Error('Failed to send transaction')
    }
  }

  async getTransactionStatus(hash: Hash): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
      const receipt = await walletService.getTransactionReceipt(hash)
      
      if (!receipt) {
        return 'pending'
      }

      return receipt.status ? 'confirmed' : 'failed'
    } catch (error) {
      console.error('Failed to get transaction status:', error)
      throw error
    }
  }

  async estimateGas(request: TransactionRequest): Promise<string> {
    try {
      const estimated = await walletService.estimateGas({
        to: request.to,
        value: parseUnits(request.value, 18).toString(),
        data: request.data || '0x'
      })

      // Add 10% buffer
      const withBuffer = (estimated * 110n) / 100n

      // Cap at max gas limit
      return withBuffer > this.MAX_GAS_LIMIT 
        ? this.MAX_GAS_LIMIT.toString()
        : withBuffer.toString()
    } catch (error) {
      console.error('Gas estimation failed:', error)
      throw error
    }
  }
}

export const transactionService = new TransactionService()