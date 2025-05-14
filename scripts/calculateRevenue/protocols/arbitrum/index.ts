import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalTransactionFees } from '../utils/networks'

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['arbitrum-one'],
    startTimestamp,
    endTimestamp,
  })

  return await fetchTotalTransactionFees({
    networkId: NetworkId['arbitrum-one'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
