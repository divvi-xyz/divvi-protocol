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

export interface DailySnapshot {
  block_number: number
  cellar_address: Address
  daily_apy: number
  price_usd: number
  share_price: number
  timestamp: string
  total_assets: number
  tvl: number
  unix_seconds: number
}
