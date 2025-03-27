import { getTokenPrice } from '../../beefy'
import { fetchTokenPrices } from '../tokenPrices'
import { getSwapEvents } from './getSwapEvents'
import { SwapEvent } from './types'
import { getViemPublicClient } from '../../../../utils'
import { getAerodromeLiquidityPoolContract } from '../viem'
import { NetworkId } from '../../../../types'
import { Address } from 'viem'

export const TRANSACTION_VOLUME_USD_PRECISION = 8

export const FEE_DECIMALS = 6

export async function calculateSwapRevenue(swapEvents: SwapEvent[]) {
  let totalUsdContribution = 0

  if (swapEvents.length > 0) {
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
      const partialUsdContribution =
        Number(
          (swapEvent.amountInToken *
            BigInt(tokenPriceUsd * 10 ** TRANSACTION_VOLUME_USD_PRECISION)) /
            10n ** swapEvent.tokenDecimals,
        ) /
        10 ** TRANSACTION_VOLUME_USD_PRECISION
      totalUsdContribution += partialUsdContribution
    }
  }
  return totalUsdContribution
}

export async function calculateRevenueDrome({
  address,
  startTimestamp,
  endTimestamp,
  supportedLiquidityPoolAddresses,
  networkId,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
  supportedLiquidityPoolAddresses: Address[]
  networkId: NetworkId
}): Promise<number> {
  let totalTradingFees = 0
  const client = getViemPublicClient(networkId)
  for (const liquidityPoolAddress of supportedLiquidityPoolAddresses) {
    const swapEvents = await getSwapEvents(
      address,
      liquidityPoolAddress,
      startTimestamp,
      endTimestamp,
      networkId,
    )
    const swapAmount = await calculateSwapRevenue(swapEvents)
    const liquidityPoolContract = await getAerodromeLiquidityPoolContract(
      liquidityPoolAddress,
      networkId,
    )
    const fee = await client.readContract({
      address: liquidityPoolAddress,
      abi: liquidityPoolContract.abi,
      functionName: 'fee',
    })
    totalTradingFees += swapAmount * (fee / 10 ** FEE_DECIMALS)
  }
  return totalTradingFees
}
