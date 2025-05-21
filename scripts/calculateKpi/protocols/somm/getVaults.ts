import { Address, isAddress } from 'viem'
import { NetworkId } from '../../../types'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'
import { VaultInfo } from './types'

const SUPPORTED_SUFFIXES = ['arbitrum', 'optimism']

export async function getVaults(): Promise<VaultInfo[]> {
  const result = await fetchWithTimeout('https://api.sommelier.finance/tvl')
  if (!result.ok) {
    throw new Error(
      `Failed to fetch vaults from the Somm API: ${result.status} ${result.statusText}`,
    )
  }

  const { Response: response } = await result.json()
  return extractVaultInfo(response)
}

function extractVaultInfo(response: Record<string, number>): VaultInfo[] {
  return Object.keys(response)
    .map(extractValidVaultInfo)
    .filter((vault): vault is VaultInfo => vault !== null)
}

function extractValidVaultInfo(address: string): VaultInfo | null {
  const baseAddress = address.split('-')[0]
  const suffix = getSuffix(address)

  // Only allow base Ethereum addresses or supported suffixes / networks
  if (
    !isAddress(baseAddress) ||
    (suffix && !SUPPORTED_SUFFIXES.includes(suffix))
  ) {
    return null
  }

  return {
    networkId: getNetworkId(suffix),
    vaultAddress: baseAddress as Address,
  }
}

function getSuffix(address: string): string | null {
  const parts = address.split('-')
  return parts.length > 1 ? parts[1] : null
}

function getNetworkId(suffix: string | null): NetworkId {
  switch (suffix) {
    case 'arbitrum':
      return NetworkId['arbitrum-one']
    case 'optimism':
      return NetworkId['op-mainnet']
    default:
      return NetworkId['ethereum-mainnet']
  }
}
