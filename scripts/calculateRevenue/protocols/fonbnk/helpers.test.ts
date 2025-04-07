import { generateSignature } from './helpers'

describe('getFonbnkAssets', () => {})

describe('getPayoutWallets', () => {})

describe('generateSignature', () => {
  it('correctly generates signature', async () => {
    const clientSecret = '1A2B3C4D5E6F7G8H'
    const timestamp = '12345678'
    const endpoint = '/api/util/payout-wallets?network=CELO&asset=USDC'

    const expectedSignature = '3ab1fUyn6I8o6Yn1kbsmGPumHEwFwfvWFOAHaI65YlQ='
    const signature = await generateSignature(clientSecret, timestamp, endpoint)

    expect(signature).toEqual(expectedSignature)
  })
})
