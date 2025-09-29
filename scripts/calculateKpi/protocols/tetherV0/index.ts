import { RedisClientType } from '@redis/client'
import { KpiResults, NetworkId, ReferredUser } from '../../../types'
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
import { getHyperSyncClient, getViemPublicClient } from '../../../utils'
import { BigNumber } from 'bignumber.js'
import { getReferrerIdFromTx } from './parseReferralTag/getReferrerIdFromTx'
import { divviRegistryAbi } from '../../../../abis/DivviRegistry'
import {
  REGISTRY_CONTRACT_ADDRESS,
  REWARDS_PROVIDERS,
} from '../../../utils/referrals'
import { isEntryPointAddress } from './parseReferralTag/getUserOperations'
import { TransactionInfo } from './parseReferralTag/getTransactionInfo'

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
  // Disabled because Berachain hypersync node is unreliable
  // [NetworkId['berachain-mainnet']]:
  //   '0x779ded0c9e1022225f8e0630b35a9b54be713736',
}

async function getEligibleTransactionsInfoByReferrer({
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
}) {
  const client = getHyperSyncClient(networkId)

  const transactionsByHash: Record<
    string,
    {
      value: BigNumber
      to: Address
      input: Hex
      transferFrom: Address | undefined
      transferTo: Address | undefined
    }
  > = {}

  const query = {
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
      transaction: [
        TransactionField.Hash,
        TransactionField.Input,
        TransactionField.To,
        TransactionField.From,
      ],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }

  // Group each Transfer event to / from the user by transactionHash to get the net transfer value
  await paginateQuery(client, query, async (response) => {
    for (const tx of response.data.transactions) {
      if (
        tx.hash &&
        tx.to &&
        tx.input &&
        (tx.from?.toLowerCase() === user.toLowerCase() ||
          isEntryPointAddress(tx.to as Address))
      ) {
        transactionsByHash[tx.hash] = {
          value: BigNumber(0),
          to: tx.to as Address,
          input: tx.input as Hex,
          transferFrom: undefined,
          transferTo: undefined,
        }
      }
    }

    for (const { data, topics, transactionHash } of response.data.logs) {
      if (data && transactionHash) {
        const decodedLog = decodeEventLog({
          abi: erc20Abi,
          data: data as Hex,
          topics: topics as [],
        })

        if (decodedLog.eventName !== 'Transfer') {
          // should never happen
          continue
        }

        const isTransferToUser =
          decodedLog.args.to.toLowerCase() === user.toLowerCase()
        const transferValue = BigNumber(decodedLog.args.value).multipliedBy(
          isTransferToUser ? 1 : -1,
        )

        if (transactionsByHash[transactionHash]) {
          transactionsByHash[transactionHash].value =
            transactionsByHash[transactionHash].value.plus(transferValue)
          transactionsByHash[transactionHash].transferFrom =
            decodedLog.args.from
          transactionsByHash[transactionHash].transferTo = decodedLog.args.to
        }
      }
    }
  })

  // Separate the eligible transactions by referrerId
  const transactionsByReferrer: Record<
    string,
    {
      txCount: number
      addresses: Set<Address>
      totalValue: BigNumber
    }
  > = {}
  for (const [
    transactionHash,
    { value, to, input, transferFrom, transferTo },
  ] of Object.entries(transactionsByHash)) {
    if (value.abs().gte(MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT)) {
      let transactionInfo: TransactionInfo | undefined

      if (!isEntryPointAddress(to)) {
        transactionInfo = {
          hash: transactionHash as Hex,
          type: 'transaction',
          transactionType: 'regular',
          from: user,
          to,
          calldata: input,
        }
      }

      const referral = await getReferrerIdFromTx(
        transactionHash as Hex,
        networkId,
        true,
        transactionInfo,
      )
      if (referral !== null && referral.user === user) {
        transactionsByReferrer[referral.referrerId] = {
          txCount:
            (transactionsByReferrer[referral.referrerId]?.txCount ?? 0) + 1,
          addresses: new Set(
            [
              ...(transactionsByReferrer[referral.referrerId]?.addresses ?? []),
              transferFrom,
              transferTo,
            ].filter(Boolean) as Address[],
          ),
          totalValue: (
            transactionsByReferrer[referral.referrerId]?.totalValue ??
            BigNumber(0)
          ).plus(value.abs()),
        }
      }
    }
  }

  return transactionsByReferrer
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

        const transactionsByReferrer =
          await getEligibleTransactionsInfoByReferrer({
            networkId,
            user: address as Address,
            startBlock: blockRange.startBlock,
            endBlockExclusive: blockRange.endBlockExclusive,
            tokenAddress,
          })

        // Aggregate results by referrer across the supported networks
        for (const [
          referrerId,
          { txCount, addresses, totalValue },
        ] of Object.entries(transactionsByReferrer)) {
          if (!(referrerId in kpiByReferrer)) {
            kpiByReferrer[referrerId] = {
              kpi: 0,
              referrerId,
              userAddress: address,
              metadata: {},
            }
          }
          kpiByReferrer[referrerId].kpi += totalValue.toNumber()
          kpiByReferrer[referrerId].metadata![networkId] = {
            txCount,
            addresses: Array.from(addresses),
            totalValue,
          }
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
}: {
  users: ReferredUser[]
  startTimestamp: Date
  endTimestampExclusive: Date
  redis?: RedisClientType
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
            users: users.map((user) => user.address as Address),
            startBlock: blockRange.startBlock,
            endBlockExclusive: blockRange.endBlockExclusive,
            tokenAddress,
          })

        // Aggregate results by user and referrer across the supported networks
        for (const [userAddress, referrerCounts] of Object.entries(
          eligibleTxCountByUserAndReferrer,
        )) {
          if (!(userAddress in kpiByUserAndReferrer)) {
            kpiByUserAndReferrer[userAddress] = {}
          }

          for (const [
            referrerId,
            { txCount, addresses, totalValue },
          ] of Object.entries(referrerCounts)) {
            if (!(referrerId in kpiByUserAndReferrer[userAddress])) {
              kpiByUserAndReferrer[userAddress][referrerId] = {
                kpi: 0,
                referrerId,
                userAddress,
                metadata: {},
              }
            }
            kpiByUserAndReferrer[userAddress][referrerId].kpi +=
              totalValue.toNumber()
            kpiByUserAndReferrer[userAddress][referrerId].metadata![networkId] =
              {
                txCount,
                addresses: Array.from(addresses),
                totalValue,
              }
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
}: {
  networkId: NetworkId
  users: Address[]
  startBlock?: number
  endBlockExclusive?: number
  tokenAddress: Address
}): Promise<
  Record<
    string,
    Record<
      string,
      { txCount: number; totalValue: BigNumber; addresses: Set<Address> }
    >
  >
