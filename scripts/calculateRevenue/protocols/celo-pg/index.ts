import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalTransactionFees } from '../utils/networks'

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  return await fetchTotalTransactionFees({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
