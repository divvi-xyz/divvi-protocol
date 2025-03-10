import { Address } from 'viem'
import { NetworkId } from '../../../types'

export interface VaultInfo {
  networkId: NetworkId
  vaultAddress: Address
}

export interface TvlEvent {
  amount: number
  timestamp: Date
}
