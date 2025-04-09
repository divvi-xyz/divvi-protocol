import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { SUPPORTED_NETWORKS, SupportedNetwork } from './config'
import { getNearestBlock } from '../utils/events'
import { getReserveData } from './pool'
import { getReserveFactorHistory } from './reserveFactor'
import { getATokenScaledBalances } from './aToken'
import { getATokenScaledBalanceHistory } from './subgraph'
import { RAY, rayDiv, rayMul } from './math'
import { getUSDPrices } from './oracle'

interface ReserveFactorSegment {
  value: bigint
  startTimestamp: number
  endTimestamp: number
}

interface UserEarningSegment {
  amount: bigint
  startTimestamp: number
  endTimestamp: number
}

interface ProtocolRevenue {
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

  console.log(startTimestamp)

  for (const network of SUPPORTED_NETWORKS) {
    revenue = revenue.plus(
      await revenueInNetwork(
        network,
        address as Address,
        new Date(1718386363000),
        endTimestamp,
      ),
    )
  }

  console.log(revenue.toNumber())

  return revenue.toNumber()
}

async function revenueInNetwork(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestamp: Date,
): Promise<BigNumber> {
  const {
    networkId,
    poolAddress,
    poolConfiguratorAddress,
    oracleAddress,
    subgraphId,
  } = network

  const [startBlock, endBlock] = await Promise.all([
    getNearestBlock(networkId, startTimestamp),
    getNearestBlock(networkId, endTimestamp),
  ])

  const [startReserveData, endReserveData, reserveFactorHistory] =
    await Promise.all([
      getReserveData(networkId, poolAddress, startBlock),
      getReserveData(networkId, poolAddress, endBlock),
      getReserveFactorHistory({
        networkId,
        poolConfiguratorAddress,
        startBlock,
        endBlock,
      }),
    ])

  // We expect the end reserve data to include all tokens involved during the period
  const allReserveTokenAddresses = [...endReserveData.keys()]
  const allATokenAddresses = [...endReserveData.values()].map(
    (data) => data.aTokenAddress,
  )

  const [startBalances, balanceHistory, tokenUSDPrices] = await Promise.all([
    getATokenScaledBalances(
      networkId,
      userAddress,
      allATokenAddresses,
      startBlock,
    ),
    getATokenScaledBalanceHistory({
      subgraphId,
      userAddress,
      startTimestamp,
      endTimestamp,
    }),
    getUSDPrices({
      networkId,
      oracleAddress,
      tokenAddresses: allReserveTokenAddresses,
      blockNumber: endBlock,
    }),
  ])

  const protocolRevenueByReserve = calculateProtocolRevenueByReserve(
    startReserveData,
    endReserveData,
    reserveFactorHistory,
    startBalances,
    balanceHistory,
    Math.floor(startTimestamp.getTime() / 1000),
    Math.floor(endTimestamp.getTime() / 1000),
  )

  return calculateTotalRevenueInUSD(protocolRevenueByReserve, tokenUSDPrices)
}

