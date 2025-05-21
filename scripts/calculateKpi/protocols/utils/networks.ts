import { TransactionField } from '@envio-dev/hypersync-client'
import { NetworkId } from '../../../types'
import { getHyperSyncClient } from '../../../utils'
import { paginateQuery } from '../../../utils/hypersyncPagination'

export async function fetchTotalTransactionFees({
  networkId,
  users,
  startBlock,
  endBlockExclusive,
}: {
  networkId: NetworkId
  users: string[]
  startBlock?: number // inclusive
  endBlockExclusive?: number
}): Promise<number> {
  let totalTransactionFees = 0

  const client = getHyperSyncClient(networkId)

  const query = {
    transactions: [{ from: users }],
    fieldSelection: {
      transaction: [TransactionField.GasUsed, TransactionField.GasPrice],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }

  await paginateQuery(client, query, async (response) => {
    for (const tx of response.data.transactions) {
      totalTransactionFees += Number(tx.gasUsed ?? 0) * Number(tx.gasPrice ?? 0)
    }
  })

  return totalTransactionFees
}

export async function fetchTotalTransactions({
  networkId,
  users,
  startBlock,
  endBlockExclusive,
}: {
  networkId: NetworkId
  users: string[]
  startBlock?: number // inclusive
  endBlockExclusive?: number
}): Promise<number> {
  let totalTransactions = 0

  const client = getHyperSyncClient(networkId)

  const query = {
    transactions: [{ from: users }],
    fieldSelection: {
      transaction: [TransactionField.Hash],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlockExclusive && { toBlock: endBlockExclusive }),
  }

  await paginateQuery(client, query, async (response) => {
    totalTransactions += response.data.transactions.length
  })

  return totalTransactions
}
