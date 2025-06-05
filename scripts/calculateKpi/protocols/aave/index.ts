import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { SUPPORTED_NETWORKS, SupportedNetwork } from './config'
import { RAY, rayDiv, rayMul } from './math'
import { calculateOverlap, createSegments } from './utils'
import { fetchBlockchainData } from './blockchainData'
import { BalanceSnapshot, ReserveData, ReserveFactor } from './types'

interface RevenueCalculationContext {
  startReserveData: Map<Address, ReserveData>
  endReserveData: Map<Address, ReserveData>
  reserveFactorHistory: Map<Address, ReserveFactor[]>
  startBalances: Map<Address, bigint>
  balanceHistory: Map<Address, BalanceSnapshot[]>
  tokenUSDPrices: Map<Address, BigNumber>
  startTimestamp: number
  endTimestamp: number
}

interface Revenue {
  reserveTokenAddress: Address
  reserveTokenDecimals: number
  revenue: bigint
}
interface Segment {
  value: bigint
  startTimestamp: number
  endTimestamp: number
}

export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<{ kpi: number }> {
  let revenue = new BigNumber(0)

  for (const network of SUPPORTED_NETWORKS) {
    revenue = revenue.plus(
      await revenueInNetwork(
        network,
        address as Address,
        startTimestamp,
        endTimestampExclusive,
      ),
    )
  }

  return { kpi: revenue.toNumber() }
}

async function revenueInNetwork(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestampExclusive: Date,
): Promise<BigNumber> {
  const chainData = await fetchBlockchainData(
    network,
    userAddress,
    startTimestamp,
    endTimestampExclusive,
  )

  const context: RevenueCalculationContext = {
    ...chainData,
    startTimestamp: Math.floor(startTimestamp.getTime() / 1000),
    endTimestamp: Math.floor(endTimestampExclusive.getTime() / 1000),
  }

  const protocolRevenueByReserve = revenueByReserve(context)

  const revenue = totalRevenueInUSD(protocolRevenueByReserve, context)

  return revenue
}

function revenueByReserve(context: RevenueCalculationContext): Revenue[] {
  return [...context.endReserveData.values()].map(
    ({ reserveTokenAddress, reserveTokenDecimals, aTokenAddress }) =>
      revenueInReserve(
        reserveTokenAddress,
        reserveTokenDecimals,
        aTokenAddress,
        context,
      ),
  )
}

function revenueInReserve(
  reserveTokenAddress: Address,
  reserveTokenDecimals: number,
  aTokenAddress: Address,
  context: RevenueCalculationContext,
): Revenue {
  const userEarningsSegments = splitUserEarningHistoryIntoSegments(
    reserveTokenAddress,
    aTokenAddress,
    context,
  )
  const reserveFactorSegments = splitReserveFactorHistoryIntoSegments(
    reserveTokenAddress,
    context,
  )

  let revenue = 0n
  for (const reserveFactor of reserveFactorSegments) {
    const earningsInSegment = earningsOverlappingReserveFactorSegment(
      reserveFactor,
      userEarningsSegments,
    )
    const revenueInSegment = estimateProtocolRevenue(
      earningsInSegment,
      reserveFactor.value,
    )
    revenue += revenueInSegment
  }

  return { reserveTokenAddress, reserveTokenDecimals, revenue }
}

function splitUserEarningHistoryIntoSegments(
  reserveTokenAddress: Address,
  aTokenAddress: Address,
  context: RevenueCalculationContext,
): Segment[] {
  const startBalance = {
    liquidityIndex:
      context.startReserveData.get(reserveTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: context.startBalances.get(aTokenAddress) ?? 0n,
    timestamp: context.startTimestamp,
  }

  const endBalance = {
    liquidityIndex:
      context.endReserveData.get(reserveTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: 0n, // The last balance is not needed for segment creation
    timestamp: context.endTimestamp,
  }

  const history = context.balanceHistory.get(aTokenAddress) ?? []

  const combinedHistory = [startBalance, ...history, endBalance]

  return createSegments(combinedHistory, (current, next) => {
    const startBalance = rayMul(
      current.scaledATokenBalance,
      current.liquidityIndex,
    )
    const endBalance = rayMul(current.scaledATokenBalance, next.liquidityIndex)

    const earnings = endBalance - startBalance

    return {
      value: earnings,
      startTimestamp: current.timestamp,
      endTimestamp: next.timestamp,
    }
  })
}

function splitReserveFactorHistoryIntoSegments(
  reserveTokenAddress: Address,
  context: RevenueCalculationContext,
): Segment[] {
  const startReserveFactor =
    context.startReserveData.get(reserveTokenAddress)?.reserveFactor ?? 0n
  const history = context.reserveFactorHistory.get(reserveTokenAddress) ?? []

  const combinedHistory = [
    {
      reserveFactor: startReserveFactor,
      timestamp: context.startTimestamp,
    },
    ...history,
    {
      reserveFactor: 0n, // The last reserve factor is not needed for segment creation
      timestamp: context.endTimestamp,
    },
  ]

  return createSegments(combinedHistory, (current, next) => ({
    value: current.reserveFactor,
    startTimestamp: current.timestamp,
    endTimestamp: next.timestamp,
  }))
}

function earningsOverlappingReserveFactorSegment(
  reserveFactor: Segment,
  userEarnings: Segment[],
): bigint {
  let userEarningsInSegment = 0n

  for (const userEarning of userEarnings) {
    if (userEarning.value <= 0n) {
      continue
    }

    const overlap = calculateOverlap(
      userEarning.startTimestamp,
      userEarning.endTimestamp,
      reserveFactor.startTimestamp,
      reserveFactor.endTimestamp,
    )

    if (overlap > 0) {
      const duration = userEarning.endTimestamp - userEarning.startTimestamp
      const overlapRatio = rayDiv(BigInt(overlap), BigInt(duration))
      userEarningsInSegment += rayMul(userEarning.value, overlapRatio)
    }
  }

  return userEarningsInSegment
}

// Calculates protocol revenue based on user earnings and reserve factor.
// The calculation uses the relationship between user earnings and protocol revenue:
// - User earnings come from (1 - reserveFactor) of total interest
// - Protocol earnings come from (reserveFactor) of total interest
// - Therefore the ratio of protocol to user earnings is: reserveFactor / (1 - reserveFactor)
//
function estimateProtocolRevenue(
  userEarnings: bigint,
  reserveFactor: bigint,
): bigint {
  const BIPS = 10_000n // 100% = 10,000 bips

  const protocolEarningsShare = reserveFactor * RAY
  const userEarningsShare = (BIPS - reserveFactor) * RAY

  const protocolToUserEarningsRatio = rayDiv(
    protocolEarningsShare,
    userEarningsShare,
  )

  return rayMul(userEarnings, protocolToUserEarningsRatio)
}

function totalRevenueInUSD(
  protocolRevenueByReserve: Revenue[],
  context: RevenueCalculationContext,
): BigNumber {
  let totalRevenueInUSD = new BigNumber(0)

  for (const {
    reserveTokenAddress,
    reserveTokenDecimals,
    revenue,
  } of protocolRevenueByReserve) {
    const tokenPrice = context.tokenUSDPrices.get(reserveTokenAddress)!

    const revenueInUSD = new BigNumber(revenue.toString())
      .multipliedBy(tokenPrice)
      .shiftedBy(-reserveTokenDecimals)

    totalRevenueInUSD = totalRevenueInUSD.plus(revenueInUSD)
  }

  return totalRevenueInUSD
}
