import crypto from 'crypto'
import { fetchWithBackoff } from '../../../protocolFilters/beefy'
import { FONBNK_API_URL, FONBNK_CLIENT_ID, FonbnkNetwork } from './constants'
import { FonbnkAsset } from './types'

export async function fetchFonbnkAssets(): Promise<FonbnkAsset[]> {
  if (!process.env.FONBNK_CLIENT_SECRET) {
    throw new Error('FONBNK_CLIENT_SECRET is not set')
  }
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

export async function getPayoutWallets({
  fonbnkNetwork,
  currency,
}: {
  fonbnkNetwork: FonbnkNetwork
  currency: string
}): Promise<string[]> {
  if (!process.env.FONBNK_CLIENT_SECRET) {
    throw new Error('FONBNK_CLIENT_SECRET is not set')
  }
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

export async function generateSignature(
  clientSecret: string,
  timestamp: string,
  endpoint: string,
) {
  const hmac = crypto.createHmac('sha256', Buffer.from(clientSecret, 'base64'))
  const stringToSign = `${timestamp}:${endpoint}`
  hmac.update(stringToSign)
  return hmac.digest('base64')
}
