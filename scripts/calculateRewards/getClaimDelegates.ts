import { Address, zeroAddress } from 'viem'
import { divviRegistryAbi } from '../../abis/DivviRegistry'
import { NetworkId } from '../types'
import { getViemPublicClient } from '../utils'
import { NETWORK_ID_TO_VIEM_CHAIN } from '../utils/networks'

// DivviRegistry contract address on OP mainnet
const DIVVI_REGISTRY_ADDRESS = '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'

// Generic helper function to get claim delegate mappings from DivviRegistry
export async function getClaimDelegates(
  entities: string[],
  networkId: NetworkId,
  divviRegistryAddress: string = DIVVI_REGISTRY_ADDRESS,
): Promise<Record<string, string>> {
  let claimDelegates: Record<string, string> = {}

  const client = getViemPublicClient(networkId)
  const chainId = `eip155:${NETWORK_ID_TO_VIEM_CHAIN[networkId].id}`

  // Get claim delegates for all entities in parallel
  const claimDelegatesEntries = await Promise.all(
    entities.map(async (entity) => {
      try {
        const delegate = await client.readContract({
          address: divviRegistryAddress as Address,
          abi: divviRegistryAbi,
          functionName: 'getClaimDelegate',
          args: [entity as Address, chainId],
        })
        return [entity, delegate === zeroAddress ? entity : delegate]
      } catch {
        console.warn(
          `Failed to get claim delegate for ${entity}, falling back to entity address`,
        )
        return [entity, entity]
      }
    }),
  )

  claimDelegates = Object.fromEntries(claimDelegatesEntries)

  return claimDelegates
}
