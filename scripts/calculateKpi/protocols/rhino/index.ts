import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  NATIVE_TOKEN_DECIMALS,
  BRIDGED_WITHDRAWAL_TOPIC,
} from './constants'
import { getTokenHistoricalPrice } from '../utils/getHistoricalTokenPrice'
import { NetworkId } from '../../../types'
import { BridgeTransaction } from './types'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { Address, decodeEventLog, Hex, isAddress, zeroAddress } from 'viem'
import { getBlockRange } from '../utils/events'
import BigNumber from 'bignumber.js'
import { rhinoFiBridgeAbi } from '../../../abis/RhinoFiBridge'

/**
 * Retrieves all bridge withdrawal transactions from Rhino.fi for a specific user.
 *
 * **Business Purpose**: Captures cross-chain bridge transaction data where users withdraw
 * assets from Rhino.fi's Layer 2 trading platform back to various Layer 1 networks.
 * These transactions represent user activity and value flow through the bridge infrastructure.
 *
 * **Data Collection Method**:
 * 1. Queries blockchain for BridgedWithdrawal events from Rhino.fi bridge contracts
 * 2. Filters events for transactions initiated by the specified user address
 * 3. Decodes event data to extract withdrawal amounts and token information
 * 4. Validates transaction data completeness and temporal filtering
 *
 * @param params - Query parameters
 * @param params.address - User wallet address initiating bridge withdrawals
 * @param params.contractAddress - Rhino.fi bridge contract address on target network
 * @param params.startTimestamp - Start of time window (inclusive)
 * @param params.endTimestampExclusive - End of time window (exclusive)
 * @param params.client - HyperSync client for blockchain data access
 * @param params.networkId - Target blockchain network identifier
 *
 * @returns Promise resolving to array of bridge transaction records within time window
 *
 * @throws Logs warning if transaction data is incomplete (missing blockNumber or data)
 */
export async function getUserBridges({
  address,
  contractAddress,
  startTimestamp,
  endTimestampExclusive,
  client,
  networkId,
}: {
  address: Address
  contractAddress: Address
  startTimestamp: Date
  endTimestampExclusive: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<BridgeTransaction[]> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
  })
  const query = {
    logs: [
      { address: [contractAddress], topics: [[BRIDGED_WITHDRAWAL_TOPIC]] },
    ],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Data, LogField.Topic0],
    },
    fromBlock: startBlock,
    toBlock: endBlockExclusive,
  }

  const bridges: BridgeTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const bridge of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (bridge.blockNumber && bridge.data) {
        const { args } = decodeEventLog({
          abi: rhinoFiBridgeAbi,
          eventName: 'BridgedWithdrawal',
          topics: bridge.topics as [],
          data: bridge.data as Hex,
        })
        // Check that the bridge is from the provided address (first block of data is sender)
        if (args.user.toLowerCase() === address.toLowerCase()) {
          const block = await getBlock(networkId, BigInt(bridge.blockNumber))
          const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
          bridges.push({
            amount: args.amount,
            tokenAddress: args.token.toLowerCase() as Address,
            timestamp: blockTimestampDate,
          })
        }
      } else {
        console.log(
          `Rhino bridge transaction missing required field, blockNumber: ${bridge.blockNumber}, data: ${bridge.data}`,
        )
      }
    }
  })
  return bridges
}

/**
 * Converts Rhino.fi bridge transactions to USD value using historical price data.
 *
 * **Business Purpose**: Calculates the total USD value of assets bridged by a user,
 * providing a standardized metric for cross-protocol comparison and financial reporting
 * of bridge transaction volume.
 *
 * **Calculation Method**:
 * 1. For each bridge transaction, identifies the token type (native or ERC20)
 * 2. Fetches historical token price at the time of bridge transaction
 * 3. Converts token amount to USD using price and token decimals
 * 4. Aggregates all USD values to get total bridge transaction volume
 *
 * **Price Accuracy**: Uses historical token prices at transaction timestamps to ensure
 * accurate USD conversion reflecting market conditions when bridges occurred.
 *
 * **Native Token Handling**: Rhino.fi uses zero address (0x0) to represent native tokens
 * in bridge events, requiring special handling for native token price lookups.
 *
 * @param params - Calculation parameters
 * @param params.userBridges - Array of bridge transactions to convert to USD
 * @param params.networkId - Network where transactions occurred (for token price lookup)
 *
 * @returns Promise resolving to total USD value of all bridge transactions
 */