function calculateProtocolRevenueByReserve(
  startReserveData: Map<Address, ReserveData>,
  endReserveData: Map<Address, ReserveData>,
  reserveFactorHistory: Map<Address, ReserveFactorHistory[]>,
  startBalances: Map<Address, bigint>,
  balanceHistory: Map<Address, BalanceSnapshot[]>,
  startTimestamp: number,
  endTimestamp: number,
): ProtocolRevenue[] {
  return [...endReserveData.values()].map(
    ({ reserveTokenAddress, reserveTokenDecimals, aTokenAddress }) => {
      const userEarningsSegments = calculateUserEarningsSegments(
        reserveTokenAddress,
        aTokenAddress,
        startReserveData,
        endReserveData,
        startBalances,
        balanceHistory,
        startTimestamp,
        endTimestamp,
      )

      const reserveFactorSegments = calculateReserveFactorSegments(
        reserveTokenAddress,
        startReserveData,
        reserveFactorHistory,
        startTimestamp,
        endTimestamp,
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
  startReserveData: Map<Address, ReserveData>,
  endReserveData: Map<Address, ReserveData>,
  startBalances: Map<Address, bigint>,
  balanceHistory: Map<Address, BalanceSnapshot[]>,
  startTimestamp: number,
  endTimestamp: number,
): UserEarningSegment[] {
  const startBalance = {
    liquidityIndex:
      startReserveData.get(reserveTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: startBalances.get(aTokenAddress) ?? 0n,
    timestamp: startTimestamp,
  }

  const endBalance = {
    liquidityIndex:
      endReserveData.get(reserveTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: 0n, // The last balance is not needed for the calculation
    timestamp: endTimestamp,
  }

  const history = balanceHistory.get(aTokenAddress) ?? []
  const combinedHistory = [startBalance, ...history, endBalance]

  const userEarningsSegments: UserEarningSegment[] = []

  for (let i = 0; i < combinedHistory.length - 1; i++) {
    const current = combinedHistory[i]
    const next = combinedHistory[i + 1]

    const startBalance = rayMul(
      current.scaledATokenBalance,
      current.liquidityIndex,
    )
    const endBalance = rayMul(current.scaledATokenBalance, next.liquidityIndex)

    const earningsAmount = endBalance - startBalance

    userEarningsSegments.push({
      amount: earningsAmount,
      startTimestamp: current.timestamp,
      endTimestamp: next.timestamp,
    })
  }

  return userEarningsSegments
}

function calculateReserveFactorSegments(
  reserveTokenAddress: Address,
  startReserveData: Map<Address, ReserveData>,
  reserveFactorHistory: Map<Address, ReserveFactorHistory[]>,
  startTimestamp: number,
  endTimestamp: number,
): ReserveFactorSegment[] {
  const startReserveFactor =
    startReserveData.get(reserveTokenAddress)?.reserveFactor ?? 0n
  const history = reserveFactorHistory.get(reserveTokenAddress) ?? []

  const combinedHistory = [
    {
      reserveFactor: startReserveFactor,
      timestamp: startTimestamp,
    },
    ...history,
    {
      reserveFactor: 0n, // The last reserve factor is not needed for the calculation
      timestamp: endTimestamp,
    },
  ]

  const reserveFactorSegments: ReserveFactorSegment[] = []
  for (let i = 0; i < combinedHistory.length - 1; i++) {
    const current = combinedHistory[i]
    const next = combinedHistory[i + 1]

    reserveFactorSegments.push({
      value: current.reserveFactor,
      startTimestamp: current.timestamp,
      endTimestamp: next.timestamp,
    })
  }

  return reserveFactorSegments
}

function calculateProtocolRevenueForReserveFactor(
  reserveFactor: ReserveFactorSegment,
  userEarnings: UserEarningSegment[],
): bigint {
  let relatedUserEarnings = 0n

  for (const userEarning of userEarnings) {
    if (userEarning.amount <= 0n) continue

    const overlapDuration = calculateOverlap(
      userEarning.startTimestamp,
      userEarning.endTimestamp,
      reserveFactor.startTimestamp,
      reserveFactor.endTimestamp,
    )

    if (overlapDuration > 0) {
      const earningsDuration =
        userEarning.endTimestamp - userEarning.startTimestamp

      const overlapRatio = rayDiv(
        BigInt(overlapDuration),
        BigInt(earningsDuration),
      )
      relatedUserEarnings += rayMul(userEarning.amount, overlapRatio)
    }
  }

  if (relatedUserEarnings <= 0n) {
    return 0n
  }

  return estimateProtocolRevenue(relatedUserEarnings, reserveFactor.value)
}

function estimateProtocolRevenue(
  userEarnings: bigint,
  reserveFactor: bigint,
): bigint {
  // Convert reserve factor from base points to a ray value
  const reserveFactorValue = rayDiv(reserveFactor, BigInt(10000))

  // Protocol earnings to user earnings ratio:
  // reserveFactor / (1 - reserveFactor)
  const protocolToUserEarningsRatio = rayDiv(
    reserveFactorValue,
    rayDiv(RAY - reserveFactorValue, RAY),
  )

  return rayMul(userEarnings, protocolToUserEarningsRatio)
}

function calculateTotalRevenueInUSD(
  protocolRevenueByReserve: ProtocolRevenue[],
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

function calculateOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  return Math.max(0, overlapEnd - overlapStart)
}
