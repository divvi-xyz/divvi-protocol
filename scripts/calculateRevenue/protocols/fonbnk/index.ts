import { BlockField, Query, QueryResponse } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  FonbnkNetwork,
  fonbnkNetworkToNetworkId,
  TRANSACTION_VOLUME_USD_PRECISION,
} from './constants'
import { fetchFonbnkAssets, getPayoutWallets } from './helpers'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { NetworkId } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { AERODROME_NETWORK_ID } from '../aerodrome/constants'
import { FonbnkTransaction } from './types'

async function getUserTransactions({
  address,
  payoutWallet,
  startTimestamp,
  endTimestamp,
  client,
}: {
  address: string
  payoutWallet: string
  startTimestamp: Date
  endTimestamp: Date
  client: { get: (query: Query) => Promise<QueryResponse> }
}): Promise<FonbnkTransaction[]> {
  const query = {
    transactions: [{ to: [payoutWallet], from: [address] }],
    fieldSelection: { block: [BlockField.Number] },
    fromBlock: 0,
  }
  let transactions: FonbnkTransaction[] = []
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
  let totalRevenue = 0
  const fonbnkAssets = await fetchFonbnkAssets()
  for (const supportedNetwork of Object.values(FonbnkNetwork)) {
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
        const transactions = await getUserTransactions({
          address,
          payoutWallet,
          startTimestamp,
          endTimestamp,
          client,
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
  return totalRevenue
}
