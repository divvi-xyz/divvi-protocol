import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  BRIDGED_DEPOSIT_WITH_ID_TOPIC,
  NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  BRIDGE_VOLUME_USD_PRECISION,
  NATIVE_TOKEN_DECIMALS,
} from './constants'
import { NetworkId } from '../../../types'
import { BridgeTransaction } from './types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { Address, fromHex, isAddress, zeroAddress } from 'viem'
import { getFirstBlockAtOrAfterTimestamp } from '../utils/events'

export async function getUserBridges({
  address,
  contractAddress,
  startTimestamp,
  endTimestampExclusive,
  client,
  networkId,
}: {
  address: Address
  contractAddress: Address
  startTimestamp: Date
  endTimestampExclusive: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<BridgeTransaction[]> {
  const fromBlock = await getFirstBlockAtOrAfterTimestamp(
    networkId,
    startTimestamp,
  )
  const toBlock = await getFirstBlockAtOrAfterTimestamp(
    networkId,
    endTimestampExclusive,
  )
  const query = {
    logs: [
      { address: [contractAddress], topics: [[BRIDGED_DEPOSIT_WITH_ID_TOPIC]] },
    ],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Data],
    },
    fromBlock,
    toBlock,
  }

  const bridges: BridgeTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const bridge of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (bridge.blockNumber && bridge.data) {
        const hexData = bridge.data.startsWith('0x')
          ? bridge.data.slice(2)
          : bridge.data
        // Check that the bridge is from the provided address (first block of data is sender)
        if (
          `0x${hexData.slice(24, 64)}`.toLowerCase() === address.toLowerCase()
        ) {
          const block = await getBlock(networkId, BigInt(bridge.blockNumber))
          const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
          bridges.push({
            amount: fromHex(`0x${hexData.slice(192, 256)}`, 'bigint'), // Amount is 4th block of 32 bytes
            tokenAddress: `0x${hexData.slice(152, 192)}`, // Token address is 3rd block of 32 bytes, skip first 12 to get 20 byte address
            timestamp: blockTimestampDate,
          })
        }
      } else {
        console.log(
          `Rhino bridge transaction missing required field, blockNumber: ${bridge.blockNumber}, data: ${bridge.data}`,
        )
      }
    }
  })
  return bridges
}

export async function getTotalRevenueUsdFromBridges({
  userBridges,
  networkId,
  startTimestamp,
  endTimestampExclusive,
}: {
  userBridges: BridgeTransaction[]
  networkId: NetworkId
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  if (userBridges.length === 0) {
    return 0
  }

  let totalUsdContribution = 0

  // For each bridge compute the USD contribution and add to the total
  for (const bridge of userBridges) {
    // Get the token decimals
    const isNative = bridge.tokenAddress === zeroAddress
    const tokenId = `${networkId}:${isNative ? 'native' : bridge.tokenAddress}`
    const tokenContract = isNative
      ? undefined
      : await getErc20Contract(bridge.tokenAddress, networkId)
    const tokenDecimals = tokenContract
      ? BigInt(await tokenContract.read.decimals())
      : NATIVE_TOKEN_DECIMALS

    try {
      // Get the historical token prices
      const tokenPrices = await fetchTokenPrices({
        tokenId,
        startTimestamp,
        endTimestampExclusive: endTimestampExclusive,
      })
      const tokenPriceUsd = getTokenPrice(tokenPrices, bridge.timestamp)
      const partialUsdContribution =
        Number(
          (bridge.amount *
            BigInt(tokenPriceUsd * 10 ** BRIDGE_VOLUME_USD_PRECISION)) /
            10n ** tokenDecimals,
        ) /
        10 ** BRIDGE_VOLUME_USD_PRECISION
      totalUsdContribution += partialUsdContribution
    } catch (error) {
      console.error(
        `Error fetching token prices for ${tokenId} at ${bridge.timestamp}:`,
        error,
      )
    }
  }

  return totalUsdContribution
}

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }

  const totalRevenue = (
    await Promise.all(
      (
        Object.entries(NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS) as [
          NetworkId,
          Address,
        ][]
      ).map(async ([networkId, contractAddress]) => {
        // For each supported network, get all user bridges in the time window and convert amount to USD
        const userBridges = await getUserBridges({
          address,
          contractAddress,
          startTimestamp,
          endTimestampExclusive,
          client: getHyperSyncClient(networkId),
          networkId: networkId,
        })
        const revenue = await getTotalRevenueUsdFromBridges({
          userBridges,
          networkId: networkId,
          startTimestamp,
          endTimestampExclusive,
        })
        return revenue
      }),
    )
  ).reduce((acc, curr) => acc + curr, 0) // Then sum across all networks

  return totalRevenue
}
