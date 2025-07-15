import { RedisClientType } from '@redis/client'
import { KpiResult, NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchNetworkMetrics } from '../utils/networks'

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
}): Promise<KpiResult> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['base-mainnet'],
    startTimestamp,
    endTimestampExclusive,
    redis,
  })

  const { totalGasUsed: kpi, totalTransactions } = await fetchNetworkMetrics({
    networkId: NetworkId['base-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
  return { kpi, metadata: { totalTransactions } }
}
