import { Address } from 'viem'

export interface FonbnkAsset {
  network: FonbnkNetwork
  asset: string
}

export interface FonbnkPayoutWalletReponse {
  wallets: Address[]
}

export interface FonbnkTransaction {
  amount: bigint
  tokenAddress: Address
  timestamp: Date
}

export const SUPPORTED_FONBNK_NETWORKS = [
  'CELO',
  'ETHEREUM',
  'ARBITRUM',
  'OPTIMISM',
  'POLYGON',
  'BASE',
]
export type FonbnkNetwork = (typeof SUPPORTED_FONBNK_NETWORKS)[number]
