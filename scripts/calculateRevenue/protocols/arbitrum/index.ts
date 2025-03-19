import { NetworkId } from '../../../types'
import { getNearestBlock } from '../utils/events'
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
  const startBlock = await getNearestBlock(
    NetworkId['arbitrum-one'],
    startTimestamp,
  )
  const endBlock = await getNearestBlock(
    NetworkId['arbitrum-one'],
    endTimestamp,
  )

  return await fetchTotalTransactionFees({
    networkId: NetworkId['arbitrum-one'],
    users: [address],
    startBlock,
    endBlock,
  })
}
