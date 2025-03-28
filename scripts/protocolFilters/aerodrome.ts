import { BlockField } from '@envio-dev/hypersync-client'
import {
  AERODROME_NETWORK_ID,
  AERODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateRevenue/protocols/aerodrome/constants'
import { ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'

export async function filter(event: ReferralEvent): Promise<boolean> {
  const client = getHyperSyncClient(AERODROME_NETWORK_ID)
  const query = {
    transactions: [
      { to: [AERODROME_UNIVERSAL_ROUTER_ADDRESS], from: [event.userAddress] },
    ],
    fieldSelection: { block: [BlockField.Number] },
    fromBlock: 0,
  }

  let hasTransactionsOnlyAfterEvent = false

  await paginateQuery(client, query, async (response) => {
    for (const block of response.data.blocks) {
      if (block.number) {
        const blockData = await getBlock(
          AERODROME_NETWORK_ID,
          BigInt(block.number),
        )

        hasTransactionsOnlyAfterEvent =
          blockData.timestamp >= BigInt(event.timestamp)
        return true // Return from callback and stop further pagination
      }
    }
  })

  return hasTransactionsOnlyAfterEvent
}
