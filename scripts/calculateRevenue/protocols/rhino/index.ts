import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  BRIDGED_DEPOSIT_WITH_ID_TOPIC,
  NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  TRANSACTION_VOLUME_USD_PRECISION,
} from './constants'
import { NetworkId } from '../../../types'
import { BridgeTransaction } from './types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { fromHex } from 'viem'

async function getUserBridges({
  address,
  startTimestamp,
  endTimestamp,
  client,
  networkId,
}: {
  address: string
  contractAddress: string
  startTimestamp: Date
  endTimestamp: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<BridgeTransaction[]> {
  const query = {
    logs: [{ topics: [[BRIDGED_DEPOSIT_WITH_ID_TOPIC]]}],
    transactions: [{ from: [address] }],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Data],
    },
    fromBlock: 0,
  }

  const transactions: BridgeTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const transaction of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (transaction.blockNumber && transaction.data) {
        const block = await getBlock(networkId, BigInt(transaction.blockNumber))
        const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
        // And that the transfer happened within the time window
        if (
          blockTimestampDate >= startTimestamp &&
          blockTimestampDate <= endTimestamp
        ) {
          transactions.push({
            amount: fromHex(`0x${transaction.data.slice(192, 256)}`, 'bigint'),
            tokenAddress: `0x${transaction.data.slice(152, 192)}`,
            timestamp: blockTimestampDate,
          })
        }
      } else {
        console.log('error message')
      }
    }
  })
  return transactions
}

export async function getTotalRevenueUsdFromTransactions({
  userBridges,
  networkId,
  startTimestamp,
  endTimestamp,
}: {
  userBridges: BridgeTransaction[]
  networkId: NetworkId
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  if (userBridges.length === 0) {
    return 0
  }

  let totalUsdContribution = 0

  // Get the token decimals
  const tokenId = `${networkId}:${userBridges[0].tokenAddress}` // TODO: If this is all 0 make it native token
  const tokenContract = await getErc20Contract(
    userBridges[0].tokenAddress,
    networkId,
  )
  const tokenDecimals = BigInt(await tokenContract.read.decimals())

  // Get the historical token prices
  const tokenPrices = await fetchTokenPrices({
    tokenId,
    startTimestamp,
    endTimestamp,
  })

  // For each transaction compute the USD contribution and add to the total
  for (const transaction of userBridges) {
    const tokenPriceUsd = getTokenPrice(
      tokenPrices,
      new Date(transaction.timestamp),
    )
    const partialUsdContribution =
      Number(
        (transaction.amount *
          BigInt(tokenPriceUsd * 10 ** TRANSACTION_VOLUME_USD_PRECISION)) /
          10n ** tokenDecimals,
      ) /
      10 ** TRANSACTION_VOLUME_USD_PRECISION
    totalUsdContribution += partialUsdContribution
  }

  return totalUsdContribution
}

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  let totalRevenue = 0
  // Use hypersync to get all of the relevant events
  for (const [networkId, contractAddress] of Object.entries(
    NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  ) as [NetworkId, string][]) {
    const client = getHyperSyncClient(networkId)
    const userBridges = await getUserBridges({
      address,
      contractAddress,
      startTimestamp,
      endTimestamp,
      client,
      networkId,
    })
    const revenue = await getTotalRevenueUsdFromTransactions({
      userBridges,
      networkId,
      startTimestamp,
      endTimestamp,
    })
    totalRevenue += revenue
  }
  return totalRevenue
}
