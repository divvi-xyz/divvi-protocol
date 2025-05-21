import { CalculateKpiFn, NetworkId } from '../../types'
import { getBlockRange } from './utils/events'
import { fetchTotalTransactions } from './utils/networks'

export const calculateKpi: CalculateKpiFn = async ({
  address,
  startTimestamp,
  endTimestampExclusive,
}) => {
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['celo-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  const [baseTransactions, celoTransactions, polygonTransactions] =
    await Promise.all([
      fetchTotalTransactions({
        networkId: NetworkId['base-mainnet'],
        users: [address],
        startBlock,
        endBlockExclusive,
      }),
      fetchTotalTransactions({
        networkId: NetworkId['celo-mainnet'],
        users: [address],
        startBlock,
        endBlockExclusive,
      }),
      fetchTotalTransactions({
        networkId: NetworkId['polygon-pos-mainnet'],
        users: [address],
        startBlock,
        endBlockExclusive,
      }),
    ])

  return baseTransactions + celoTransactions + polygonTransactions
}
