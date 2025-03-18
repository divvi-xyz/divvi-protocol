import { QueryResponse, TransactionField } from '@envio-dev/hypersync-client'
import { getHyperSyncClient } from '../../../utils'
import { NetworkId } from '../../../types'

export async function fetchTotalGasUsed({
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
  let fromBlock = startBlock ?? 0
  let totalGasUsed = 0
  let hasMoreBlocks = true

  try {
    const client = getHyperSyncClient(networkId)

    const query = {
      transactions: [{ from: users }],
      fieldSelection: {
        transaction: [TransactionField.GasUsed, TransactionField.GasPrice],
      },
      fromBlock,
      ...(endBlock && { toBlock: endBlock }),
    }

    do {
      const response: QueryResponse = await client.get(query)

      if (
        response.nextBlock <= fromBlock ||
        !response.data.transactions.length
      ) {
        hasMoreBlocks = false
      }

      for (const tx of response.data.transactions) {
        totalGasUsed += Number(tx.gasUsed ?? 0) * Number(tx.gasPrice ?? 0)
      }

      fromBlock = response.nextBlock
      query.fromBlock = fromBlock

      if (endBlock && fromBlock >= endBlock) {
        hasMoreBlocks = false
      }
    } while (hasMoreBlocks)
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return 0
  }

  return totalGasUsed
}
