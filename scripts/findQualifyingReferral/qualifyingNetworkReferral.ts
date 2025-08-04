import { BlockField, TransactionField } from '@envio-dev/hypersync-client'
import { getBlockRange } from '../calculateKpi/protocols/utils/events'
import { NetworkId, ReferralEvent } from '../types'
import { getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getReferrerIdFromTx } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx'
import { Address, Hex } from 'viem'
import { RedisClientType } from '@redis/client'
import Bottleneck from 'bottleneck'
import { TransactionInfo } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getTransactionInfo'
import { getUserOperations } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getUserOperations'

const limiter = new Bottleneck({
  reservoir: 1000, // initial number of available requests
  reservoirRefreshAmount: 1000, // how many tokens to add on refresh
  reservoirRefreshInterval: 60 * 1000, // refresh every 60 seconds
  minTime: 0, // no minimum time between requests
})

async function findQualifyingNetworkReferralForUser({
  user,
  startBlock,
  endBlockExclusive,
  networkId,
}: {
  user: string
  startBlock: number
  endBlockExclusive: number
  networkId: NetworkId
}) {
  const client = getHyperSyncClient(networkId)
  let qualifyingNetworkReferral: ReferralEvent | null = null
  const query = {
    transactions: [{ from: [user] }],
    fieldSelection: {
      block: [BlockField.Timestamp],
      transaction: [
        TransactionField.Hash,
        TransactionField.Input,
        TransactionField.To,
      ],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }
  await paginateQuery(client, query, async (response) => {
    for (let i = 0; i < response.data.transactions.length; i++) {
      const tx = response.data.transactions[i]
      const block = response.data.blocks[i]
      if (!block || !tx) {
        // should never happen
        continue
      }

      if (!tx.hash || !tx.input || !block.timestamp) {
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
          from: user as Address,
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
          from: user as Address,
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
        qualifyingNetworkReferral = {
          userAddress: user,
          timestamp: block.timestamp,
          referrerId,
        }
        return true
      }
    }
  })
  return qualifyingNetworkReferral
}

const findQualifyingNetworkReferralForUserLimited = limiter.wrap(
  findQualifyingNetworkReferralForUser,
)

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
    await Promise.all(
      batch.map(async (user) => {
        const qualifyingNetworkReferral =
          await findQualifyingNetworkReferralForUserLimited({
            user,
            startBlock,
            endBlockExclusive,
            networkId,
          })
        if (qualifyingNetworkReferral) {
          qualifyingReferrals.push(qualifyingNetworkReferral)
        }
      }),
    )
  }
  return qualifyingReferrals
}
