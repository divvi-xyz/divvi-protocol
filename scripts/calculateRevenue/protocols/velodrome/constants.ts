import { Address } from 'viem'
import { NetworkId } from '../../../types'

export const VELODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES: Address[] = [
  '0x478946BcD4a5a22b316470F5486fAfb928C0bA25', // WETH/USDC
]

export const VELODROME_NETWORK_ID = NetworkId['op-mainnet']
