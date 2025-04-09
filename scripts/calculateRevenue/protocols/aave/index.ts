import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { SUPPORTED_NETWORKS, SupportedNetwork } from './config'
import { RAY, rayDiv, rayMul } from './math'
import { calculateOverlap, createSegments } from './utils'
import { fetchBlockchainData } from './blockchainData'

interface Segment {
  value: bigint
  startTimestamp: number
  endTimestamp: number
}
interface Revenue {
  reserveTokenAddress: Address
  reserveTokenDecimals: number
  revenue: bigint
}

interface ReserveData {
  reserveTokenAddress: Address
  reserveTokenDecimals: number
  aTokenAddress: Address
  liquidityIndex: bigint
  reserveFactor: bigint
}

interface ReserveFactorHistory {
  reserveFactor: bigint
  timestamp: number
}

interface BalanceSnapshot {
  scaledATokenBalance: bigint
  liquidityIndex: bigint
  timestamp: number
}

interface RevenueCalculationContext {
  startReserveData: Map<Address, ReserveData>
  endReserveData: Map<Address, ReserveData>
  reserveFactorHistory: Map<Address, ReserveFactorHistory[]>
  startBalances: Map<Address, bigint>
  balanceHistory: Map<Address, BalanceSnapshot[]>
  startTimestamp: number
  endTimestamp: number
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
  let revenue = new BigNumber(0)

  for (const network of SUPPORTED_NETWORKS) {
    revenue = revenue.plus(
      await revenueInNetwork(
        network,
        address as Address,
        startTimestamp,
        endTimestamp,
      ),
    )
  }

  return revenue.toNumber()
}

async function revenueInNetwork(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestamp: Date,
): Promise<BigNumber> {
  const chainData = await fetchBlockchainData(
    network,
    userAddress,
    startTimestamp,
    endTimestamp,
  )

  const protocolRevenueByReserve = revenueByReserve({
    startReserveData: chainData.startReserveData,
    endReserveData: chainData.endReserveData,
    reserveFactorHistory: chainData.reserveFactorHistory,
    startBalances: chainData.startBalances,
    balanceHistory: chainData.balanceHistory,
    startTimestamp: Math.floor(startTimestamp.getTime() / 1000),
    endTimestamp: Math.floor(endTimestamp.getTime() / 1000),
  })

  return totalRevenueInUSD(protocolRevenueByReserve, chainData.tokenUSDPrices)
}

function revenueByReserve(context: RevenueCalculationContext): Revenue[] {
  return [...context.endReserveData.values()].map(
    ({ reserveTokenAddress, reserveTokenDecimals, aTokenAddress }) => {
      const userEarningsSegments = calculateUserEarningsSegments(
        reserveTokenAddress,
        aTokenAddress,
        context,
      )

      const reserveFactorSegments = calculateReserveFactorSegments(
        reserveTokenAddress,
        context,
      )

      let revenue = 0n
      for (const reserveFactor of reserveFactorSegments) {
        revenue += calculateProtocolRevenueForReserveFactor(
          reserveFactor,
          userEarningsSegments,
        )
      }

      return { reserveTokenAddress, reserveTokenDecimals, revenue }
    },
  )
}

function calculateUserEarningsSegments(
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

function calculateReserveFactorSegments(
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

function calculateProtocolRevenueForReserveFactor(
  reserveFactor: Segment,
  userEarnings: Segment[],
): bigint {
  let relatedUserEarnings = 0n

  for (const userEarning of userEarnings) {
    if (userEarning.value <= 0n) {
      continue
    }

    const duration = userEarning.endTimestamp - userEarning.startTimestamp

    const overlap = calculateOverlap(
      userEarning.startTimestamp,
      userEarning.endTimestamp,
      reserveFactor.startTimestamp,
      reserveFactor.endTimestamp,
    )

    if (overlap > 0) {
      const overlapRatio = rayDiv(BigInt(overlap), BigInt(duration))
      relatedUserEarnings += rayMul(userEarning.value, overlapRatio)
    }
  }

  if (relatedUserEarnings <= 0n) {
    return 0n
  }

  return estimateProtocolRevenue(relatedUserEarnings, reserveFactor.value)
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
  const BIPS = BigInt(10000)

  // Convert reserve factor from base points to a ray value
  const reserveFactorValue = rayDiv(reserveFactor, BIPS)

  // Protocol earnings to user earnings ratio:
  // reserveFactor / (1 - reserveFactor)
  const protocolToUserEarningsRatio = rayDiv(
    reserveFactorValue,
    rayDiv(RAY - reserveFactorValue, RAY),
  )

  return rayMul(userEarnings, protocolToUserEarningsRatio)
}

function totalRevenueInUSD(
  protocolRevenueByReserve: Revenue[],
  tokenUSDPrices: Map<Address, BigNumber>,
): BigNumber {
  let totalRevenueInUSD = new BigNumber(0)

  for (const {
    reserveTokenAddress,
    reserveTokenDecimals,
    revenue,
  } of protocolRevenueByReserve) {
    const tokenPrice = tokenUSDPrices.get(reserveTokenAddress)!

    const revenueInUSD = new BigNumber(revenue.toString())
      .multipliedBy(tokenPrice)
      .shiftedBy(-reserveTokenDecimals)

    totalRevenueInUSD = totalRevenueInUSD.plus(revenueInUSD)
  }

  return totalRevenueInUSD
}
