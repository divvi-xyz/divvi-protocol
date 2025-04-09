import memoize from '@github/memoize'
import { Address, decodeEventLog, Hex } from 'viem'
import { BlockField, LogField } from '@envio-dev/hypersync-client'
import { NetworkId } from '../../../../types'
import { getHyperSyncClient } from '../../../../utils'
import { paginateQuery } from '../../../../utils/hypersyncPagination'
import { poolConfiguratorAbi } from '../../../../abis/aave/poolConfigurator'
import { ReserveFactor } from '../types'

// Retrieves the history of reserve factor changes in a block range
export const getReserveFactorHistory = memoize(_getReserveFactorHistory, {
  hash: (...params: Parameters<typeof _getReserveFactorHistory>) =>
    JSON.stringify(params),
})

export async function _getReserveFactorHistory({
  networkId,
  poolConfiguratorAddress,
  startBlock,
  endBlock,
}: {
  networkId: NetworkId
  poolConfiguratorAddress: Address
  startBlock: number
  endBlock: number
}): Promise<Map<Address, ReserveFactor[]>> {
  const client = getHyperSyncClient(networkId)

  const query = {
    fromBlock: startBlock,
    toBlock: endBlock,
    logs: [
      {
        address: [poolConfiguratorAddress],
        topics: [
          [
            '0xb46e2b82b0c2cf3d7d9dece53635e165c53e0eaa7a44f904d61a2b7174826aef', // ReserveFactorChanged
          ],
        ],
      },
    ],
    fieldSelection: {
      block: [BlockField.Number, BlockField.Timestamp],
      log: [
        LogField.BlockNumber,
        LogField.Data,
        LogField.Topic0,
        LogField.Topic1,
      ],
    },
  }

  const result = new Map()

  await paginateQuery(client, query, async (response) => {
    if (response.data.logs.length === 0) {
      return
    }

    const blockTimestamps = new Map(
      response.data.blocks.map((block) => [block.number, block.timestamp]),
    )

    for (const log of response.data.logs) {
      const { args } = decodeEventLog({
        abi: poolConfiguratorAbi,
        eventName: 'ReserveFactorChanged',
        topics: log.topics as [],
        data: log.data as Hex,
      })

      const tokenAddress = args.asset.toLowerCase() as Address
      const timestamp = blockTimestamps.get(log.blockNumber)!

      const history = result.get(tokenAddress) ?? []
      history.push({
        reserveFactor: args.newReserveFactor,
        timestamp,
      })
      result.set(tokenAddress, history)
    }
  })

  return result
}
