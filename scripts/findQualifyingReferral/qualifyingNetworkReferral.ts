import { BlockField, TransactionField } from '@envio-dev/hypersync-client'
import { getBlockRange } from '../calculateKpi/protocols/utils/events'
import { NetworkId, ReferralEvent } from '../types'
import { getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getReferrerIdFromTx } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx'
import { Address, Hex } from 'viem'
import { RedisClientType } from '@redis/client'
// import Bottleneck from 'bottleneck'
import { TransactionInfo } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getTransactionInfo'
import { getUserOperations } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getUserOperations'

// const limiter = new Bottleneck({
//   reservoir: 1000, // initial number of available requests
//   reservoirRefreshAmount: 1000, // how many tokens to add on refresh
//   reservoirRefreshInterval: 60 * 1000, // refresh every 60 seconds
//   minTime: 0, // no minimum time between requests
// })

async function findQualifyingNetworkReferralForUsers({
  users,
  startBlock,
  endBlockExclusive,
  networkId,
}: {
  users: string[]
  startBlock: number
  endBlockExclusive: number
  networkId: NetworkId
}) {
  const client = getHyperSyncClient(networkId)

  const qualifyingNetworkReferrals: Record<string, ReferralEvent> = {}
  const query = {
    transactions: [{ from: users }],
    fieldSelection: {
      block: [BlockField.Timestamp, BlockField.Number],
      transaction: [
        TransactionField.Hash,
        TransactionField.Input,
        TransactionField.To,
        TransactionField.From,
        TransactionField.BlockNumber,
      ],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }
  await paginateQuery(client, query, async (response) => {
    const blockTimestamps = new Map(
      response.data.blocks.map((block) => [block.number, block.timestamp]),
    )

    for (const tx of response.data.transactions) {
      const blockTimestamp = blockTimestamps.get(tx.blockNumber)
      if (!blockTimestamp) {
        // should never happen
        throw new Error(
          `Block timestamp not found for block number ${tx.blockNumber}`,
        )
      }

      if (!tx.hash || !tx.input || !tx.from) {
        continue
      }

      const user = tx.from.toLowerCase() as Address

      if (qualifyingNetworkReferrals[user]) {
        continue
      }

      let transactionInfo: TransactionInfo | null = null
      // Try to extract UserOperations to determine transaction type
      const userOperations = getUserOperations({
        to: tx.to as Address,
        calldata: tx.input as Hex,
        // TODO: convert hypersync logs to viem logs
        logs: [],
      })
      if (userOperations.length > 0) {
        // This is an Account Abstraction transaction
        transactionInfo = {
          hash: tx.hash as Hex,
          type: 'transaction',
          transactionType: 'account-abstraction-bundle',
          from: user,
          to: tx.to as Address,
          calldata: tx.input as Hex,
          userOperations,
        }
      } else {
        // This is a regular transaction
        transactionInfo = {
          hash: tx.hash as Hex,
          type: 'transaction',
          transactionType: 'regular',
          from: user,
          to: tx.to as Address,
          calldata: tx.input as Hex,
        }
      }

      const referrerId = await getReferrerIdFromTx(
        tx.hash as Hex,
        networkId,
        true,
        transactionInfo,
      )
      if (referrerId !== null) {
        qualifyingNetworkReferrals[user] = {
          userAddress: user,
          timestamp: blockTimestamp,
          referrerId,
        }

        if (Object.keys(qualifyingNetworkReferrals).length === users.length) {
          // found qualifying referrals for all users, stop
          return true
        }
      }
    }
  })
  return Object.values(qualifyingNetworkReferrals)
}

// const findQualifyingNetworkReferralForUsersLimited = limiter.wrap(
//   findQualifyingNetworkReferralForUsers,
// )

export async function findQualifyingNetworkReferral({
  users,
  startTimestamp,
  endTimestampExclusive,
  networkId,
  redis,
}: {
  users: Set<string>
  startTimestamp: Date
  endTimestampExclusive: Date
  networkId: NetworkId
  redis?: RedisClientType
}): Promise<ReferralEvent[]> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
    redis,
  })

  const qualifyingReferrals: ReferralEvent[] = []
  const batchSize = 50
  const usersArray = Array.from(users)
  for (let i = 0; i < usersArray.length; i += batchSize) {
    const batch = usersArray.slice(i, i + batchSize)
    console.log(
      'Processing user batch',
      i / batchSize + 1,
      'of',
      Math.ceil(usersArray.length / batchSize),
    )
    qualifyingReferrals.push(
      ...(await findQualifyingNetworkReferralForUsers({
        users: batch,
        startBlock,
        endBlockExclusive,
        networkId,
      })),
    )
    // await Promise.all(
    //   batch.map(async (user) => {
    //     const qualifyingNetworkReferral =
    //       await findQualifyingNetworkReferralForUserLimited({
    //         user,
    //         startBlock,
    //         endBlockExclusive,
    //         networkId,
    //       })
    //     if (qualifyingNetworkReferral) {
    //       qualifyingReferrals.push(qualifyingNetworkReferral)
    //     }
    //   }),
    // )
  }
  return qualifyingReferrals
}
