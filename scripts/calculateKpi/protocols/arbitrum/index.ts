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
}): Promise<number> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['arbitrum-one'],
    startTimestamp,
    endTimestampExclusive,
  })

  return await fetchTotalGasUsed({
    networkId: NetworkId['arbitrum-one'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
