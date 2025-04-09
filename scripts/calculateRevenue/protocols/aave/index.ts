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
  aTokenAddress: Address
  revenue: bigint
}

interface ReserveData {
  liquidityIndex: bigint
  reserveFactor: bigint
  reserveTokenAddress: Address
  reserveTokenDecimals: number
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
  const allATokenAddresses = Array.from(endReserveData.keys())
  const allReserveTokenAddresses = Array.from(endReserveData.values()).map(
    (data) => data.reserveTokenAddress,
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

  const protocolRevenueByAToken = calculateProtocolRevenueByAToken(
    allATokenAddresses,
    startReserveData,
    endReserveData,
    reserveFactorHistory,
    startBalances,
    balanceHistory,
    startTimestamp,
    endTimestamp,
  )

  const t = calculateTotalRevenueInUSD(
    protocolRevenueByAToken,
    endReserveData,
    tokenUSDPrices,
  )
  console.log(t.toNumber())
  return t
}

function calculateProtocolRevenueByAToken(
  aTokenAddresses: Address[],
  startReserveData: Map<Address, ReserveData>,
  endReserveData: Map<Address, ReserveData>,
  reserveFactorHistory: Map<Address, ReserveFactorHistory[]>,
  startBalances: Map<Address, bigint>,
  balanceHistory: Map<Address, BalanceSnapshot[]>,
  startTimestamp: Date,
  endTimestamp: Date,
): ProtocolRevenue[] {
  return aTokenAddresses.map((aTokenAddress) => {
    const userEarningsSegments = calculateUserEarningsSegments(
      aTokenAddress,
      startReserveData,
      endReserveData,
      startBalances,
      balanceHistory,
      startTimestamp,
      endTimestamp,
    )

    const reserveFactorSegments = calculateReserveFactorSegments(
      aTokenAddress,
      startReserveData,
      endReserveData,
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

    return { aTokenAddress, revenue }
  })
}

function calculateUserEarningsSegments(
  aTokenAddress: Address,
  startReserveData: Map<Address, ReserveData>,
  endReserveData: Map<Address, ReserveData>,
  startBalances: Map<Address, bigint>,
  balanceHistory: Map<Address, BalanceSnapshot[]>,
  startTimestamp: Date,
  endTimestamp: Date,
): UserEarningSegment[] {
  const startSnapshot = {
    liquidityIndex: startReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: startBalances.get(aTokenAddress) ?? 0n,
    timestamp: Math.floor(startTimestamp.getTime() / 1000),
  }

  const endSnapshot = {
    liquidityIndex: endReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
    scaledATokenBalance: 0n, // The last balance is not needed for the calculation
    timestamp: Math.floor(endTimestamp.getTime() / 1000),
  }

  const snapshotHistory = balanceHistory.get(aTokenAddress) ?? []
  const balanceSnapshots = [startSnapshot, ...snapshotHistory, endSnapshot]

  const userEarningsSegments: UserEarningSegment[] = []

  for (let i = 0; i < balanceSnapshots.length - 1; i++) {
    const current = balanceSnapshots[i]
    const next = balanceSnapshots[i + 1]

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
  aTokenAddress: Address,
  startReserveData: Map<Address, ReserveData>,
  endReserveData: Map<Address, ReserveData>,
  reserveFactorHistory: Map<Address, ReserveFactorHistory[]>,
  startTimestamp: Date,
  endTimestamp: Date,
): ReserveFactorSegment[] {
  const startReserveFactor =
    startReserveData.get(aTokenAddress)?.reserveFactor ?? 0n

  const reserveTokenAddress =
    endReserveData.get(aTokenAddress)!.reserveTokenAddress
  const history = reserveFactorHistory.get(reserveTokenAddress) ?? []

  const combinedHistory = [
    {
      reserveFactor: startReserveFactor,
      timestamp: Math.floor(startTimestamp.getTime() / 1000),
    },
    ...history,
    {
      reserveFactor: 0n, // The last reserve factor is not needed for the calculation
      timestamp: Math.floor(endTimestamp.getTime() / 1000),
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

    if (overlapDuration) {
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
  protocolRevenueByAToken: ProtocolRevenue[],
  endReserveData: Map<Address, ReserveData>,
  tokenUSDPrices: Map<Address, BigNumber>,
): BigNumber {
  let totalRevenueInUSD = new BigNumber(0)

  for (const { aTokenAddress, revenue } of protocolRevenueByAToken) {
    const { reserveTokenAddress, reserveTokenDecimals } =
      endReserveData.get(aTokenAddress)!
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
): number | null {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  return overlapStart < overlapEnd ? overlapEnd - overlapStart : null
}
