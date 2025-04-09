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

  const startBlockNumber = await getNearestBlock(networkId, startTimestamp)
  const endBlockNumber = await getNearestBlock(networkId, endTimestamp)

  // Get reserve data at the start block
  const startReserveData = await getReserveData(
    networkId,
    poolAddress,
    startBlockNumber,
  )

  // Get reserve data at the end block
  const endReserveData = await getReserveData(
    networkId,
    poolAddress,
    endBlockNumber,
  )

  // Get reserve factor changes between blocks
  const reserveFactorHistory = await getReserveFactorHistory({
    networkId,
    poolConfiguratorAddress,
    startBlock: startBlockNumber,
    endBlock: endBlockNumber,
  })

  // We expect the end block's reserve data to include all tokens involved during the period
  const allATokenAddresses = Array.from(endReserveData.keys())
  const allReserveTokenAddresses = Array.from(endReserveData.values()).map(
    (data) => data.reserveTokenAddress,
  )

  // Get user balances at the start block
  const startBalances = await getATokenScaledBalances(
    networkId,
    userAddress as Address,
    allATokenAddresses,
    startBlockNumber,
  )

  // Get user balances changes between blocks
  const balanceHistory = await getATokenScaledBalanceHistory({
    subgraphId,
    userAddress,
    startTimestamp,
    endTimestamp,
  })

  // Calculate protocol revenue by aToken
  const protocolRevenueByAToken: ProtocolRevenue[] = allATokenAddresses.map(
    (aTokenAddress) => {
      // Calculate user earnings segments.
      // The segment is the time interval during which the user balance was constant
      // and we can calculate user earnings based on liquidityIndex at the start
      // and the end of the segment.
      const startSnapshot = {
        liquidityIndex:
          startReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
        scaledATokenBalance: startBalances.get(aTokenAddress) ?? 0n,
        timestamp: Math.floor(startTimestamp.getTime() / 1000),
      }
      const endSnapshot = {
        liquidityIndex: endReserveData.get(aTokenAddress)?.liquidityIndex ?? 0n,
        scaledATokenBalance: 0n, // the last balance is not needed for the calculation
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

        const endBalance = rayMul(
          current.scaledATokenBalance,
          next.liquidityIndex,
        )

        const earningsAmount = endBalance - startBalance

        userEarningsSegments.push({
          amount: earningsAmount,
          startTimestamp: current.timestamp,
          endTimestamp: next.timestamp,
        })
      }

      // Calculate reserve factor segments.
      // The segment is the time interval during which the reserve factor is constant.
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
          reserveFactor: 0n, // the last reserve factor is not needed for the calculation
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

      // Calculate protocol revenue within each reserve factor segment
      let totalProtocolRevenue = 0n
      for (const reserveFactor of reserveFactorSegments) {
        totalProtocolRevenue += calculateProtocolRevenueForReserveFactor(
          reserveFactor,
          userEarningsSegments,
        )
      }

      return {
        aTokenAddress,
        revenue: totalProtocolRevenue,
      }
    },
  )

  // Get reserve tokens USD prices at the end block from Aave oracle
  const tokenUSDPrices = await getUSDPrices({
    networkId,
    oracleAddress,
    tokenAddresses: allReserveTokenAddresses,
    blockNumber: endBlockNumber,
  })

  let totalProtocolRevenueInUSD = new BigNumber(0)
  for (const { aTokenAddress, revenue } of protocolRevenueByAToken) {
    const { reserveTokenAddress, reserveTokenDecimals } =
      endReserveData.get(aTokenAddress)!
    const tokenPrice = tokenUSDPrices.get(reserveTokenAddress)!

    const revenueInUSD = new BigNumber(revenue)
      .multipliedBy(tokenPrice!)
      .shiftedBy(-reserveTokenDecimals!)

    totalProtocolRevenueInUSD = totalProtocolRevenueInUSD.plus(revenueInUSD)
  }
  console.log(
    `Total protocol earnings in USD on ${networkId}: ${totalProtocolRevenueInUSD.toFixed()}`,
  )

  return totalProtocolRevenueInUSD
}

// Calculate user earnings within the reserve factor segment
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
