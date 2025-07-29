import { RedisClientType } from '@redis/client'
import { KpiResult, NetworkId } from '../types'
import { getBlockRange } from './protocols/utils/events'
import { fetchNetworkMetrics } from './protocols/utils/networks'

export async function calculateGasKpi({
    address,
    startTimestamp,
    endTimestampExclusive,
    networkId,
    redis,
  }: {
    address: string
    startTimestamp: Date
    endTimestampExclusive: Date
    networkId: NetworkId
    redis?: RedisClientType
  }): Promise<KpiResult> {
    const { startBlock, endBlockExclusive } = await getBlockRange({
      networkId,
      startTimestamp,
      endTimestampExclusive,
      redis,
    })
  
    const { totalGasUsed: kpi, totalTransactions } = await fetchNetworkMetrics({
      networkId,
      users: [address],
      startBlock,
      endBlockExclusive,
    })
    return { kpi, metadata: { totalTransactions } }
  }
