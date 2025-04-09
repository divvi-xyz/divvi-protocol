import { Address } from 'viem'

export interface BalanceSnapshot {
  scaledATokenBalance: bigint
  liquidityIndex: bigint
  timestamp: number
}

export interface ReserveFactor {
  reserveFactor: bigint
  timestamp: number
}

export interface ReserveData {
  reserveTokenAddress: Address
  reserveTokenDecimals: number
  aTokenAddress: Address
  liquidityIndex: bigint
  reserveFactor: bigint
}
