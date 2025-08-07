import { RedisClientType } from '@redis/client'
import { KpiResults, NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import {
  Address,
  decodeEventLog,
  erc20Abi,
  Hex,
  pad,
  toEventSelector,
} from 'viem'
import {
  JoinMode,
  LogField,
  TransactionField,
} from '@envio-dev/hypersync-client'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { getHyperSyncClient, getViemPublicClient } from '../../../utils'
import { BigNumber } from 'bignumber.js'
import { getReferrerIdFromTx } from './parseReferralTag/getReferrerIdFromTx'
import { divviRegistryAbi } from '../../../../abis/DivviRegistry'
import {
  REGISTRY_CONTRACT_ADDRESS,
  REWARDS_PROVIDERS,
} from '../../../utils/referrals'

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

  const startTime = Date.now()

  const transactions = new Set<string>()

  const query = {
    transactions: [{ from: [user] }],
    logs: [
      {
        address: [tokenAddress],
        // transfer from user
        topics: [[transferEventSigHash], [pad(user, { size: 32 })], [], []],
      },
      {
        address: [tokenAddress],
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
    joinMode: JoinMode.JoinNothing,
  }

  // Group each Transfer event to / from the user by transactionHash to get the net transfer value
  await paginateQuery(client, query, async (response) => {
    for (const tx of response.data.transactions) {
      if (tx.hash) {
        transactions.add(tx.hash)
      }
    }

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

  console.log(
    'Finished hypersync query for network',
    networkId,
    'in',
    Date.now() - startTime,
    'ms with',
    Object.keys(transactionValueByHash).length,
    'transactions',
  )

  // console.log(transactionValueByHash)

  const logHashes = new Set(Object.keys(transactionValueByHash))

  console.log(
    logHashes.has(
      '0x9d0d2909a9592c3b40a823f13a8b64b5d84dc2d66c6d61de874f9c76413aa240',
    ),
  )

  console.log(
    transactions.has(
      '0x9d0d2909a9592c3b40a823f13a8b64b5d84dc2d66c6d61de874f9c76413aa240',
    ),
  )

  const intersection = Array.from(logHashes).filter((hash) =>
    transactions.has(hash),
  )

  // const extraTransactions = Array.from(transactions).filter(
  //   (hash) => !logHashes.has(hash),
  // )

  // console.log('extra transactions', extraTransactions)

  console.log(
    intersection.length,
    'transactions in hypersync query logs and txs',
  )

  console.log(transactions.size, 'transactions in hypersync query')

  let now = Date.now()

  // Separate the eligible transactions by referrerId
  const eligibleTxCountByReferrer: Record<string, number> = {}
  const entries = Object.entries(transactionValueByHash)
  const BATCH_SIZE = 25

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    // Prepare all the getReferrerIdFromTx promises for this batch
    const batchPromises = batch.map(async ([transactionHash, value]) => {
      if (value.abs().gte(MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT)) {
        const referral = await getReferrerIdFromTx(
          transactionHash as Hex,
          networkId,
          true,
        )
        return { referral, transactionHash }
      }
      return { referral: null, transactionHash }
    })

    const batchResults = await Promise.all(batchPromises)

    for (let j = 0; j < batch.length; j++) {
      const { referral } = batchResults[j]
      if (referral !== null && referral.user === user) {
        eligibleTxCountByReferrer[referral.referrerId] =
          (eligibleTxCountByReferrer[referral.referrerId] ?? 0) + 1
      }
    }

    console.log(
      'Processed',
      i + BATCH_SIZE,
      'transactions in',
      Date.now() - now,
      'ms',
    )

    now = Date.now()
  }

  return eligibleTxCountByReferrer
}

/**
 * Calculates eligible transaction count for Tether (USDT) activity across multiple networks.
 *
 * **KPI Unit**: Transaction count (number of eligible transactions) where the net transfer value is >= 1 USDT or USDT0
 *
 * **Business Purpose**: Measures the volume of significant Tether (USDT) transactions initiated by users
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
}): Promise<KpiResults> {
  const kpiByReferrer: Record<string, KpiResults[number]> = {}
  const campaignEntityId = REWARDS_PROVIDERS['tether-v0']
  if (!campaignEntityId) {
    throw new Error('Tether V0 rewards provider not found')
  }

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

  // There is an edge case where a builder could add a divvi referral tag but have not signed up for the campaign.
  // We should exclude any referrers that have not registered agreements with the campaign on DivviRegistry.
  const publicClientOptimism = getViemPublicClient(NetworkId['op-mainnet'])
  const registeredReferrers = new Set<string>()
  await Promise.all(
    (Object.keys(kpiByReferrer) as Address[]).map(async (referrerId) => {
      const hasAgreement = await publicClientOptimism.readContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: divviRegistryAbi,
        functionName: 'hasAgreement',
        args: [campaignEntityId, referrerId],
      })
      if (hasAgreement) {
        registeredReferrers.add(referrerId.toLowerCase())
      }
    }),
  )

  return Object.values(kpiByReferrer).filter((kpi) =>
    registeredReferrers.has(kpi.referrerId.toLowerCase()),
  )
}

/**
 * Batch version of calculateKpi that processes multiple users at once.
 *
 * **Business Logic**: Counts transactions initiated by users where the total transfer value
 * (sum of all transfers involving the user) >= 1 USDT. Each transaction hash is associated
 * with exactly one user (the transaction initiator).
 *
 * **Performance**: Makes a single HyperSync query for all users instead of separate queries per user.
 */
export async function calculateKpiBatch({
  users,
  startTimestamp,
  endTimestampExclusive,
  redis,
  index,
}: {
  users: string[]
  startTimestamp: Date
  endTimestampExclusive: Date
  redis?: RedisClientType
  index?: number
}): Promise<KpiResults> {
  const kpiByUserAndReferrer: Record<
    string,
    Record<string, KpiResults[number]>
  > = {}
  const campaignEntityId = REWARDS_PROVIDERS['tether-v0']
  if (!campaignEntityId) {
    throw new Error('Tether V0 rewards provider not found')
  }

  await Promise.all(
    (Object.entries(networkToTokenAddress) as [NetworkId, Address][]).map(
      async ([networkId, tokenAddress]) => {
        const blockRange = await getBlockRange({
          networkId,
          startTimestamp,
          endTimestampExclusive,
          redis,
        })

        const eligibleTxCountByUserAndReferrer =
          await getEligibleTxCountByUserAndReferrer({
            networkId,
            users: users as Address[],
            startBlock: blockRange.startBlock,
            endBlockExclusive: blockRange.endBlockExclusive,
            tokenAddress,
            index,
          })

        // Aggregate results by user and referrer across the supported networks
        for (const [userAddress, referrerCounts] of Object.entries(
          eligibleTxCountByUserAndReferrer,
        )) {
          if (!(userAddress in kpiByUserAndReferrer)) {
            kpiByUserAndReferrer[userAddress] = {}
          }

          for (const [referrerId, txCount] of Object.entries(referrerCounts)) {
            if (!(referrerId in kpiByUserAndReferrer[userAddress])) {
              kpiByUserAndReferrer[userAddress][referrerId] = {
                kpi: 0,
                referrerId,
                userAddress,
                metadata: {},
              }
            }
            kpiByUserAndReferrer[userAddress][referrerId].kpi += txCount
            kpiByUserAndReferrer[userAddress][referrerId].metadata![networkId] =
              txCount
          }
        }
      },
    ),
  )

  // There is an edge case where a builder could add a divvi referral tag but have not signed up for the campaign.
  // We should exclude any referrers that have not registered agreements with the campaign on DivviRegistry.
  const publicClientOptimism = getViemPublicClient(NetworkId['op-mainnet'])
  const registeredReferrers = new Set<string>()

  // Collect all unique referrer IDs across all users
  const allReferrerIds = new Set<string>()
  for (const userReferrers of Object.values(kpiByUserAndReferrer)) {
    for (const referrerId of Object.keys(userReferrers)) {
      allReferrerIds.add(referrerId)
    }
  }

  const startTime = Date.now()

  await Promise.all(
    (Array.from(allReferrerIds) as Address[]).map(async (referrerId) => {
      const hasAgreement = await publicClientOptimism.readContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: divviRegistryAbi,
        functionName: 'hasAgreement',
        args: [campaignEntityId, referrerId],
      })
      if (hasAgreement) {
        registeredReferrers.add(referrerId.toLowerCase())
      }
    }),
  )

  console.log(
    'Finished checking agreements for batch',
    index,
    'in',
    Date.now() - startTime,
  )

  // Flatten results and filter by registered referrers
  const results: KpiResults = []
  for (const userReferrers of Object.values(kpiByUserAndReferrer)) {
    for (const kpi of Object.values(userReferrers)) {
      if (registeredReferrers.has(kpi.referrerId.toLowerCase())) {
        results.push(kpi)
      }
    }
  }

  return results
}

async function getEligibleTxCountByUserAndReferrer({
  networkId,
  users,
  startBlock,
  endBlockExclusive,
  tokenAddress,
  index,
}: {
  networkId: NetworkId
  users: Address[]
  startBlock?: number
  endBlockExclusive?: number
  tokenAddress: Address
  index?: number
}): Promise<Record<string, Record<string, number>>> {
  const client = getHyperSyncClient(networkId)

  const startTime = Date.now()

  const transactionsByHash: Record<
    string,
    {
      from: Address
      to: Address
      calldata: Hex
      value: BigNumber
    }
  > = {}

  const query = {
    transactions: [{ from: users }],
    logs: [
      {
        address: [tokenAddress],
        // transfer from any of the users (outgoing)
        topics: [
          [transferEventSigHash],
          users.map((user) => pad(user, { size: 32 })),
          [],
          [],
        ],
      },
      {
        address: [tokenAddress],
        // transfer to any of the users (incoming)
        topics: [
          [transferEventSigHash],
          [],
          users.map((user) => pad(user, { size: 32 })),
          [],
        ],
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
      transaction: [
        TransactionField.Hash,
        TransactionField.From,
        TransactionField.To,
        TransactionField.Input,
      ],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }

  // We need to get transaction data to know who initiated each transaction

  await paginateQuery(client, query, async (response) => {
    // First, get transaction initiators from transaction data
    for (const tx of response.data.transactions) {
      if (tx.hash && tx.from && tx.to && tx.input) {
        const initiator = tx.from as Address
        transactionsByHash[tx.hash] = {
          from: initiator as Address,
          to: tx.to as Address,
          calldata: tx.input as Hex,
          value: BigNumber(0),
        }
      }
    }

    // Then process transfer events
    for (const { data, topics, transactionHash } of response.data.logs) {
      if (data && transactionHash) {
        const decodedLog = decodeEventLog({
          abi: erc20Abi,
          data: data as Hex,
          topics: topics as [],
        })

        if (decodedLog.eventName === 'Transfer') {
          const fromUser = decodedLog.args.from.toLowerCase()
          const toUser = decodedLog.args.to.toLowerCase()
          const transferValue = BigNumber(decodedLog.args.value)

          // Get the transaction initiator
          const txInfo = transactionsByHash[transactionHash]
          if (txInfo) {
            // Check if the initiator was involved in this transfer
            if (fromUser === txInfo.from || toUser === txInfo.from) {
              // Determine if this is an incoming or outgoing transfer for the initiator
              const isIncoming = toUser === txInfo.from
              const netTransferValue = transferValue.multipliedBy(
                isIncoming ? 1 : -1,
              )

              txInfo.value = txInfo.value.plus(netTransferValue)
            }
          }
        }
      }
    }
  })

  const midTime = Date.now()

  console.log(
    'Finished hypersync query for network',
    networkId,
    index,
    'in',
    midTime - startTime,
  )

  // Separate the eligible transactions by user and referrerId
  const eligibleTxCountByUserAndReferrer: Record<
    string,
    Record<string, number>
  > = {}

  for (const [transactionHash, txInfo] of Object.entries(transactionsByHash)) {
    // Check if the absolute net transfer value meets the minimum threshold
    if (txInfo.value.abs().gte(MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT)) {
      const userAddress = txInfo.from
      const referrerId = await getReferrerIdFromTx(
        transactionHash as Hex,
        networkId,
        true,
        {
          hash: transactionHash as Hex,
          type: 'transaction',
          transactionType: 'regular',
          from: txInfo.from,
          to: txInfo.to,
          calldata: txInfo.calldata,
        },
      )
      if (referrerId !== null) {
        if (!eligibleTxCountByUserAndReferrer[userAddress]) {
          eligibleTxCountByUserAndReferrer[userAddress] = {}
        }
        eligibleTxCountByUserAndReferrer[userAddress][referrerId.referrerId] =
          (eligibleTxCountByUserAndReferrer[userAddress][
            referrerId.referrerId
          ] ?? 0) + 1
      }
    }
  }

  console.log(
    'Finished processing transactions for network',
    networkId,
    index,
    'in',
    Date.now() - midTime,
  )

  return eligibleTxCountByUserAndReferrer
}

calculateKpi({
  address: '0x9113f321ed93fa43bef9511868e9fd2eae9d7614',
  // address: '0x5e4aadfdb8e274e959946c43f974d9d3e06d19a9',
  startTimestamp: new Date('2025-07-28T00:00:00Z'),
  endTimestampExclusive: new Date('2025-08-06T22:00:00Z'),
}).then((res) => console.log('single', res))

// calculateKpiBatch({
//   users: ['0x9113f321ed93fa43bef9511868e9fd2eae9d7614'],
//   startTimestamp: new Date('2025-07-28T00:00:00Z'),
//   endTimestampExclusive: new Date('2025-08-06T22:00:00Z'),
// }).then((res) => console.log('batch', res))
