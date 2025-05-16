import {
  HypersyncClient,
  LogField,
  TransactionField,
} from '@envio-dev/hypersync-client'
import {
  getBlock,
  getBlockNumber,
  getErc20Contract,
  getHyperSyncClient,
} from '../../../utils'
import {
  BRIDGED_DEPOSIT_WITH_ID_TOPIC,
  NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  BRIDGE_VOLUME_USD_PRECISION,
  ALL_ZEROES_ADDRESS,
  NATIVE_TOKEN_DECIMALS,
} from './constants'
import { NetworkId } from '../../../types'
import { BridgeTransaction } from './types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { Address, fromHex, isAddress } from 'viem'

async function getUserBridges({
  address,
  startTimestamp,
  endTimestamp,
  client,
  networkId,
}: {
  address: Address
  contractAddress: string
  startTimestamp: Date
  endTimestamp: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<BridgeTransaction[]> {
  const fromBlock = await getBlockNumber(
    networkId,
    startTimestamp.getTime() / 1000,
  )
  const query = {
    logs: [{ topics: [[BRIDGED_DEPOSIT_WITH_ID_TOPIC]] }],
    fieldSelection: {
      transactions: [TransactionField.From],
      log: [LogField.BlockNumber, LogField.Data],
    },
    fromBlock: fromBlock,
  }

  const transactions: BridgeTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const transaction of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (transaction.blockNumber && transaction.data) {
        // Check that the transaction is from the provided address (first block of data is sender)
        const hexData = transaction.data.startsWith('0x')
          ? transaction.data.slice(2)
          : transaction.data
        if (
          `0x${hexData.slice(24, 64)}`.toLowerCase() === address.toLowerCase()
        ) {
          const block = await getBlock(
            networkId,
            BigInt(transaction.blockNumber),
          )
          const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
          // And that the transfer happened within the time window
          if (
            blockTimestampDate >= startTimestamp &&
            blockTimestampDate <= endTimestamp
          ) {
            transactions.push({
              amount: fromHex(`0x${hexData.slice(192, 256)}`, 'bigint'), // Amount is 4th block of 64 digits
              tokenAddress: `0x${hexData.slice(152, 192)}`, // Token address is 3rd block of 64 digits, skip first 24 to get address
              timestamp: blockTimestampDate,
            })
          }
        }
      } else {
        console.log(
          `Rhino bridge transaction missing required field, blockNumber: ${transaction.blockNumber}, data: ${transaction.data}`,
        )
      }
    }
  })
  return transactions
}

export async function getTotalRevenueUsdFromBridges({
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

  // For each bridge compute the USD contribution and add to the total
  for (const bridge of userBridges) {
    // Get the token decimals
    const isNative = bridge.tokenAddress === ALL_ZEROES_ADDRESS
    const tokenId = `${networkId}:${isNative ? 'native' : bridge.tokenAddress}`
    const tokenContract = isNative
      ? undefined
      : await getErc20Contract(bridge.tokenAddress, networkId)
    const tokenDecimals = tokenContract
      ? BigInt(await tokenContract.read.decimals())
      : NATIVE_TOKEN_DECIMALS

    // Get the historical token prices
    const tokenPrices = await fetchTokenPrices({
      tokenId,
      startTimestamp,
      endTimestamp,
    })
    const tokenPriceUsd = getTokenPrice(tokenPrices, new Date(bridge.timestamp))
    const partialUsdContribution =
      Number(
        (bridge.amount *
          BigInt(tokenPriceUsd * 10 ** BRIDGE_VOLUME_USD_PRECISION)) /
          10n ** tokenDecimals,
      ) /
      10 ** BRIDGE_VOLUME_USD_PRECISION
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
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }
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
    const revenue = await getTotalRevenueUsdFromBridges({
      userBridges,
      networkId,
      startTimestamp,
      endTimestamp,
    })
    totalRevenue += revenue
  }
  return totalRevenue
}
