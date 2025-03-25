import { BlockField, QueryResponse } from '@envio-dev/hypersync-client'
import { ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import {
  AERODROME_NETWORK_ID,
  AERODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateRevenue/protocols/aerodrome/constants'

export async function filter(event: ReferralEvent): Promise<boolean> {
  const client = getHyperSyncClient(AERODROME_NETWORK_ID)
  const query = {
    transactions: [
      { to: [AERODROME_UNIVERSAL_ROUTER_ADDRESS], from: [event.userAddress] },
    ],
    fieldSelection: {
      block: [BlockField.Number],
    },
    fromBlock: 0,
  }

  let hasMoreBlocks = true

  while (hasMoreBlocks) {
    const response: QueryResponse = await client.get(query)
    if (response.nextBlock === query.fromBlock) {
      hasMoreBlocks = false
    } else {
      query.fromBlock = response.nextBlock
    }

    for (const block of response.data.blocks) {
      if (block.number) {
        const blockData = await getBlock(
          AERODROME_NETWORK_ID,
          BigInt(block.number),
        )
        if (blockData.timestamp < BigInt(event.timestamp)) {
          return false // disqualify immediately if any tx is too early
        } else {
          return true // blocks are returned oldest first - qualify immediately if the block timestamp is after the event timestamp
        }
      }
    }
  }

  return false
}
