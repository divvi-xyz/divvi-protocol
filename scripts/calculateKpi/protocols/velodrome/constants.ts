import { Address } from 'viem'
import { NetworkId } from '../../../types'

export const VELODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES: Address[] = [
  '0x478946BcD4a5a22b316470F5486fAfb928C0bA25', // WETH/USDC
]

export const VELODROME_NETWORK_ID = NetworkId['op-mainnet']

export const VELODROME_UNIVERSAL_ROUTER_ADDRESS =
  '0x4bF3E32de155359D1D75e8B474b66848221142fc'
