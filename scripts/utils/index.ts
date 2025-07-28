import { NetworkId } from '../types'
import { registryContractAbi } from '../../abis/Registry'
import ERC20Abi from '../abis/ERC20'
import { createPublicClient, http, getContract, Address } from 'viem'
import memoize from '@github/memoize'
import * as dotenv from 'dotenv'
import {
  NETWORK_ID_TO_HYPERSYNC_URL,
  NETWORK_ID_TO_VIEM_CHAIN,
} from './networks'
import { HypersyncClient } from '@envio-dev/hypersync-client'

dotenv.config()

// Make sure the alchemy key has all our supported networks enabled
const ALCHEMY_KEY = process.env.ALCHEMY_KEY

export const NETWORK_ID_TO_ALCHEMY_RPC_URL: Record<
  NetworkId,
  string | undefined
> = {
  [NetworkId['ethereum-mainnet']]: 'https://eth-mainnet.g.alchemy.com/v2/',
  [NetworkId['arbitrum-one']]: 'https://arb-mainnet.g.alchemy.com/v2/',
  [NetworkId['op-mainnet']]: 'https://opt-mainnet.g.alchemy.com/v2/',
  [NetworkId['polygon-pos-mainnet']]:
    'https://polygon-mainnet.g.alchemy.com/v2/',
  [NetworkId['base-mainnet']]: 'https://base-mainnet.g.alchemy.com/v2/',
  [NetworkId['celo-mainnet']]: 'https://celo-mainnet.g.alchemy.com/v2/',
  [NetworkId['lisk-mainnet']]: undefined, // Lisk is not supported by Alchemy at the time of writing
  [NetworkId['avalanche-mainnet']]: 'https://avax-mainnet.g.alchemy.com/v2/',
  [NetworkId['ink-mainnet']]: 'https://ink-mainnet.g.alchemy.com/v2/',
  [NetworkId['unichain-mainnet']]: 'https://unichain-mainnet.g.alchemy.com/v2/',
  [NetworkId['berachain-mainnet']]:
    'https://berachain-mainnet.g.alchemy.com/v2/',
  [NetworkId['mantle-mainnet']]: 'https://mantle-mainnet.g.alchemy.com/v2/',
}

/**
 * Gets a public Viem client for a given NetworkId
 */
export function getViemPublicClient(networkId: NetworkId) {
  // there are some networks that don't fit the usual viem client pattern
  // so we handle them separately
  if (networkId === NetworkId['celo-mainnet']) {
    return createPublicClient({
      chain: NETWORK_ID_TO_VIEM_CHAIN[networkId],
      transport: http(),
    })
  }

  return createPublicClient({
    chain: NETWORK_ID_TO_VIEM_CHAIN[networkId],
    batch: { multicall: true },
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[networkId], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  })
}

// Hypersync Client Factory (Lazy Singleton)
const hypersyncClients = new Map<NetworkId, HypersyncClient>()

/**
 * Gets a HyperSync client for a given NetworkId
 */
export function getHyperSyncClient(networkId: NetworkId): HypersyncClient {
  const url = NETWORK_ID_TO_HYPERSYNC_URL[networkId]

  if (!url) {
    throw new Error(`No HyperSync URL found for networkId: ${networkId}`)
  }

  let client = hypersyncClients.get(networkId)

  if (!client) {
    client = HypersyncClient.new({
      url,
      bearerToken: process.env.HYPERSYNC_API_KEY,
    })

    hypersyncClients.set(networkId, client)
  }

  return client
}

function _getBlock(networkId: NetworkId, blockNumber: bigint) {
  return getViemPublicClient(networkId).getBlock({
    blockNumber,
  })
}

export const getBlock = memoize(_getBlock, {
  hash: (...params: Parameters<typeof _getBlock>) => params.join(','),
})

/**
 * Returns a contract object representing the registry
 */
export async function getRegistryContract(
  registryAddress: Address,
  networkId: NetworkId,
) {
  const client = getViemPublicClient(networkId)
  return getContract({
    address: registryAddress,
    abi: registryContractAbi,
    client,
  })
}

export async function getErc20Contract(address: Address, networkId: NetworkId) {
  const client = getViemPublicClient(networkId)
  return getContract({
    address: address,
    abi: ERC20Abi,
    client,
  })
}
