import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalTransactions } from '../utils/networks'

/**
 * Calculates transaction count for Celo network activity.
 *
 * **KPI Unit**: Transaction count (number of transactions)
 *
 * **Business Purpose**: Measures the number of transactions initiated by a specific user on Celo network.
 * This metric quantifies user engagement and activity level on the blockchain, supporting network
 * usage analysis and user behavior tracking for Celo ecosystem development.
 *
 * **Protocol Context**: Celo is a carbon-negative, mobile-first blockchain platform designed for financial
 * inclusion. Transaction count tracking helps measure user engagement and network adoption by counting
 * actual on-chain interactions initiated by users.
 *
 * **Network**: Celo Mainnet
 *
 * **Data Sources**:
 * - **HyperSync**: Transaction data from Celo network via HyperSync client
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
 *
 * **Business Assumptions**:
 * - Transaction count accurately represents user engagement with the network
 * - All user-initiated transactions contribute equally to activity metrics regardless of value or purpose
 * - Higher transaction counts indicate more active user participation in the ecosystem
 * - Transaction frequency serves as a proxy for user adoption and platform utility
 * - Both successful and failed transactions represent legitimate user engagement attempts
 *
 * **Transaction Types**: Token transfers, smart contract interactions, DeFi protocol usage, and dApp engagement
 *
 * **Calculation Method**:
 * 1. Queries all transactions initiated by user wallet within the specified time window on Celo
 * 2. Filters transactions by block timestamp to ensure they fall within the time range
 * 3. Counts the total number of transactions regardless of success status or transaction value
 * 4. Returns total transaction count representing user's network engagement level
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate transaction count for
 * @param params.startTimestamp - Start of time window for transaction counting (inclusive)
 * @param params.endTimestampExclusive - End of time window for transaction counting (exclusive)
 *
 * @returns Promise resolving to total number of transactions initiated by the user
 */
export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  return await fetchTotalTransactions({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
