import { Address } from 'viem'
import { NetworkId } from '../../../types'

export interface VaultInfo {
  networkId: NetworkId
  vaultAddress: Address
}

export interface TVLEvent {
  amount: number
  timestamp: Date
}

export interface TvlBlock {
  tvl: number
  startTime: Date
  endTime: Date
}
