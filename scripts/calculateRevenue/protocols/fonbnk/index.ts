import { BlockField, Query, QueryResponse } from '@envio-dev/hypersync-client'
import { getErc20Contract, getHyperSyncClient } from '../../../utils'
import {
  FONBNK_API_URL,
  FONBNK_CLIENT_ID,
  FonbnkNetwork,
  fonbnkNetworkToNetworkId,
  TRANSACTION_VOLUME_USD_PRECISION,
} from './constants'
import { fetchWithBackoff } from '../../../protocolFilters/beefy'
import { generateSignature } from './helpers'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { NetworkId } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getTokenPrice } from '../beefy'
import { Address } from 'viem'

interface FonbnkAsset {
  network: FonbnkNetwork
  asset: string
}

interface FonbnkTransaction {
  amount: bigint
  tokenAddress: Address
  timestamp: Date
}

async function fetchFonbnkAssets(): Promise<FonbnkAsset[]> {
  const url = `${FONBNK_API_URL}/api/pay-widget-merchant/assets`
  const timestamp = String(Date.now())
  const signature = await generateSignature(
    process.env.FONBNK_CLIENT_SECRET,
    timestamp,
    '/api/pay-widget-merchant/assets',
  )
  const requestOptions = {
    method: 'GET',
    headers: {
      'x-client-id': FONBNK_CLIENT_ID,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  }

  const response = await fetchWithBackoff(url, requestOptions)

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    throw new Error(`Error fetching fonbnk assets: ${response.statusText}`)
  }

  const data: FonbnkAsset[] = await response.json()
  return data
}

async function getPayoutWallets({
  fonbnkNetwork,
  currency,
}: {
  fonbnkNetwork: FonbnkNetwork
  currency: string
}): Promise<string[]> {
  const url = `${FONBNK_API_URL}/api/util/payout-wallets?network=${fonbnkNetwork}&asset=${currency}`
  const timestamp = String(Date.now())
  const signature = await generateSignature(
    process.env.FONBNK_CLIENT_SECRET,
    timestamp,
    '/api/util/payout-wallets?network=${fonbnkNetwork}&asset=${currency}',
  )
  const requestOptions = {
    method: 'GET',
    headers: {
      'x-client-id': FONBNK_CLIENT_ID,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  }

  const response = await fetchWithBackoff(url, requestOptions)

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    throw new Error(`Error fetching fonbnk assets: ${response.statusText}`)
  }
  const data: string[] = await response.json()
  return data
}

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
  endTimestamp
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
  const tokenContract = await getErc20Contract(transactions[0].tokenAddress, networkId)
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
