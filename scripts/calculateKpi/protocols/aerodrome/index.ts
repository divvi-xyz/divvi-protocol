import {
  AERODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES,
  AERODROME_NETWORK_ID,
} from './constants'
import { calculateRevenueDrome } from '../utils/drome/calculateRevenueDrome'

export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  return calculateRevenueDrome({
    address,
    startTimestamp,
    endTimestampExclusive,
    supportedLiquidityPoolAddresses:
      AERODROME_SUPPORTED_LIQUIDITY_POOL_ADDRESSES,
    networkId: AERODROME_NETWORK_ID,
  })
}
