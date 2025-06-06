import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  fonbnkNetworkToNetworkId,
  TRANSACTION_VOLUME_USD_PRECISION,
  TRANSFER_TOPIC,
} from './constants'
import { getFonbnkAssets, getPayoutWallets } from './helpers'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { KpiResult, NetworkId } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { FonbnkTransaction, SUPPORTED_FONBNK_NETWORKS } from './types'
import { Address, fromHex, isAddress, pad } from 'viem'

/**
 * Retrieves all cash-in token transfer transactions from Fonbnk payout wallets to a specific user.
 *
 * **Business Purpose**: Captures mobile telecom transaction data where Fonbnk's blockchain-based
 * mobile network distributes payments to users. These transfers represent transaction volume
 * from mobile network usage and telecom services.
 *
 * **Data Collection Method**:
 * 1. Queries blockchain for ERC20 transfer events from payout wallet to user
 * 2. Filters transfers within the specified time window using block timestamps
 * 3. Validates transaction data completeness before including in results
 *
 * @internal
 * @param params - Query parameters
 * @param params.address - User wallet address receiving Fonbnk payouts
 * @param params.payoutWallet - Fonbnk payout wallet address that distributes payments
 * @param params.startTimestamp - Start of time window (inclusive)
 * @param params.endTimestampExclusive - End of time window (exclusive)
 * @param params.client - HyperSync client for blockchain data access
 * @param params.networkId - Target blockchain network identifier
 *
 * @returns Promise resolving to array of Fonbnk transaction records within time window
 *
 * @throws Logs warning if transaction data is incomplete (missing blockNumber, data, or address)
 */
export async function getUserTransactions({
  address,
  payoutWallet,
  startTimestamp,
  endTimestampExclusive,
  client,
  networkId,
}: {
  address: Address
  payoutWallet: Address
  startTimestamp: Date
  endTimestampExclusive: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<FonbnkTransaction[]> {
  // Query for all transfers from the payout wallet to the user
  const query = {
    logs: [{ topics: [[TRANSFER_TOPIC], [pad(payoutWallet)], [pad(address)]] }],
    transactions: [{ from: [payoutWallet] }],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Address, LogField.Data],
    },
    fromBlock: 0,
  }

  const transactions: FonbnkTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const transaction of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (transaction.blockNumber && transaction.data && transaction.address) {
        const block = await getBlock(networkId, BigInt(transaction.blockNumber))
        const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
        // And that the transfer happened within the time window
        if (
          blockTimestampDate >= startTimestamp &&
          blockTimestampDate <= endTimestampExclusive
        ) {
          transactions.push({
            amount: fromHex(transaction.data as Address, 'bigint'),
            tokenAddress: transaction.address as Address,
            timestamp: blockTimestampDate,
          })
        }
      } else {
        console.log(
          `Fonbnk transfer transaction missing one of the required fields. blockNumber: ${transaction.blockNumber}, data: ${transaction.data}, address: ${transaction.address}`,
        )
      }
    }
  })
  return transactions
}

/**
 * Converts Fonbnk token transactions to USD volume using historical price data.
 *
 * **Business Purpose**: Calculates the total USD value of mobile network transactions received by a user,
 * providing a standardized volume metric for cross-protocol comparison and transaction analysis.
 *
 * **Calculation Method**:
 * 1. Fetches historical token prices for the transaction period
 * 2. For each transaction, finds the token price closest to transaction timestamp
 * 3. Converts token amount to USD using price and token decimals
 * 4. Aggregates all USD values to get total transaction volume
 *
 * **Price Accuracy**: Uses token prices at transaction timestamps to ensure accurate
 * USD conversion reflecting market conditions when transactions occurred.
 *
 * @internal
 * @param params - Calculation parameters
 * @param params.transactions - Array of Fonbnk token transactions to convert
 * @param params.networkId - Network where transactions occurred (for token price lookup)
 * @param params.startTimestamp - Start timestamp for price data fetching
 * @param params.endTimestampExclusive - End timestamp for price data fetching
 *
 * @returns Promise resolving to total USD value of all transactions
 */