export async function getTotalRevenueUsdFromBridges({
  userBridges,
  networkId,
}: {
  userBridges: BridgeTransaction[]
  networkId: NetworkId
}): Promise<number> {
  if (userBridges.length === 0) {
    return 0
  }

  let totalUsdContribution = new BigNumber(0)

  // For each bridge compute the USD contribution and add to the total
  for (const bridge of userBridges) {
    // Rhino.fi uses 0 address for native https://github.com/rhinofi/contracts_public/blob/master/bridge-deposit/DVFDepositContract.sol#L176-L182
    const isNative = bridge.tokenAddress === zeroAddress
    const tokenContract = isNative
      ? undefined
      : await getErc20Contract(bridge.tokenAddress, networkId)
    const tokenDecimals = tokenContract
      ? BigInt(await tokenContract.read.decimals())
      : NATIVE_TOKEN_DECIMALS
    try {
      const tokenPriceUsd = await getTokenHistoricalPrice({
        networkId,
        address: isNative ? undefined : bridge.tokenAddress,
        timestamp: bridge.timestamp,
      })
      const partialUsdContribution = new BigNumber(bridge.amount)
        .times(tokenPriceUsd)
        .dividedBy(10n ** tokenDecimals)
      totalUsdContribution = totalUsdContribution.plus(partialUsdContribution)
    } catch (error) {
      console.error(
        `Error fetching token price for ${networkId}:${isNative ? 'native' : bridge.tokenAddress} at ${bridge.timestamp}:`,
        error,
      )
    }
  }

  return totalUsdContribution.toNumber()
}

/**
 * Calculates transaction volume for Rhino.fi cross-chain bridge services.
 *
 * **KPI Unit**: USD (United States Dollars)
 *
 * **Business Purpose**: Measures the transaction volume attributable to a specific user's cross-chain
 * bridge activity through Rhino.fi platform. This metric quantifies the economic activity generated by user
 * interactions with multi-chain bridge services and supports volume analysis for cross-chain infrastructure.
 *
 * **Protocol Context**: Rhino.fi is a decentralized exchange and bridge platform that enables cross-chain
 * token transfers and trading. It facilitates asset movement between different blockchain networks through
 * its bridge infrastructure and decentralized exchange services.
 *
 * **Supported Networks**: Multiple EVM-compatible networks where Rhino.fi has deployed bridge contracts
 *
 * **Data Sources**:
 * - **HyperSync**: Bridge transaction events from user wallets to Rhino.fi bridge contracts
 * - **RPC Queries**: Bridge contract interactions via Viem public client calls across supported networks
 * - **Token Price API**: Historical token prices via `fetchTokenPrices` utility for USD conversion
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
 * - **Network RPCs**: Multi-network bridge transaction data across Ethereum, Polygon, Arbitrum, etc.
 *
 * **Business Assumptions**:
 * - Transaction volume is measured by token amounts bridged through Rhino.fi contracts
 * - User's volume contribution is the sum of all bridge transactions within the time window
 * - USD conversion uses token prices at time of each transaction for accuracy
 * - Only interactions with verified Rhino.fi bridge contracts are included
 * - Transaction volume represents actual cross-chain asset movement
 *
 * **Bridge Types**: Token deposits, withdrawals, cross-chain swaps, and multi-chain asset transfers
 *
 * **Calculation Method**:
 * 1. Identifies verified Rhino.fi bridge contract addresses across all supported networks
 * 2. Queries token transfer and bridge interaction events from user wallet within time window
 * 3. Filters transactions by bridge contract interactions using event logs and transfer data
 * 4. Converts bridge transaction amounts to USD using historical token prices at transaction timestamps
 * 5. Aggregates USD volume across all networks and bridge transaction types
 * 6. Returns total transaction volume representing cross-chain bridge activity
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate bridge transaction volume for
 * @param params.startTimestamp - Start of time window for volume calculation (inclusive)
 * @param params.endTimestampExclusive - End of time window for volume calculation (exclusive)
 *
 * @returns Promise resolving to total bridge transaction volume in USD
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
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }

  const totalRevenueUsd = (
    await Promise.all(
      (
        Object.entries(NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS) as [
          NetworkId,
          Address,
        ][]
      ).map(async ([networkId, contractAddress]) => {
        // For each supported network, get all user bridges in the time window and convert amount to USD
        const userBridges = await getUserBridges({
          address,
          contractAddress,
          startTimestamp,
          endTimestampExclusive,
          client: getHyperSyncClient(networkId),
          networkId: networkId,
        })
        const revenue = await getTotalRevenueUsdFromBridges({
          userBridges,
          networkId: networkId,
        })
        return revenue
      }),
    )
  ).reduce((acc, curr) => acc + curr, 0) // Then sum across all networks

  return totalRevenueUsd
}
