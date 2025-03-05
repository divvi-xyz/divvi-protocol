import { Address } from 'viem'
import { getTokenPrice } from '../beefy'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { NetworkId } from '../../../types'
import { getSwapEvents } from './getSwapEvents'

export const SUPPORTED_LIQUIDITY_POOL_ADDRESSES: Address[] = [
  '0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59',
]
export const AERODROME_NETWORK_ID = NetworkId['base-mainnet']

export type SwapEvent = {
  timestamp: Date
  amountInToken: number
  tokenId: string
}

export async function calculateSwapRevenue(swapEvents: SwapEvent[]) {
  let totalUsdContribution = 0

  const startTimestamp = swapEvents[0].timestamp
  const endTimestamp = swapEvents[swapEvents.length - 1].timestamp
  const tokenId = swapEvents[0].tokenId
  const tokenPrices = await fetchTokenPrices({
    tokenId,
    startTimestamp,
    endTimestamp,
  })
  for (const swapEvent of swapEvents) {
    const tokenPriceUsd = getTokenPrice(
      tokenPrices,
      new Date(swapEvent.timestamp),
    )
    const partialUsdContribution = swapEvent.amountInToken * tokenPriceUsd
    totalUsdContribution += partialUsdContribution
  }
  return totalUsdContribution
}

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  let totalRevenue = 0
  for (const liquidityPoolAddress of SUPPORTED_LIQUIDITY_POOL_ADDRESSES) {
    const swapEvents = await getSwapEvents(
      address,
      liquidityPoolAddress,
      startTimestamp,
      endTimestamp,
    )
    const swapRevenue = await calculateSwapRevenue(swapEvents)
    totalRevenue += swapRevenue
  }
  return totalRevenue
}
