import { BlockField, QueryResponse } from '@envio-dev/hypersync-client'
import { ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { AERODROME_NETWORK_ID } from '../calculateRevenue/protocols/aerodrome/constants'

const AERODROME_UNIVERSAL_ROUTER_ADDRESS =
  '0x6Cb442acF35158D5eDa88fe602221b67B400Be3E'

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
  let foundValidTransaction = false

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
          foundValidTransaction = true
        }
      }
    }
  }

  return foundValidTransaction
}
