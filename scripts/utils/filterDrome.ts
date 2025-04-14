import { BlockField } from '@envio-dev/hypersync-client'
import { NetworkId, ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'

export async function filterDrome({
  event,
  routerAddress,
  networkId,
}: {
  event: ReferralEvent
  routerAddress: string
  networkId: NetworkId
}): Promise<boolean> {
  const client = getHyperSyncClient(networkId)
  const query = {
    transactions: [{ to: [routerAddress], from: [event.userAddress] }],
    fieldSelection: { block: [BlockField.Number] },
    fromBlock: 0,
  }

  let hasTransactionsOnlyAfterEvent = false

  await paginateQuery(client, query, async (response) => {
    for (const block of response.data.blocks) {
      if (block.number) {
        const blockData = await getBlock(networkId, BigInt(block.number))

        hasTransactionsOnlyAfterEvent =
          blockData.timestamp >= BigInt(event.timestamp)
        return true // Return from callback and stop further pagination
      }
    }
  })

  return hasTransactionsOnlyAfterEvent
}
