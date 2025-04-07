import { LogField, Query, QueryResponse } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  FonbnkNetwork,
  fonbnkNetworkToNetworkId,
  TRANSACTION_VOLUME_USD_PRECISION,
  TRANSFER_TOPIC,
} from './constants'
import { getFonbnkAssets, getPayoutWallets } from './helpers'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { NetworkId } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { FonbnkTransaction } from './types'
import { Address, fromHex, isAddress, pad } from 'viem'

async function getUserTransactions({
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
  client: { get: (query: Query) => Promise<QueryResponse> }
  networkId: NetworkId
}): Promise<FonbnkTransaction[]> {
  const query = {
    logs: [{ topics: [[TRANSFER_TOPIC], [pad(payoutWallet)], [pad(address)]] }],
    transactions: [{ from: [payoutWallet] }],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Address, LogField.Data],
    },
    fromBlock: 0,
  }
  let transactions: FonbnkTransaction[] = []
  await paginateQuery(client, query, async (response) => {
    for (const transaction of response.data.logs) {
      if (transaction.blockNumber && transaction.data && transaction.address) {
        const block = await getBlock(networkId, BigInt(transaction.blockNumber))
        const blockTimestampDate = new Date(Number(block.timestamp) * 1000)
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
      }
    }
  })
  return transactions
}

async function getTotalRevenueUsdFromTransactions({
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
  const tokenId = `${networkId}:${transactions[0].tokenAddress}`
  const tokenContract = await getErc20Contract(
    transactions[0].tokenAddress,
    networkId,
  )
  const tokenDecimals = BigInt(await tokenContract.read.decimals())
  const tokenPrices = await fetchTokenPrices({
    tokenId,
    startTimestamp,
    endTimestamp,
  })
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
  for (const supportedNetwork of Object.values(FonbnkNetwork)) {
    let checkedAddresses = new Set<Address>()
    const client = getHyperSyncClient(
      fonbnkNetworkToNetworkId[supportedNetwork],
    )
    const networkAssets = fonbnkAssets
      .filter((asset) => asset.network === supportedNetwork)
      .map((asset) => asset.asset)
    for (const asset of networkAssets) {
      const payoutWallets = await getPayoutWallets({
        fonbnkNetwork: supportedNetwork,
        currency: asset,
      })
      for (const payoutWallet of payoutWallets) {
        if (!checkedAddresses.has(payoutWallet)) {
          checkedAddresses.add(payoutWallet)
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
    }
  }
  return totalRevenue
}
