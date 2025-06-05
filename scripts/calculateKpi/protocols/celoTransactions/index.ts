import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalTransactions } from '../utils/networks'

export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<{kpi: number}> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  const kpi = await fetchTotalTransactions({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
  return {kpi}
}
