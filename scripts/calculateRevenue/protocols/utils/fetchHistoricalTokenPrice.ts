import { Address } from 'viem'
import { NetworkId } from '../../../types'
import memoize from '@github/memoize'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'

const COIN_GECKO_BASE_URL = 'https://pro-api.coingecko.com'

const NETWORK_ID_TO_COINGECKO_PLATFORM_ID: Partial<{
  [networkId in NetworkId]: string // eslint-disable-line @typescript-eslint/no-unused-vars
}> = {
  [NetworkId['ethereum-mainnet']]: 'ethereum',
  [NetworkId['arbitrum-one']]: 'arbitrum-one',
  [NetworkId['op-mainnet']]: 'optimistic-ethereum',
  [NetworkId['celo-mainnet']]: 'celo',
  [NetworkId['polygon-pos-mainnet']]: 'polygon-pos',
  [NetworkId['base-mainnet']]: 'base',
}

const NETWORK_ID_TO_NATIVE_TOKEN_ID: Partial<{
  [networkId in NetworkId]: string // eslint-disable-line @typescript-eslint/no-unused-vars
}> = {
  [NetworkId['ethereum-mainnet']]: 'ethereum',
  [NetworkId['arbitrum-one']]: 'ethereum',
  [NetworkId['op-mainnet']]: 'ethereum',
  [NetworkId['celo-mainnet']]: 'celo',
  [NetworkId['polygon-pos-mainnet']]: 'matic-network',
  [NetworkId['base-mainnet']]: 'ethereum',
}

async function _getCoingeckoCoinId({
  networkId,
  address,
}: {
  networkId: NetworkId
  address: Address
}): Promise<string> {
  const platformId = NETWORK_ID_TO_COINGECKO_PLATFORM_ID[networkId]
  const url = `${COIN_GECKO_BASE_URL}/api/v3/coins/${platformId}/contract/${address}`
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-cg-pro-api-key': process.env.COIN_GECKO_API_KEY || '',
    },
  }
  const response = await fetchWithTimeout(url, options)
  if (!response.ok) {
    throw new Error(`Error while fetching token price history: ${response}`)
  }
  const data: { id: string } = await response.json()
  return data.id
}

async function _getTokenHistoricalPrice({
  networkId,
  address,
  timestamp,
}: {
  networkId: NetworkId
  address?: Address
  timestamp: Date
}): Promise<number> {
  // For API need to format date as dd-mm-yyyy
  const dateString = `${String(timestamp.getDate()).padStart(2, '0')}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${timestamp.getFullYear()}`
  const coinId = address
    ? await _getCoingeckoCoinId({ networkId, address })
    : NETWORK_ID_TO_NATIVE_TOKEN_ID[networkId]
  const url = `${COIN_GECKO_BASE_URL}/api/v3/coins/${coinId}/history?date=${dateString}&localization=false`
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-cg-pro-api-key': process.env.COIN_GECKO_API_KEY || '',
    },
  }
  console.log('url:', url)
  const response = await fetchWithTimeout(url, options)
  if (!response.ok) {
    throw new Error(`Error while fetching token price history: ${response}`)
  }
  const data: { market_data: { current_price: { usd: number } } } =
    await response.json()
  return data.market_data.current_price.usd
}

export const getTokenHistoricalPrice = memoize(_getTokenHistoricalPrice, {
  hash: (...params: Parameters<typeof _getTokenHistoricalPrice>) =>
    Object.values(params[0]).join(','),
})
