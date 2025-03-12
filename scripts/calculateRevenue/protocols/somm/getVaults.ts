import { NetworkId } from '../../../types'
import { VaultInfo } from './types'

// TODO(ENG-202): Dynamically fetch vaults from the Somm API
export function getVaults(): VaultInfo[] {
  return [
    // Real Yield ETH on Arbitrum
    {
      networkId: NetworkId['arbitrum-one'],
      vaultAddress: '0xc47bb288178ea40bf520a91826a3dee9e0dbfa4c',
    },
  ]
}
