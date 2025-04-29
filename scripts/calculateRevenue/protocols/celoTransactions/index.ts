import { NetworkId } from '../../../types'
import { getNearestBlock } from '../utils/events'
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
  const startBlock = await getNearestBlock(
    NetworkId['celo-mainnet'],
    startTimestamp,
  )
  const endBlock = await getNearestBlock(
    NetworkId['celo-mainnet'],
    endTimestamp,
  )

  return await fetchTotalTransactions({
    networkId: NetworkId['celo-mainnet'],
    users: [address],
    startBlock,
    endBlock,
  })
}
