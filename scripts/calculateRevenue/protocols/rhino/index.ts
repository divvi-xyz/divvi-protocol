import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  NETWORK_ID_TO_BRIDGE_CONTRACT_ADDRESS,
  NATIVE_TOKEN_DECIMALS,
  BRIDGED_WITHDRAWAL_TOPIC,
} from './constants'
import { getTokenHistoricalPrice } from '../utils/getHistoricalTokenPrice'
import { NetworkId } from '../../../types'
import { BridgeTransaction } from './types'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { Address, decodeEventLog, Hex, isAddress, zeroAddress } from 'viem'
import { getBlockRange } from '../utils/events'
import BigNumber from 'bignumber.js'
import { rhinoFiBridgeAbi } from '../../../abis/RhinoFiBridge'

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
  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
  })
  const query = {
    logs: [
      { address: [contractAddress], topics: [[BRIDGED_WITHDRAWAL_TOPIC]] },
    ],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Data, LogField.Topic0],
    },
    fromBlock: startBlock,
    toBlock: endBlockExclusive,
  }

  const bridges: BridgeTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const bridge of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (bridge.blockNumber && bridge.data) {
        const { args } = decodeEventLog({
          abi: rhinoFiBridgeAbi,
          eventName: 'BridgedWithdrawal',
          topics: bridge.topics as [],
          data: bridge.data as Hex,
        })
        // Check that the bridge is from the provided address (first block of data is sender)
        if (args.user.toLowerCase() === address.toLowerCase()) {
          const block = await getBlock(networkId, BigInt(bridge.blockNumber))
          const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
          bridges.push({
            amount: args.amount,
            tokenAddress: args.token.toLowerCase() as Address,
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
}: {
  userBridges: BridgeTransaction[]
  networkId: NetworkId
}): Promise<number> {
  if (userBridges.length === 0) {
    return 0
  }

  let totalUsdContribution = new BigNumber(0)

  // For each bridge compute the USD contribution and add to the total
  for (const bridge of userBridges) {
    // Rhino.fi uses 0 address for native https://github.com/rhinofi/contracts_public/blob/master/bridge-deposit/DVFDepositContract.sol#L176-L182
    const isNative = bridge.tokenAddress === zeroAddress
    const tokenContract = isNative
      ? undefined
      : await getErc20Contract(bridge.tokenAddress, networkId)
    const tokenDecimals = tokenContract
      ? BigInt(await tokenContract.read.decimals())
      : NATIVE_TOKEN_DECIMALS
    try {
      const tokenPriceUsd = await getTokenHistoricalPrice({
        networkId,
        address: isNative ? undefined : bridge.tokenAddress,
        timestamp: bridge.timestamp,
      })
      const partialUsdContribution = new BigNumber(bridge.amount)
        .times(tokenPriceUsd)
        .dividedBy(10n ** tokenDecimals)
      totalUsdContribution = totalUsdContribution.plus(partialUsdContribution)
    } catch (error) {
      console.error(
        `Error fetching token price for ${networkId}:${isNative ? 'native' : bridge.tokenAddress} at ${bridge.timestamp}:`,
        error,
      )
    }
  }

  return totalUsdContribution.toNumber()
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

  const totalRevenueUsd = (
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
        })
        return revenue
      }),
    )
  ).reduce((acc, curr) => acc + curr, 0) // Then sum across all networks

  return totalRevenueUsd
}
