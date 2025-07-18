import { Address } from 'viem'
import { NetworkId } from '../types'
import {
  arbitrum,
  base,
  celo,
  optimism,
  polygon,
  lisk,
  ink,
  unichain,
  avalanche,
  berachain,
  Chain,
  mainnet,
} from 'viem/chains'

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
  [NetworkId['ethereum-mainnet']]: 'https://eth.hypersync.xyz',
  [NetworkId['op-mainnet']]: 'https://optimism.hypersync.xyz',
  [NetworkId['polygon-pos-mainnet']]: 'https://polygon.hypersync.xyz',
  [NetworkId['lisk-mainnet']]: 'https://lisk.hypersync.xyz',
  [NetworkId['ink-mainnet']]: 'https://ink.hypersync.xyz',
  [NetworkId['unichain-mainnet']]: 'https://unichain.hypersync.xyz',
  [NetworkId['avalanche-mainnet']]: 'https://avalanche.hypersync.xyz',
  [NetworkId['berachain-mainnet']]: 'https://berachain.hypersync.xyz',
  [NetworkId['mantle-mainnet']]: 'https://mantle.hypersync.xyz',
} as Partial<Record<NetworkId, string>>

export const NETWORK_ID_TO_VIEM_CHAIN = {
  [NetworkId['ethereum-mainnet']]: mainnet,
  [NetworkId['arbitrum-one']]: arbitrum,
  [NetworkId['base-mainnet']]: base,
  [NetworkId['celo-mainnet']]: celo,
  [NetworkId['op-mainnet']]: optimism,
  [NetworkId['polygon-pos-mainnet']]: polygon,
  [NetworkId['lisk-mainnet']]: lisk,
  [NetworkId['ink-mainnet']]: ink,
  [NetworkId['unichain-mainnet']]: unichain,
  [NetworkId['avalanche-mainnet']]: avalanche,
  [NetworkId['berachain-mainnet']]: berachain,
} satisfies Record<NetworkId, Chain>
