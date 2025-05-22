import nock from 'nock'
import { generateSignature, getFonbnkAssets, getPayoutWallets } from './helpers'
import { FONBNK_API_URL } from './constants'
import { FonbnkAsset, FonbnkPayoutWalletReponse } from './types'
import { Address } from 'viem'

describe('getFonbnkAssets', () => {
  it('should return fonbnk assets when queried', async () => {
    process.env.FONBNK_CLIENT_ID = 'test-client-id'
    process.env.FONBNK_CLIENT_SECRET = 'test-client-secret'
    const mockFonbnkAssets: FonbnkAsset[] = [
      { network: 'CELO', asset: 'CUSD' },
      { network: 'ETHEREUM', asset: 'USDC' },
    ]
    nock(FONBNK_API_URL)
      .get(`/api/pay-widget-merchant/assets`)
      .reply(200, mockFonbnkAssets)

    const expectedAssets = await getFonbnkAssets()

    expect(mockFonbnkAssets).toEqual(expectedAssets)
  })
})

describe('getPayoutWallets', () => {
  it('should return fonbnk payout wallets for a given asset when queried', async () => {
    process.env.FONBNK_CLIENT_ID = 'test-client-id'
    process.env.FONBNK_CLIENT_SECRET = 'test-client-secret'
    const expectedWallets: Address[] = ['0x123', '0x456']
    const mockResponse: FonbnkPayoutWalletReponse = { wallets: expectedWallets }
    nock(FONBNK_API_URL)
      .get(`/api/util/payout-wallets`)
      .query({
        network: 'CELO',
        asset: 'USDC',
      })
      .reply(200, mockResponse)

    const receivedWallets = await getPayoutWallets({
      fonbnkNetwork: 'CELO',
      asset: 'USDC',
    })

    expect(expectedWallets).toEqual(receivedWallets)
  })
})

describe('generateSignature', () => {
  it('correctly generates signature', async () => {
    const clientSecret = '1A2B3C4D5E6F7G8H'
    const timestamp = '12345678'
    const endpoint = '/api/util/payout-wallets?network=CELO&asset=USDC'

    const expectedSignature = 'XxL0XlSqT+csoPClf6iIXf9Lu1YWARyNEqlauaKutJE='
    const signature = await generateSignature(clientSecret, timestamp, endpoint)

    expect(signature).toEqual(expectedSignature)
  })
})
