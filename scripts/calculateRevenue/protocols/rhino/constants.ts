import { Address, encodeEventTopics } from 'viem'
import { NetworkId } from '../../../types'
import { rhinoFiBridgeAbi } from '../../../abis/RhinoFiBridge'

export const BRIDGE_VOLUME_USD_PRECISION = 8

export const NATIVE_TOKEN_DECIMALS = 18n

// Contract addresses on different chains
export const NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS: Partial<
  Record<NetworkId, Address>
> = {
  [NetworkId['base-mainnet']]: '0x2f59e9086ec8130e21bd052065a9e6b2497bb102',
  [NetworkId['polygon-pos-mainnet']]:
    '0xba4eee20f434bc3908a0b18da496348657133a7e',
  [NetworkId['celo-mainnet']]: '0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1',
}

// Event topic to detect user bridges
export const BRIDGED_WITHDRAWAL_TOPIC = encodeEventTopics({
  abi: rhinoFiBridgeAbi,
  eventName: 'BridgedWithdrawal',
})[0]
