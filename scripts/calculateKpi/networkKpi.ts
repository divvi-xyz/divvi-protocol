import { RedisClientType } from '@redis/client'
import { KpiResult, NetworkId } from '../types'
import { getBlockRange } from './protocols/utils/events'
import { fetchNetworkMetrics } from './protocols/utils/networks'

type KpiType = 'gas' | 'tx'

export async function calculateNetworkKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
  networkId,
  redis,
  kpiType,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
  networkId: NetworkId
  redis?: RedisClientType
  kpiType: KpiType
}): Promise<KpiResult> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
    redis,
  })

  const { totalGasUsed, totalTransactions } = await fetchNetworkMetrics({
    networkId,
    users: [address],
    startBlock,
    endBlockExclusive,
  })
  return {
    kpi: kpiType === 'gas' ? totalGasUsed : totalTransactions,
    metadata: { totalTransactions },
  }
}
