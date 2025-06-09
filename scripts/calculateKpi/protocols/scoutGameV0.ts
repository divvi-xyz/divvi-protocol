import { CalculateKpiFn, NetworkId } from '../../types'
import { getBlockRange } from './utils/events'
import { fetchTotalTransactions } from './utils/networks'

type ScoutGameBreakdown = 'baseKpi' | 'celoKpi' | 'polygonKpi'

/**
 * Calculates transaction count for Scout Game V0 user engagement tracking.
 *
 * **KPI Unit**: Transaction count (number of transactions)
 *
 * **Business Purpose**: Measures the number of transactions initiated by a specific user across multiple
 * networks supported by Scout Game V0. This metric quantifies user engagement and activity level
 * with the Scout Game ecosystem, supporting user behavior analysis and engagement tracking.
 *
 * **Protocol Context**: Scout Game V0 is a gamified platform that tracks and rewards user activity
 * across multiple blockchain networks. Transaction count serves as a key metric for measuring user
 * participation and engagement with the Scout Game ecosystem and supported protocols.
 *
 * **Supported Networks**: Base, Celo, Polygon
 *
 * **Data Sources**:
 * - **HyperSync**: Transaction data from Base, Celo, and Polygon networks via HyperSync clients
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering across all networks
 *
 * **Business Assumptions**:
 * - Transaction count accurately represents user engagement across supported networks
 * - All user-initiated transactions contribute equally to engagement metrics regardless of network or value
 * - Cross-network transaction aggregation provides comprehensive view of user activity
 * - Higher transaction counts indicate more active participation in the Scout Game ecosystem
 * - Both successful and failed transactions represent legitimate user engagement attempts
 *
 * **Activity Types**: Token transfers, DeFi interactions, NFT transactions, smart contract calls, and protocol usage
 *
 * **Calculation Method**:
 * 1. Iterates through all supported networks (Base, Celo, Polygon)
 * 2. For each network, queries all transactions initiated by user wallet within the time window
 * 3. Filters transactions by block timestamp to ensure they fall within the specified time range
 * 4. Aggregates transaction counts across all networks
 * 5. Returns total cross-network transaction count representing user's Scout Game engagement
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate transaction count for
 * @param params.startTimestamp - Start of time window for transaction counting (inclusive)
 * @param params.endTimestampExclusive - End of time window for transaction counting (exclusive)
 *
 * @returns Promise resolving to total number of transactions across all supported networks
 */

export const calculateKpi: CalculateKpiFn<ScoutGameBreakdown> = async ({
  address,
  startTimestamp,
  endTimestampExclusive,
  redis,
}) => {
  const networkIds = [
    NetworkId['base-mainnet'],
    NetworkId['celo-mainnet'],
    NetworkId['polygon-pos-mainnet'],
  ]
  const networkIdToKpiName: Partial<Record<NetworkId, ScoutGameBreakdown>> = {
    [NetworkId['base-mainnet']]: 'baseKpi',
    [NetworkId['celo-mainnet']]: 'celoKpi',
    [NetworkId['polygon-pos-mainnet']]: 'polygonKpi',
  }

  const blockRanges = await Promise.all(
    networkIds.map((networkId) =>
      getBlockRange({
        networkId,
        startTimestamp,
        endTimestampExclusive,
        redis,
      }),
    ),
  )

  const transactions = await Promise.all(
    networkIds.map((networkId, index) =>
      fetchTotalTransactions({
        networkId,
        users: [address],
        startBlock: blockRanges[index].startBlock,
        endBlockExclusive: blockRanges[index].endBlockExclusive,
      }),
    ),
  )

  let totalTransactions = 0
  const breakdown: Record<ScoutGameBreakdown, number> = {
    baseKpi: 0,
    celoKpi: 0,
    polygonKpi: 0,
  }
  transactions.forEach((item, index) => {
    totalTransactions += item
    const kpiName = networkIdToKpiName[networkIds[index]]
    if (kpiName) {
      breakdown[kpiName] = item
    }
  })
  return { kpi: totalTransactions, breakdown }
}
