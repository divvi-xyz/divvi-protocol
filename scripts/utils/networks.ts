import { Address } from 'viem'
import { NetworkId } from '../types'

export const NETWORK_ID_TO_REGISTRY_ADDRESS = {
  [NetworkId['arbitrum-one']]: '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
  [NetworkId['base-mainnet']]: '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
  [NetworkId['celo-mainnet']]: '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
  [NetworkId['op-mainnet']]: '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
  [NetworkId['polygon-pos-mainnet']]:
    '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
} as Partial<Record<NetworkId, Address>>

export const supportedNetworkIds = [
  NetworkId['arbitrum-one'],
  NetworkId['base-mainnet'],
  NetworkId['celo-mainnet'],
  NetworkId['op-mainnet'],
  NetworkId['polygon-pos-mainnet'],
]

// Source https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks
export const NETWORK_ID_TO_HYPERSYNC_URL = {
  [NetworkId['arbitrum-one']]: 'https://arbitrum.hypersync.xyz',
  [NetworkId['base-mainnet']]: 'https://base.hypersync.xyz',
  [NetworkId['celo-mainnet']]: 'https://celo.hypersync.xyz',
  [NetworkId['op-mainnet']]: 'https://optimism.hypersync.xyz',
  [NetworkId['polygon-pos-mainnet']]: 'https://polygon.hypersync.xyz',
} as Partial<Record<NetworkId, string>>
