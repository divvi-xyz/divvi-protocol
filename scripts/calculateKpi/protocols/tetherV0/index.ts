import { RedisClientType } from '@redis/client'
import { KpiResult, KpiResults, NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import {
  Address,
  decodeEventLog,
  erc20Abi,
  Hex,
  pad,
  toEventSelector,
} from 'viem'
import { LogField, TransactionField } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { getHyperSyncClient } from '../../../utils'
import { BigNumber } from 'bignumber.js'
import { getReferrerIdFromTx } from './getReferrerIdFromTx'

const MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT = BigNumber(1).shiftedBy(6)
const transferEventSigHash = toEventSelector(
  'Transfer(address,address,uint256)',
)

// Token addresses from https://www.coingecko.com/en/coins/tether, https://www.coingecko.com/en/coins/usdt0, https://docs.inkonchain.com/useful-information/ink-contracts
const networkToTokenAddress: Partial<Record<NetworkId, Address>> = {
  [NetworkId['ethereum-mainnet']]: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  [NetworkId['avalanche-mainnet']]:
    '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
  [NetworkId['celo-mainnet']]: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
  [NetworkId['unichain-mainnet']]: '0x9151434b16b9763660705744891fa906f660ecc5',
  [NetworkId['ink-mainnet']]: '0x0200C29006150606B650577BBE7B6248F58470c1',
  [NetworkId['op-mainnet']]: '0x01bff41798a0bcf287b996046ca68b395dbc1071',
  [NetworkId['arbitrum-one']]: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  [NetworkId['berachain-mainnet']]:
    '0x779ded0c9e1022225f8e0630b35a9b54be713736',
}

async function getEligibleTxCountByReferrer({
  networkId,
  user,
  startBlock,
  endBlockExclusive,
  tokenAddress,
}: {
  networkId: NetworkId
  user: Address
  startBlock?: number
  endBlockExclusive?: number
  tokenAddress: Address
}): Promise<Record<string, number>> {
  const client = getHyperSyncClient(networkId)

  const transactionValueByHash: Record<string, BigNumber> = {}

  const query = {
    transactions: [{ from: [user] }],
    logs: [
      {
        contractAddress: tokenAddress,
        // transfer from user
        topics: [[transferEventSigHash], [pad(user, { size: 32 })], [], []],
      },
      {
        contractAddress: tokenAddress,
        // transfer to user
        topics: [[transferEventSigHash], [], [pad(user, { size: 32 })], []],
      },
    ],
    fieldSelection: {
      log: [
        LogField.Data,
        LogField.Address,
        LogField.Topic0,
        LogField.Topic1,
        LogField.Topic2,
        LogField.Topic3,
        LogField.TransactionHash,
      ],
      transaction: [TransactionField.Hash],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }

  // Group each Transfer event to / from the user by transactionHash to get the net transfer value
  await paginateQuery(client, query, async (response) => {
    for (const { data, topics, transactionHash } of response.data.logs) {
      if (data && transactionHash) {
        const decodedLog = decodeEventLog({
          abi: erc20Abi,
          data: data as Hex,
          topics: topics as [],
        })
        const isTransferToUser =
          decodedLog.eventName === 'Transfer' &&
          decodedLog.args.to.toLowerCase() === user.toLowerCase()
        const transferValue = BigNumber(decodedLog.args.value).multipliedBy(
          isTransferToUser ? 1 : -1,
        )

        transactionValueByHash[transactionHash] = (
          transactionValueByHash[transactionHash] ?? BigNumber(0)
        ).plus(transferValue)
      }
    }
  })

  // Separate the eligible transactions by referrerId
  const eligibleTxCountByReferrer: Record<string, number> = {}
  for (const [transactionHash, value] of Object.entries(
    transactionValueByHash,
  )) {
    if (value.abs().gte(MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT)) {
      const referrerId = await getReferrerIdFromTx(transactionHash, networkId)
      if (referrerId !== null) {
        eligibleTxCountByReferrer[referrerId] =
          (eligibleTxCountByReferrer[referrerId] ?? 0) + 1
      }
    }
  }

  return eligibleTxCountByReferrer
}

/**
 * Calculates eligible transaction count for Tether (USDT) activity across multiple networks.
 *
 * **KPI Unit**: Transaction count (number of eligible transactions) where the net transfer value is >= 1 USDT or USDT0
 *
 * **Business Purpose**: Measures the volume of significant Tether (USDT) transactions to or from a specific user
 * across multiple blockchain networks. This metric quantifies user engagement with the Tether ecosystem and
 * supports analysis of stablecoin usage patterns and cross-chain activity.
 *
 * **Protocol Context**: Tether V0 tracks transaction volume to measure user participation in the stablecoin
 * ecosystem across various networks. Transaction counts serve as a proxy for user engagement and economic
 * activity, supporting stablecoin adoption analysis and cross-chain usage patterns.
 *
 * **Networks**: Ethereum Mainnet, Avalanche Mainnet, Celo Mainnet, Unichain Mainnet, Ink Mainnet,
 * Optimism Mainnet, Arbitrum One, Berachain Mainnet
 *
 * **Data Sources**:
 * - **HyperSync**: Transfer event data from USDT and USDT0 token contracts on multiple networks via HyperSync client
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
 *
 * **Business Assumptions**:
 * - Transactions with net value >= 1 USDT or USDT0 (1,000,000 smallest units) are considered significant
 * - User's economic impact is proportional to the number of eligible transactions across all networks
 * - Both incoming and outgoing transfers contribute to user activity measurement
 *
 * **Eligibility Criteria**:
 * - Transactions must have a net transfer value (incoming - outgoing) >= 1 USDT or USDT0
 * - Transactions must fall within the specified time window
 *
 * **Calculation Method**:
 * 1. Queries all transactions initiated by user wallet across all supported networks
 * 2. Retrieves Transfer events from official Tether token contracts for each network
 * 3. Calculates net transfer value per transaction (incoming - outgoing transfers)
 * 4. Filters transactions by minimum value threshold (1 USDT)
 * 5. Aggregates eligible transaction counts across all networks
 * 6. Returns total count representing user's significant Tether activity
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate transaction count for
 * @param params.startTimestamp - Start of time window for calculation (inclusive)
 * @param params.endTimestampExclusive - End of time window for calculation (exclusive)
 * @param params.redis - Optional Redis client for caching block ranges
 *
 * @returns Promise resolving to KPI results grouped by referrer ID with per-network breakdown
 */
export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
  redis,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
  redis?: RedisClientType
  getReferrerIdFromTx?: (
    transactionHash: string,
    networkId: NetworkId,
  ) => Promise<string | null>
}): Promise<KpiResults> {
  const kpiByReferrer: Record<
    string,
    KpiResult & { referrerId: string; userAddress: string }
  > = {}

  await Promise.all(
    (Object.entries(networkToTokenAddress) as [NetworkId, Address][]).map(
      async ([networkId, tokenAddress]) => {
        const blockRange = await getBlockRange({
          networkId,
          startTimestamp,
          endTimestampExclusive,
          redis,
        })

        const eligibleTxCountByReferrer = await getEligibleTxCountByReferrer({
          networkId,
          user: address as Address,
          startBlock: blockRange.startBlock,
          endBlockExclusive: blockRange.endBlockExclusive,
          tokenAddress,
        })

        // Aggregate results by referrer across the supported networks
        for (const [referrerId, txCount] of Object.entries(
          eligibleTxCountByReferrer,
        )) {
          if (!(referrerId in kpiByReferrer)) {
            kpiByReferrer[referrerId] = {
              kpi: 0,
              referrerId,
              userAddress: address,
              metadata: {},
            }
          }
          kpiByReferrer[referrerId].kpi += txCount
          kpiByReferrer[referrerId].metadata![networkId] = txCount
        }
      },
    ),
  )

  return Object.values(kpiByReferrer)
}
