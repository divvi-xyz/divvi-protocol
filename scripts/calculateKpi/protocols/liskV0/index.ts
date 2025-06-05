import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalGasUsed } from '../utils/networks'

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
    networkId: NetworkId['lisk-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  const kpi = await fetchTotalGasUsed({
    networkId: NetworkId['lisk-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
  return {kpi}
}
