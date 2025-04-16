import { HypersyncClient, LogField } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  fonbnkNetworkToNetworkId,
  TRANSACTION_VOLUME_USD_PRECISION,
  TRANSFER_TOPIC,
} from './constants'
import { getFonbnkAssets, getPayoutWallets } from './helpers'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { NetworkId } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { FonbnkTransaction, SUPPORTED_FONBNK_NETWORKS } from './types'
import { Address, fromHex, isAddress, pad } from 'viem'

export async function getUserTransactions({
  address,
  payoutWallet,
  startTimestamp,
  endTimestamp,
  client,
  networkId,
}: {
  address: Address
  payoutWallet: Address
  startTimestamp: Date
  endTimestamp: Date
  client: HypersyncClient
  networkId: NetworkId
}): Promise<FonbnkTransaction[]> {
  // Query for all transfers from the payout wallet to the user
  const query = {
    logs: [{ topics: [[TRANSFER_TOPIC], [pad(payoutWallet)], [pad(address)]] }],
    transactions: [{ from: [payoutWallet] }],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Address, LogField.Data],
    },
    fromBlock: 0,
  }

  const transactions: FonbnkTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const transaction of response.data.logs) {
      // Check that the logs contain all necessary fields
      if (transaction.blockNumber && transaction.data && transaction.address) {
        const block = await getBlock(networkId, BigInt(transaction.blockNumber))
        const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
        // And that the transfer happened within the time window
        if (
          blockTimestampDate >= startTimestamp &&
          blockTimestampDate <= endTimestamp
        ) {
          transactions.push({
            amount: fromHex(transaction.data as Address, 'bigint'),
            tokenAddress: transaction.address as Address,
            timestamp: blockTimestampDate,
          })
        }
      } else {
        console.log(
          `Fonbnk transfer transaction missing one of the required fields. blockNumber: ${transaction.blockNumber}, data: ${transaction.data}, address: ${transaction.address}`,
        )
      }
    }
  })
  return transactions
}

export async function getTotalRevenueUsdFromTransactions({
  transactions,
  networkId,
  startTimestamp,
  endTimestamp,
}: {
  transactions: FonbnkTransaction[]
  networkId: NetworkId
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  if (transactions.length === 0) {
    return 0
  }

  let totalUsdContribution = 0

  // Get the token decimals
  const tokenId = `${networkId}:${transactions[0].tokenAddress}`
  const tokenContract = await getErc20Contract(
    transactions[0].tokenAddress,
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
  for (const transaction of transactions) {
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
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }

  let totalRevenue = 0
  const fonbnkAssets = await getFonbnkAssets()

  // For each network, create a new hypersync client and get all of the unique payout wallets
  for (const supportedNetwork of SUPPORTED_FONBNK_NETWORKS) {
    const client = getHyperSyncClient(
      fonbnkNetworkToNetworkId[supportedNetwork],
    )
    const networkAssets = fonbnkAssets
      .filter((asset) => asset.network === supportedNetwork)
      .map((asset) => asset.asset)
    const payoutWallets = await Promise.all(
      networkAssets.map((asset) =>
        getPayoutWallets({ fonbnkNetwork: supportedNetwork, asset }),
      ),
    )
    const uniquePayoutWallets = new Set(payoutWallets.flat())

    // For each payout wallet, get all of the transactions and calculate the total revenue from the user
    for (const payoutWallet of uniquePayoutWallets) {
      const transactions = await getUserTransactions({
        address,
        payoutWallet,
        startTimestamp,
        endTimestamp,
        client,
        networkId: fonbnkNetworkToNetworkId[supportedNetwork],
      })
      const revenue = await getTotalRevenueUsdFromTransactions({
        transactions,
        networkId: fonbnkNetworkToNetworkId[supportedNetwork],
        startTimestamp,
        endTimestamp,
      })
      totalRevenue += revenue
    }
  }
  return totalRevenue
}
