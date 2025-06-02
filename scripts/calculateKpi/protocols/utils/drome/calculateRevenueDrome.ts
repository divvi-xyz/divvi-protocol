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

/**
 * Calculates USD revenue from DEX swap events using historical token prices.
 *
 * **Business Purpose**: Converts swap transaction volumes to USD values for revenue calculations,
 * providing accurate financial metrics for trading fee attribution across different tokens and time periods.
 *
 * **Calculation Method**:
 * 1. Fetches historical token prices for the swap period
 * 2. For each swap event, applies the token price at transaction time
 * 3. Converts swap amounts to USD using token decimals and price precision
 * 4. Aggregates all USD swap volumes for total transaction volume
 *
 * **Price Precision**: Uses 8 decimal places (TRANSACTION_VOLUME_USD_PRECISION) for accurate
 * USD calculations, especially important for small trading fee amounts.
 *
 * @param swapEvents - Array of swap events with token amounts and timestamps
 * @returns Promise resolving to total swap volume in USD
 */
export async function calculateSwapRevenue(swapEvents: SwapEvent[]) {
  let totalUsdContribution = 0

  if (swapEvents.length > 0) {
    const startTimestamp = swapEvents[0].timestamp
    const endTimestampExclusive = swapEvents[swapEvents.length - 1].timestamp
    const tokenId = swapEvents[0].tokenId
    const tokenPrices = await fetchTokenPrices({
      tokenId,
      startTimestamp,
      endTimestampExclusive,
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

/**
 * Calculates trading fee revenue for Drome-based DEXs (Aerodrome/Velodrome).
 *
 * **Business Purpose**: Provides a unified calculation method for trading fee revenue
 * across Aerodrome (Base) and Velodrome (Optimism) DEXs, which share the same core
 * architecture and fee calculation logic.
 *
 * **Protocol Architecture**: Both Aerodrome and Velodrome are forks of Solidly,
 * featuring similar liquidity pool designs, fee structures, and swap mechanisms.
 * This shared utility leverages their architectural similarities for consistent
 * revenue calculations across both protocols.
 *
 * **Revenue Model**:
 * - Users pay trading fees on token swaps (typically 0.05% to 1.00%)
 * - Fee rates are configurable per liquidity pool based on volatility
 * - Revenue attribution is based on user's direct trading activity
 * - Only whitelisted liquidity pools are included in calculations
 *
 * **Calculation Process**:
 * 1. For each supported liquidity pool, fetches user's swap events
 * 2. Calculates USD volume of swaps using historical token prices
 * 3. Retrieves pool-specific fee rate from smart contract
 * 4. Applies fee rate to swap volume to determine trading fee revenue
 * 5. Aggregates revenue across all pools for total user contribution
 *
 * **Data Sources**:
 * - DEX swap events from liquidity pool smart contracts
 * - Pool-specific fee rate configurations
 * - Historical token price feeds for USD conversion
 * - Transaction timestamp data for accurate price attribution
 *
 * **Business Assumptions**:
 * - Pool fee rates accurately represent actual trading costs
 * - User's swap volume directly correlates to fee revenue generated
 * - USD conversion at transaction time provides accurate revenue measurement
 * - Only supported pools contribute to meaningful revenue calculations
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate trading revenue for
 * @param params.startTimestamp - Start of calculation period (inclusive)
 * @param params.endTimestampExclusive - End of calculation period (exclusive)
 * @param params.supportedLiquidityPoolAddresses - Array of whitelisted pool addresses
 * @param params.networkId - Target network (Base for Aerodrome, Optimism for Velodrome)
 *
 * @returns Promise resolving to total trading fee revenue in USD
 */
export async function calculateRevenueDrome({
  address,
  startTimestamp,
  endTimestampExclusive,
  supportedLiquidityPoolAddresses,
  networkId,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
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
      endTimestampExclusive,
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