export async function getTotalRevenueUsdFromTransactions({
  transactions,
  networkId,
  startTimestamp,
  endTimestampExclusive,
}: {
  transactions: FonbnkTransaction[]
  networkId: NetworkId
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  if (transactions.length === 0) {
    return 0
  }

  let totalUsdContribution = 0

  // Get the token decimals
  const tokenId = `${networkId}:${transactions[0].tokenAddress}`
  const tokenContract = await getErc20Contract(
    transactions[0].tokenAddress,
    networkId,
  )
  const tokenDecimals = BigInt(await tokenContract.read.decimals())

  // Get the historical token prices
  const tokenPrices = await fetchTokenPrices({
    tokenId,
    startTimestamp,
    endTimestampExclusive,
  })

  // For each transaction compute the USD contribution and add to the total
  for (const transaction of transactions) {
    const tokenPriceUsd = getTokenPrice(
      tokenPrices,
      new Date(transaction.timestamp),
    )
    const partialUsdContribution =
      Number(
        (transaction.amount *
          BigInt(tokenPriceUsd * 10 ** TRANSACTION_VOLUME_USD_PRECISION)) /
          10n ** tokenDecimals,
      ) /
      10 ** TRANSACTION_VOLUME_USD_PRECISION
    totalUsdContribution += partialUsdContribution
  }

  return totalUsdContribution
}

/**
 * Calculates cash-in transaction volume from Fonbnk payout wallets to user.
 *
 * **KPI Unit**: USD (United States Dollars)
 *
 * **Business Purpose**: Measures the transaction volume attributable to cash-in transactions where a specific user
 * receives payments from Fonbnk payout wallets. This metric quantifies the economic activity generated by
 * Fonbnk's mobile telecom service distributions and supports transaction volume analysis.
 *
 * **Protocol Context**: Fonbnk is a mobile telecom service platform that allows users to purchase airtime,
 * data, and other mobile services using cryptocurrency. It operates across multiple networks and facilitates
 * mobile service transactions for users globally.
 *
 * **Supported Networks**: Multiple EVM-compatible networks where Fonbnk operates mobile telecom services
 *
 * **Data Sources**:
 * - **HyperSync**: Token transfer events from Fonbnk payout wallets to user addresses
 * - **Fonbnk API**: Payout wallet discovery via GET `/api/util/payout-wallets` endpoint
 * - **Token Price API**: Historical token prices via `fetchTokenPrices` utility for USD conversion
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
 * - **Network RPCs**: Multi-network transaction data via Viem public clients
 *
 * **Business Assumptions**:
 * - Transaction volume is measured by token transfers from Fonbnk payout wallets to user
 * - User's volume contribution is the sum of all transfers received within the time window
 * - USD conversion uses token prices at time of each transaction for accuracy
 * - Only transfers from verified Fonbnk payout addresses are included
 * - Transaction volume represents cash-in transactions from Fonbnk services
 *
 * **Service Types**: Airtime top-ups, mobile data packages, mobile banking services, and other telecom services
 *
 * **Calculation Method**:
 * 1. Retrieves verified Fonbnk payout wallet addresses from Fonbnk API
 * 2. Queries token transfer events from Fonbnk payout wallets to user address across all supported networks
 * 3. Filters transfers by the specified time window using block timestamp data
 * 4. Converts transfer amounts to USD using historical token prices at transaction timestamps
 * 5. Aggregates USD volume across all networks and token types
 * 6. Returns total transaction volume representing cash-in transactions received from Fonbnk
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate transaction volume for
 * @param params.startTimestamp - Start of time window for volume calculation (inclusive)
 * @param params.endTimestampExclusive - End of time window for volume calculation (exclusive)
 *
 * @returns Promise resolving to total cash-in transaction volume in USD
 */
export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<KpiResult> {
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }

  let totalRevenue = 0
  const fonbnkAssets = await getFonbnkAssets()

  // For each network, create a new hypersync client and get all of the unique payout wallets
  for (const supportedNetwork of SUPPORTED_FONBNK_NETWORKS) {
    const client = getHyperSyncClient(
      fonbnkNetworkToNetworkId[supportedNetwork],
    )
    const networkAssets = fonbnkAssets
      .filter((asset) => asset.network === supportedNetwork)
      .map((asset) => asset.asset)
    const payoutWallets = await Promise.all(
      networkAssets.map((asset) =>
        getPayoutWallets({ fonbnkNetwork: supportedNetwork, asset }),
      ),
    )
    const uniquePayoutWallets = new Set(payoutWallets.flat())

    // For each payout wallet, get all of the transactions and calculate the total revenue from the user
    for (const payoutWallet of uniquePayoutWallets) {
      const transactions = await getUserTransactions({
        address,
        payoutWallet,
        startTimestamp,
        endTimestampExclusive,
        client,
        networkId: fonbnkNetworkToNetworkId[supportedNetwork],
      })
      const revenue = await getTotalRevenueUsdFromTransactions({
        transactions,
        networkId: fonbnkNetworkToNetworkId[supportedNetwork],
        startTimestamp,
        endTimestampExclusive,
      })
      totalRevenue += revenue
    }
  }
  return { kpi: totalRevenue }
}
