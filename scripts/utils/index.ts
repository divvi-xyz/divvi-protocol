import { NetworkId } from '../types'
import { registryContractAbi } from '../../abis/Registry'
import ERC20Abi from '../abis/ERC20'
import { mainnet, arbitrum, optimism, polygon, base, celo } from 'viem/chains'
import {
  createPublicClient,
  http,
  getContract,
  Address,
  PublicClient,
} from 'viem'
import memoize from '@github/memoize'
import * as dotenv from 'dotenv'

dotenv.config()

// Make sure the alchemy key has all our supported networks enabled
const ALCHEMY_KEY = process.env.ALCHEMY_KEY

const NETWORK_ID_TO_ALCHEMY_RPC_URL = {
  [NetworkId['ethereum-mainnet']]: 'https://eth-mainnet.g.alchemy.com/v2/',
  [NetworkId['arbitrum-one']]: 'https://arb-mainnet.g.alchemy.com/v2/',
  [NetworkId['op-mainnet']]: 'https://opt-mainnet.g.alchemy.com/v2/',
  [NetworkId['polygon-pos-mainnet']]:
    'https://polygon-mainnet.g.alchemy.com/v2/',
  [NetworkId['base-mainnet']]: 'https://base-mainnet.g.alchemy.com/v2/',
}

const NETWORK_ID_TO_VIEM_CLIENT = {
  [NetworkId['ethereum-mainnet']]: createPublicClient({
    chain: mainnet,
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[NetworkId['ethereum-mainnet']], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  }),
  [NetworkId['arbitrum-one']]: createPublicClient({
    chain: arbitrum,
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[NetworkId['arbitrum-one']], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  }),
  [NetworkId['op-mainnet']]: createPublicClient({
    chain: optimism,
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[NetworkId['op-mainnet']], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  }),
  [NetworkId['celo-mainnet']]: createPublicClient({
    chain: celo,
    transport: http(),
  }),
  [NetworkId['polygon-pos-mainnet']]: createPublicClient({
    chain: polygon,
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[NetworkId['polygon-pos-mainnet']], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  }),
  [NetworkId['base-mainnet']]: createPublicClient({
    chain: base,
    transport: ALCHEMY_KEY
      ? http(NETWORK_ID_TO_ALCHEMY_RPC_URL[NetworkId['base-mainnet']], {
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${ALCHEMY_KEY}`,
            },
          },
        })
      : http(),
  }),
} as unknown as Partial<Record<NetworkId, PublicClient>>

/**
 * Gets a public Viem client for a given NetworkId
 */
export function getViemPublicClient(networkId: NetworkId) {
  const client = NETWORK_ID_TO_VIEM_CLIENT[networkId]
  if (!client) {
    throw new Error(`No viem client found for networkId: ${networkId}`)
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
