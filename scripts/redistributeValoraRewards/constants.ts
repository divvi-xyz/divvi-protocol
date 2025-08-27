import { NetworkId } from '../types'

export const NETWORK_ID_TO_SAFE_CONFIG: Partial<
  Record<
    NetworkId,
    {
      apiUrl: string
      shortName: string
    }
  >
> = {
  [NetworkId['celo-mainnet']]: {
    apiUrl: 'https://safe-transaction-celo.safe.global/api',
    shortName: 'celo',
  },
  [NetworkId['ethereum-mainnet']]: {
    apiUrl: 'https://safe-transaction-mainnet.safe.global/api',
    shortName: 'eth',
  },
  [NetworkId['arbitrum-one']]: {
    apiUrl: 'https://safe-transaction-arbitrum.safe.global/api',
    shortName: 'arb1',
  },
  [NetworkId['op-mainnet']]: {
    apiUrl: 'https://safe-transaction-optimism.safe.global/api',
    shortName: 'oeth',
  },
  [NetworkId['base-mainnet']]: {
    apiUrl: 'https://safe-transaction-base.safe.global/api',
    shortName: 'base',
  },
  [NetworkId['polygon-pos-mainnet']]: {
    apiUrl: 'https://safe-transaction-polygon.safe.global/api',
    shortName: 'pol',
  },
}
