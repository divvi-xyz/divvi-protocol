import crypto from 'crypto'
import { FONBNK_API_URL } from './constants'
import { FonbnkAsset, FonbnkNetwork, FonbnkPayoutWalletReponse } from './types'
import { Address } from 'viem'
import { fetchWithBackoff } from '../../../utils/fetchWithBackoff'

function getFonbnkConfig() {
  if (!process.env.FONBNK_CLIENT_ID) {
    throw new Error('FONBNK_CLIENT_ID is not set')
  }
  if (!process.env.FONBNK_CLIENT_SECRET) {
    throw new Error('FONBNK_CLIENT_SECRET is not set')
  }
  return {
    clientId: process.env.FONBNK_CLIENT_ID,
    clientSecret: process.env.FONBNK_CLIENT_SECRET,
  }
}

export async function getFonbnkAssets(): Promise<FonbnkAsset[]> {
  const { clientId, clientSecret } = getFonbnkConfig()

  const url = `${FONBNK_API_URL}/api/pay-widget-merchant/assets`
  const timestamp = String(Date.now())
  const signature = await generateSignature(
    clientSecret,
    timestamp,
    '/api/pay-widget-merchant/assets',
  )
  const requestOptions = {
    method: 'GET',
    headers: {
      'x-client-id': clientId,
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
  asset,
}: {
  fonbnkNetwork: FonbnkNetwork
  asset: string
}): Promise<Address[]> {
  const { clientId, clientSecret } = getFonbnkConfig()

  const url = `${FONBNK_API_URL}/api/util/payout-wallets?network=${fonbnkNetwork}&asset=${asset}`
  const timestamp = String(Date.now())
  const signature = await generateSignature(
    clientSecret,
    timestamp,
    `/api/util/payout-wallets?network=${fonbnkNetwork}&asset=${asset}`,
  )
  const requestOptions = {
    method: 'GET',
    headers: {
      'x-client-id': clientId,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  }

  const response = await fetchWithBackoff(url, requestOptions)

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    throw new Error(
      `Error fetching fonbnk payout wallets (${url}) with status ${response.status}: ${response.statusText}`,
    )
  }

  const data: FonbnkPayoutWalletReponse = await response.json()
  return data.wallets
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
