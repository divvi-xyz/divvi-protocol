import { getTokenPrice } from "../beefy"
import { fetchTokenPrices } from "../utils/tokenPrices"

const SUPPORTED_LIQUIDITY_POOL_ADDRESSES = [
  '0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59',
]

async function getSwapEvents(
  address: string,
  liquidityPoolAddress: string,
  startTimestamp: Date,
  endTimestamp: Date,
) {
  return {}
}

async function calculateSwapRevenue(swapEvents: any) {
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
        const tokenPriceUsd = getTokenPrice(tokenPrices, new Date(swapEvent.timestamp))
        const partialUsdContribution = swapEvent.amount * tokenPriceUsd
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
  const swapEventsPerPool = SUPPORTED_LIQUIDITY_POOL_ADDRESSES.map(
    async (liquidityPoolAddress) => {
      return await getSwapEvents(
        address,
        liquidityPoolAddress,
        startTimestamp,
        endTimestamp,
      )
    },
  )

  let totalRevenue = 0
  for (const swapEvents of swapEventsPerPool) {
    const swapRevenue = await calculateSwapRevenue(swapEvents)
    totalRevenue += swapRevenue
  }
  return totalRevenue
}
