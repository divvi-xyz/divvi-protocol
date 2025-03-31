import {
  VELODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES,
  VELODROME_NETWORK_ID,
} from './constants'
import { calculateRevenueDrome } from '../utils/drome/calculateRevenueDrome'

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  return calculateRevenueDrome({
    address,
    startTimestamp,
    endTimestamp,
    supportedLiquidityPoolAddresses:
      VELODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES,
    networkId: VELODROME_NETWORK_ID,
  })
}
