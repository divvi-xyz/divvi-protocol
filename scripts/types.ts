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

export type CalculateKpiFn = (params: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}) => Promise<number>

export interface ReferralEvent {
  userAddress: string
  timestamp: number
  referrerId: string
  protocol: Protocol
}

export interface FilterParams {
  allowList?: Address[]
}
