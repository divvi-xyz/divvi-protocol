import { TransactionField } from '@envio-dev/hypersync-client'
import { NetworkId } from '../../../types'
import { getHyperSyncClient } from '../../../utils'
import { paginateQuery } from '../../../utils/hypersyncPagination'

export async function fetchTotalTransactionFees({
  networkId,
  users,
  startBlock,
  endBlock,
}: {
  networkId: NetworkId
  users: string[]
  startBlock?: number
  endBlock?: number
}): Promise<number> {
  let totalTransactionFees = 0

  const client = getHyperSyncClient(networkId)

  const query = {
    transactions: [{ from: users }],
    fieldSelection: {
      transaction: [TransactionField.GasUsed, TransactionField.GasPrice],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlock && { toBlock: endBlock }),
  }

  await paginateQuery(client, query, async (response) => {
    for (const tx of response.data.transactions) {
      totalTransactionFees += Number(tx.gasUsed ?? 0) * Number(tx.gasPrice ?? 0)
    }
  })

  return totalTransactionFees
}
