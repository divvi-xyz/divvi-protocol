import { Address } from 'viem'
import { NetworkId } from '../types'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'

export async function getSafeOwners(
  address: Address,
  networkId: NetworkId,
): Promise<Address[]> {
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]
  if (!safeConfig) {
    throw new Error(`No Safe Info found for networkId: ${networkId}`)
  }
  const response = await fetch(`${safeConfig.apiUrl}/v1/safes/${address}/`)

  if (!response.ok) {
    throw new Error(
      `Failed to get Safe info: ${response.statusText}, ${await response.text()}`,
    )
  }

  const safeDetails = (await response.json()) as { owners: Address[] }
  return safeDetails.owners
}
