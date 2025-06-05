import { RedisClientType } from '@redis/client'
import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalGasUsed } from '../utils/networks'

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
}): Promise<number> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestampExclusive,
    redis,
  })

  return await fetchTotalGasUsed({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
