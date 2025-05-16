import { encodeEventTopics } from 'viem'
import { NetworkId } from '../../../types'
import { rhinoFiBridgeAbi } from '../../../abis/RhinoFiBridge'

export const BRIDGE_VOLUME_USD_PRECISION = 8

export const ALL_ZEROES_ADDRESS = '0x0000000000000000000000000000000000000000'
export const NATIVE_TOKEN_DECIMALS = 18n

// Contract addresses on different chains
export const NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS: Partial<
  Record<NetworkId, string>
> = {
  [NetworkId['base-mainnet']]: '0x2f59E9086ec8130E21BD052065a9E6B2497bb102',
  [NetworkId['polygon-pos-mainnet']]:
    '0xBA4EEE20F434bC3908A0B18DA496348657133A7E',
  [NetworkId['celo-mainnet']]: '0x5e023c31E1d3dCd08a1B3e8c96f6EF8Aa8FcaCd1',
}

// Deposit event topic
export const BRIDGED_DEPOSIT_WITH_ID_TOPIC = encodeEventTopics({
  abi: rhinoFiBridgeAbi,
  eventName: 'BridgedDepositWithId',
})[0]
