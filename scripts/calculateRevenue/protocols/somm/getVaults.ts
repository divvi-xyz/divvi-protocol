import { Address, isAddress } from 'viem'
import { NetworkId } from '../../../types'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'
import { VaultInfo } from './types'

export async function getVaults(): Promise<VaultInfo[]> {
  try {
    const result = await fetchWithTimeout('https://api.sommelier.finance/tvl')
    if (!result.ok) {
      throw new Error(
        `Failed to fetch vaults from the Somm API: ${result.status} ${result.statusText}`,
      )
    }

    const { Response: response } = await result.json()
    return extractVaultInfo(response)
  } catch (error) {
    console.error('Error in getVaults:', error)
    return getFallbackVaults()
  }
}

function extractVaultInfo(response: Record<string, number>): VaultInfo[] {
  return Object.keys(response)
    .filter((address) => isValidVaultAddress(address))
    .map((address) => ({
      networkId: getNetworkId(address),
      vaultAddress: address.split('-')[0] as Address,
    }))
}

function isValidVaultAddress(address: string): boolean {
  return (
    address.endsWith('-arbitrum') ||
    address.endsWith('-optimism') ||
    isAddress(address)
  )
}

function getNetworkId(address: string): NetworkId {
  if (address.endsWith('-arbitrum')) return NetworkId['arbitrum-one']
  if (address.endsWith('-optimism')) return NetworkId['op-mainnet']
  return NetworkId['ethereum-mainnet']
}

function getFallbackVaults(): VaultInfo[] {
  return [
    // Real Yield ETH on Arbitrum
    {
      networkId: NetworkId['arbitrum-one'],
      vaultAddress: '0xc47bb288178ea40bf520a91826a3dee9e0dbfa4c',
    },
  ]
}
