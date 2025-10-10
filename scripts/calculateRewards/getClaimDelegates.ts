import { Address, zeroAddress } from 'viem'
import { divviRegistryAbi } from '../../abis/DivviRegistry'
import { NetworkId } from '../types'
import { getViemPublicClient } from '../utils'
import { NETWORK_ID_TO_VIEM_CHAIN } from '../utils/networks'

// DivviRegistry contract address on OP mainnet
const DIVVI_REGISTRY_ADDRESS = '0x0000000000000000000000000000000000000000' // TODO: Replace with actual address

// Generic helper function to get claim delegate mappings from DivviRegistry
export async function getClaimDelegates(
  entities: string[],
  networkId: NetworkId,
  divviRegistryAddress: string = DIVVI_REGISTRY_ADDRESS,
): Promise<Record<string, string>> {
  const claimDelegates: Record<string, string> = {}

  try {
    const client = getViemPublicClient(networkId)
    const chainId = `eip155:${NETWORK_ID_TO_VIEM_CHAIN[networkId].id}`

    // Get claim delegates for all entities in parallel
    const delegatePromises = entities.map(async (entity) => {
      try {
        const delegate = await client.readContract({
          address: divviRegistryAddress as Address,
          abi: divviRegistryAbi,
          functionName: 'getClaimDelegate',
          args: [entity as Address, chainId],
        })
        // If delegate is 0 address, use the entity (referrerId) as fallback
        claimDelegates[entity] = delegate === zeroAddress ? entity : delegate
      } catch (error) {
        console.warn(`Failed to get claim delegate for ${entity}:`, error)
        // Fallback to using the entity (referrerId) if the call fails
        claimDelegates[entity] = entity
      }
    })

    await Promise.all(delegatePromises)
  } catch (error) {
    console.warn(
      'Failed to get claim delegates, falling back to entity addresses:',
      error,
    )
    // Fallback: use entity addresses as claim delegates
    entities.forEach((entity) => {
      claimDelegates[entity] = entity
    })
  }

  return claimDelegates
}
