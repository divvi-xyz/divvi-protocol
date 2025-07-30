import { BlockField, TransactionField } from '@envio-dev/hypersync-client'
import { getBlockRange } from '../calculateKpi/protocols/utils/events'
import { NetworkId, ReferralEvent } from '../types'
import { getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getReferrerIdFromTx } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx'
import { Hex } from 'viem'
import { RedisClientType } from '@redis/client'
import Bottleneck from 'bottleneck'

const limiter = new Bottleneck({
  reservoir: 200, // initial number of available requests
  reservoirRefreshAmount: 200, // how many tokens to add on refresh
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
      transaction: [TransactionField.Hash],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }
  await paginateQuery(client, query, async (response) => {
    for (let i = 0; i < response.data.transactions.length; i++) {
      const tx = response.data.transactions[i]
      const block = response.data.blocks[i]
      if (!tx.hash || !block.timestamp) {
        continue
      }
      const referrerId = await getReferrerIdFromTx(
        tx.hash as Hex,
        networkId,
        true,
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
  const batchSize = 20
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
