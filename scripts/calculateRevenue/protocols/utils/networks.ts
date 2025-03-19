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
  let totalGasUsed = 0
  let hasMoreBlocks = true

  const client = getHyperSyncClient(networkId)

  const query = {
    transactions: [{ from: users }],
    fieldSelection: {
      transaction: [TransactionField.GasUsed, TransactionField.GasPrice],
    },
    fromBlock: startBlock ?? 0,
    ...(endBlock && { toBlock: endBlock }),
  }

  while (hasMoreBlocks) {
    const response: QueryResponse = await client.get(query)
    console.log('response: ', response)
    if (response.nextBlock === query.fromBlock) {
      hasMoreBlocks = false
    } else {
      query.fromBlock = response.nextBlock
    }

    for (const tx of response.data.transactions) {
      totalGasUsed += Number(tx.gasUsed ?? 0) * Number(tx.gasPrice ?? 0)
    }

    // Check if we've reached the desired end block to avoid an unnecessary request
    if (endBlock && query.fromBlock >= endBlock) {
      hasMoreBlocks = false
    }
  }
  return totalGasUsed
}
