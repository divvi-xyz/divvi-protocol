import { BlockField, TransactionField } from '@envio-dev/hypersync-client'
import { getBlockRange } from '../calculateKpi/protocols/utils/events'
import { NetworkId, ReferralEvent } from '../types'
import { getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getReferrerIdFromTx } from '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx'
import { Hex } from 'viem'
import { RedisClientType } from '@redis/client'

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

  const client = getHyperSyncClient(networkId)

  const qualifyingReferrals: ReferralEvent[] = []
  for (const user of users) {
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
          qualifyingReferrals.push({
            userAddress: user,
            timestamp: block.timestamp,
            referrerId,
          })
          return true
        }
      }
    })
  }
  return qualifyingReferrals
}
