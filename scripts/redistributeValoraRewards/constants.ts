import { Address } from 'viem'
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

export const VALORA_DIVVI_IDENTIFIER: Address =
  '0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad'
export const VALORA_MEDIUM_SECURITY_SAFE_ADDRESS: Address =
  '0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4'
