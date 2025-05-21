import { CalculateKpiFn, NetworkId } from '../../types'
import { getBlockRange } from './utils/events'
import { fetchTotalTransactions } from './utils/networks'

export const calculateKpi: CalculateKpiFn = async ({
  address,
  startTimestamp,
  endTimestampExclusive,
}) => {
  const networkIds = [
    NetworkId['base-mainnet'],
    NetworkId['celo-mainnet'],
    NetworkId['polygon-pos-mainnet'],
  ]

  const blockRanges = await Promise.all(
    networkIds.map((networkId) =>
      getBlockRange({
        networkId,
        startTimestamp,
        endTimestampExclusive,
      }),
    ),
  )

  const transactions = await Promise.all(
    networkIds.map((networkId, index) =>
      fetchTotalTransactions({
        networkId,
        users: [address],
        startBlock: blockRanges[index].startBlock,
        endBlockExclusive: blockRanges[index].endBlockExclusive,
      }),
    ),
  )

  let totalTransactions = 0
  for (const count of transactions) {
    totalTransactions += count
  }
  return totalTransactions
}
