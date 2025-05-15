import { NetworkId } from '../../../types'
import { getBlockRange } from '../utils/events'
import { fetchTotalTransactions } from '../utils/networks'

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
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestamp,
  })

  return await fetchTotalTransactions({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlockExclusive,
  })
}
