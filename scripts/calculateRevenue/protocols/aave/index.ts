import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { SUPPORTED_NETWORKS, SupportedNetwork } from './config'
import { getNearestBlock } from '../utils/events'
import { getReserveData } from './pool'
import { getReserveFactorHistory } from './reserveFactor'
import { getScaledBalances } from './aToken'
import { getATokenBalanceHistory } from './subgraph'
import { RAY, rayDiv, rayMul } from './math'
import { getUSDPrices } from './oracle'

async function revenueInNetwork(
  network: SupportedNetwork,
  address: string,
  startTimestamp: Date,
  endTimestamp: Date,
): Promise<number> {
  const {
    networkId,
    poolAddress,
    poolConfiguratorAddress,
    oracleAddress,
    subgraphId,
  } = network

  const startBlockNumber = await getNearestBlock(networkId, startTimestamp)
  const endBlockNumber = await getNearestBlock(networkId, endTimestamp)

  // Get reserve data at the start and the end blocks
  const startReserveData = await getReserveData(
    networkId,
    poolAddress,
    startBlockNumber,
  )
  const endReserveData = await getReserveData(
    networkId,
    poolAddress,
    endBlockNumber,
  )

  // We expect the end reserve data to include all tokens involved during the whole period
  const allATokenAddresses = Array.from(endReserveData.keys())
  const allReserveTokenAddresses = Array.from(endReserveData.values()).map(
    (data) => data.reserveTokenAddress,
  )

  // Get reserve factor history
  const reserveFactorHistory = await getReserveFactorHistory({
    networkId,
    poolConfiguratorAddress,
    startBlock: startBlockNumber,
    endBlock: endBlockNumber,
  })

  // Calculate reserve factor history segments
  const reserveFactorHistorySegments = new Map<
    Address,
    { startTimestamp: number; endTimestamp: number; reserveFactor: bigint }[]
  >()

  for (const aTokenAddress of allATokenAddresses) {
    const startReserveFactor =
      startReserveData.get(aTokenAddress)?.reserveFactor ?? 0n
    const endReserveFactor =
      endReserveData.get(aTokenAddress)?.reserveFactor ?? 0n

    const reserveTokenAddress =
      endReserveData.get(aTokenAddress)?.reserveTokenAddress
    const history =
      (reserveTokenAddress && reserveFactorHistory.get(reserveTokenAddress)) ??
      []

    const combinedHistory = [
      {
        reserveFactor: startReserveFactor,
        timestamp: Math.floor(startTimestamp.getTime() / 1000),
      },
      ...history,
      {
        reserveFactor: endReserveFactor,
        timestamp: Math.floor(endTimestamp.getTime() / 1000),
      },
    ]

    const segments = []
    for (let i = 0; i < combinedHistory.length - 1; i++) {
      const current = combinedHistory[i]
      const next = combinedHistory[i + 1]

      segments.push({
        startTimestamp: current.timestamp,
        endTimestamp: next.timestamp,
        reserveFactor: current.reserveFactor,
      })
    }

    reserveFactorHistorySegments.set(aTokenAddress, segments)
  }

  // Get start balances
  const startBalances = await getScaledBalances(
    networkId,
    address as Address,
    allATokenAddresses,
    startBlockNumber,
  )

  // Get balance history
  const balanceHistory = await getATokenBalanceHistory({
    subgraphId,
    userAddress: address.toLowerCase() as Address,
    startTimestamp,
    endTimestamp,
  })

  // Calculate balance snapshots
  const balanceSnapshots = new Map<
    Address,
    { liquidityIndex: bigint; scaledATokenBalance: bigint; timestamp: number }[]
  >()

  for (const aTokenAddress of allATokenAddresses) {
    const startSnapshot = {
      liquidityIndex: startReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
      scaledATokenBalance: startBalances.get(aTokenAddress) ?? 0n,
      timestamp: Math.floor(startTimestamp.getTime() / 1000),
    }

    const history = balanceHistory.get(aTokenAddress) ?? []

    const endSnapshot = {
      liquidityIndex: endReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
      scaledATokenBalance: 0n, // the end balance is not needed for calculation
      timestamp: Math.floor(endTimestamp.getTime() / 1000),
    }

    balanceSnapshots.set(aTokenAddress, [
      startSnapshot,
      ...history,
      endSnapshot,
    ])
  }

  // Calculate earnings
  const reserveEarnings = new Map<
    Address,
    {
      totalUserEarnings: bigint
      totalProtocolEarnings: bigint
      earningsByReserveFactor: {
        startTimestamp: number
        endTimestamp: number
        reserveFactor: bigint
        totalUserEarnings: bigint
        protocolEarnings: bigint
        userEarnings: {
          startTimestamp: number
          endTimestamp: number
          userEarnings: bigint
        }[]
      }[]
    }
  >()

  for (const aTokenAddress of allATokenAddresses) {
    const reserveFactors = reserveFactorHistorySegments.get(aTokenAddress) ?? []
    const snapshots = balanceSnapshots.get(aTokenAddress) ?? []

    let totalUserEarnings = 0n
    let totalProtocolEarnings = 0n

    const earningsByReserveFactor: {
      startTimestamp: number
      endTimestamp: number
      reserveFactor: bigint
      totalUserEarnings: bigint
      protocolEarnings: bigint
      userEarnings: {
        startTimestamp: number
        endTimestamp: number
        userEarnings: bigint
      }[]
    }[] = []

    for (const segment of reserveFactors) {
      let totalUserEarningsInSegment = 0n
      const userEarningsSegments = []

      for (let i = 0; i < snapshots.length - 1; i++) {
        const current = snapshots[i]
        const next = snapshots[i + 1]

        const startBalance = rayMul(
          current.scaledATokenBalance,
          current.liquidityIndex,
        )

        const endBalance = rayMul(
          current.scaledATokenBalance,
          next.liquidityIndex,
        )

        const userEarnings = endBalance - startBalance

        if (userEarnings <= 0n) {
          continue // skip if no earnings
        }

        // Calculate the overlap between reserve factor segment and balance segment
        const overlapStart = Math.max(current.timestamp, segment.startTimestamp)
        const overlapEnd = Math.min(next.timestamp, segment.endTimestamp)

        if (overlapStart < overlapEnd) {
          const earningsDuration = BigInt(next.timestamp - current.timestamp)
          const overlapDuration = BigInt(overlapEnd - overlapStart)
          const overlapRatio = rayDiv(overlapDuration, earningsDuration)

          // Scale earnings by the overlap duration
          const proportionalEarnings = rayMul(userEarnings, overlapRatio)
          totalUserEarningsInSegment += proportionalEarnings

          userEarningsSegments.push({
            startTimestamp: overlapStart,
            endTimestamp: overlapEnd,
            userEarnings: proportionalEarnings,
          })
        }
      }

      if (totalUserEarningsInSegment <= 0n) {
        continue // skip if no earnings
      }

      const reserveFactor = rayDiv(segment.reserveFactor, BigInt(10000))
      const protocolToUserEarningsRatio = rayDiv(
        reserveFactor,
        rayDiv(RAY - reserveFactor, RAY),
      )
      const protocolEarnings = rayMul(
        totalUserEarningsInSegment,
        protocolToUserEarningsRatio,
      )

      totalUserEarnings += totalUserEarningsInSegment
      totalProtocolEarnings += protocolEarnings

      earningsByReserveFactor.push({
        startTimestamp: segment.startTimestamp,
        endTimestamp: segment.endTimestamp,
        reserveFactor: segment.reserveFactor,
        totalUserEarnings,
        protocolEarnings,
        userEarnings: userEarningsSegments,
      })
    }

    if (totalProtocolEarnings <= 0n) {
      continue // skip if no earnings
    }

    reserveEarnings.set(aTokenAddress, {
      totalProtocolEarnings,
      totalUserEarnings,
      earningsByReserveFactor,
    })
  }

  let totalProtocolEarnings = 0n
  for (const reserveEarningsItem of reserveEarnings.values()) {
    totalProtocolEarnings += reserveEarningsItem.totalProtocolEarnings
  }
  console.log(`Total protocol earnings: ${totalProtocolEarnings}`)

  let totalUserEarnings = 0n
  for (const reserveEarningsItem of reserveEarnings.values()) {
    totalUserEarnings += reserveEarningsItem.totalUserEarnings
  }
  console.log(`Total User earnings: ${totalUserEarnings}`)

  const tokenUSDPrices = await getUSDPrices({
    networkId,
    oracleAddress,
    tokenAddresses: allReserveTokenAddresses,
    blockNumber: endBlockNumber,
  })

  console.log(
    Array.from(tokenUSDPrices.entries()).map(([k, v]) => [k, v.toFixed(8)]),
  )

  let totalProtocolEarningsInUSD = new BigNumber(0)
  for (const [
    aTokenAddress,
    { totalProtocolEarnings },
  ] of reserveEarnings.entries()) {
    const reserveTokenAddress =
      endReserveData.get(aTokenAddress)?.reserveTokenAddress
    const reserveTokenDecimals =
      endReserveData.get(aTokenAddress)?.reserveTokenDecimals
    const tokenPrice = tokenUSDPrices.get(reserveTokenAddress!)

    const earningsInUSD = new BigNumber(totalProtocolEarnings)
      .multipliedBy(tokenPrice!)
      .shiftedBy(-reserveTokenDecimals!)

    totalProtocolEarningsInUSD = totalProtocolEarningsInUSD.plus(earningsInUSD)
  }
  console.log(
    `Total protocol earnings in USD: ${totalProtocolEarningsInUSD.toFixed(2)}`,
  )

  let totalUserEarningsInUSD = new BigNumber(0)
  for (const [
    aTokenAddress,
    { totalUserEarnings },
  ] of reserveEarnings.entries()) {
    const reserveTokenAddress =
      endReserveData.get(aTokenAddress)?.reserveTokenAddress
    const reserveTokenDecimals =
      endReserveData.get(aTokenAddress)?.reserveTokenDecimals
    const tokenPrice = tokenUSDPrices.get(reserveTokenAddress!)

    const earningsInUSD = new BigNumber(totalUserEarnings)
      .multipliedBy(tokenPrice!)
      .shiftedBy(-reserveTokenDecimals!)

    totalUserEarningsInUSD = totalUserEarningsInUSD.plus(earningsInUSD)
  }

  console.log(
    `Total user earnings in USD: ${totalUserEarningsInUSD.toFixed(2)}`,
  )

  const bigintSerializer = (_: string, value: any) => {
    return typeof value === 'bigint' ? value.toString() : value
  }

  console.log(JSON.stringify(Array.from(reserveEarnings), bigintSerializer, 2))

  //TODO: map earnings to USD and sum them up

  return 0
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
  let revenue = 0

  console.log(startTimestamp)

  for (const network of SUPPORTED_NETWORKS) {
    revenue += await revenueInNetwork(
      network,
      address,
      new Date(1718386363000),
      endTimestamp,
    )
  }

  return revenue
}
