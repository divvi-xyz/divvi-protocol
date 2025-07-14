import { RedisClientType } from '@redis/client'
import { Address } from 'viem'

export const protocols = [
  'beefy',
  'aerodrome',
  'somm',
  'celo-pg',
  'arbitrum',
  'velodrome',
  'fonbnk',
  'aave',
  'celo-transactions',
  'rhino',
  'scout-game-v0',
  'lisk-v0',
  'blaze-the-base',
] as const
export type Protocol = (typeof protocols)[number]

export type FilterFn = (
  events: ReferralEvent[],
  filterParams?: FilterParams,
) => Promise<ReferralEvent[]>

export type MatcherFn = (
  event: ReferralEvent,
  filterParams?: FilterParams,
) => Promise<boolean>

export enum NetworkId {
  'celo-mainnet' = 'celo-mainnet',
  'celo-alfajores' = 'celo-alfajores',
  'ethereum-mainnet' = 'ethereum-mainnet',
  'ethereum-sepolia' = 'ethereum-sepolia',
  'arbitrum-one' = 'arbitrum-one',
  'arbitrum-sepolia' = 'arbitrum-sepolia',
  'op-mainnet' = 'op-mainnet',
  'op-sepolia' = 'op-sepolia',
  'polygon-pos-mainnet' = 'polygon-pos-mainnet',
  'polygon-pos-amoy' = 'polygon-pos-amoy',
  'base-mainnet' = 'base-mainnet',
  'base-sepolia' = 'base-sepolia',
  'lisk-mainnet' = 'lisk-mainnet',
}

export interface TokenPriceData {
  priceUsd: string
  priceFetchedAt: number
}

/**
 * Represents the result of a KPI computation.
 *
 * @template T - The allowed string keys for the metadata.
 * - `kpi`: overall KPI value.
 * - `metadata`: an optional map from typed segment keys to their KPI values.
 */
export interface KpiResult<T extends string = string> {
  kpi: number
  metadata?: Record<T, number>
}

export type CalculateKpiFn<T extends string = string> = (params: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
  redis?: RedisClientType
}) => Promise<KpiResult<T>>

export interface ReferralEvent {
  userAddress: string
  timestamp: number
  referrerId: string
  protocol: Protocol
}

export interface FilterParams {
  allowList?: Address[]
}
