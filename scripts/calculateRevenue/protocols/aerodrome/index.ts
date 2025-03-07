import { getTokenPrice } from '../beefy'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getSwapEvents } from './getSwapEvents'
import { SUPPORTED_LIQUIDITY_POOL_ADDRESSES } from './constants'
import { SwapEvent } from './types'

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