> {
  const client = getHyperSyncClient(networkId)

  const transactionsByHash: Record<
    string,
    {
      from: Address
      to: Address
      input: Hex
      value: BigNumber
      transferFrom: Address | undefined
      transferTo: Address | undefined
    }
  > = {}

  const query = {
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

  await paginateQuery(client, query, async (response) => {
    for (const tx of response.data.transactions) {
      if (
        tx.hash &&
        tx.from &&
        tx.to &&
        tx.input &&
        (users.includes(tx.from.toLowerCase() as Address) ||
          isEntryPointAddress(tx.to as Address))
      ) {
        transactionsByHash[tx.hash] = {
          from: tx.from as Address,
          to: tx.to as Address,
          input: tx.input as Hex,
          value: BigNumber(0),
          transferFrom: undefined,
          transferTo: undefined,
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

        if (decodedLog.eventName !== 'Transfer') {
          // should never happen
          continue
        }

        if (transactionsByHash[transactionHash]) {
          const isTransferToUser =
            decodedLog.args.to.toLowerCase() ===
            transactionsByHash[transactionHash].from.toLowerCase()
          const transferValue = BigNumber(decodedLog.args.value).multipliedBy(
            isTransferToUser ? 1 : -1,
          )
          transactionsByHash[transactionHash].value =
            transactionsByHash[transactionHash].value.plus(transferValue)
          transactionsByHash[transactionHash].transferFrom =
            decodedLog.args.from
          transactionsByHash[transactionHash].transferTo = decodedLog.args.to
        }
      }
    }
  })

  // Separate the eligible transactions by user and referrerId
  const eligibleTxCountByUserAndReferrer: Record<
    string,
    Record<
      string,
      { txCount: number; totalValue: BigNumber; addresses: Set<Address> }
    >
  > = {}

  for (const [
    transactionHash,
    { value, to, from, input, transferFrom, transferTo },
  ] of Object.entries(transactionsByHash)) {
    // Check if the absolute net transfer value meets the minimum threshold
    if (value.abs().gte(MIN_ELIGIBLE_VALUE_IN_SMALLEST_UNIT)) {
      let transactionInfo: TransactionInfo | undefined
      if (!isEntryPointAddress(to)) {
        transactionInfo = {
          hash: transactionHash as Hex,
          type: 'transaction',
          transactionType: 'regular',
          from: from,
          to: to,
          calldata: input,
        }
      }
      const referral = await getReferrerIdFromTx(
        transactionHash as Hex,
        networkId,
        true,
        transactionInfo,
      )
      if (
        referral !== null &&
        users.includes(referral.user.toLowerCase() as Address)
      ) {
        const userAddress = referral.user.toLowerCase()
        if (!eligibleTxCountByUserAndReferrer[userAddress]) {
          eligibleTxCountByUserAndReferrer[userAddress] = {}
        }
        eligibleTxCountByUserAndReferrer[userAddress][referral.referrerId] = {
          txCount:
            (eligibleTxCountByUserAndReferrer[userAddress][referral.referrerId]
              ?.txCount ?? 0) + 1,
          totalValue: (
            eligibleTxCountByUserAndReferrer[userAddress][referral.referrerId]
              ?.totalValue ?? BigNumber(0)
          ).plus(value.abs()),
          addresses: new Set(
            [
              ...(eligibleTxCountByUserAndReferrer[userAddress][
                referral.referrerId
              ]?.addresses ?? []),
              transferFrom,
              transferTo,
            ].filter(Boolean) as Address[],
          ),
        }
      }
    }
  }

  return eligibleTxCountByUserAndReferrer
}
