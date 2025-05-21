import nock from 'nock'
import { getVaults } from './getVaults'
import { NetworkId } from '../../../types'

describe('getVaults', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  const mockApiResponse = {
    Response: {
      '0x02b0Ad08BFc8D0cC3E0e5907D95898C4Ef464F9C-arbitrum': 100,
      '0x0274a704a6D9129F90A62dDC6f6024b33EcDad36-optimism': 200,
      '0x0274a704a6D9129F90A62dDC6f6024b33EcDad36-scroll': 300,
      '0x0274a704a6D9129F90A62dDC6f6024b33EcDad36': 400,
      'invalidAddress-optimism': 500,
      'invalid-address': 600,
    },
  }

  it('should fetch vaults and extract valid vault addresses', async () => {
    nock('https://api.sommelier.finance')
      .get('/tvl')
      .reply(200, mockApiResponse)

    const result = await getVaults()
    expect(result).toEqual([
      {
        networkId: NetworkId['arbitrum-one'],
        vaultAddress: '0x02b0Ad08BFc8D0cC3E0e5907D95898C4Ef464F9C',
      },
      {
        networkId: NetworkId['op-mainnet'],
        vaultAddress: '0x0274a704a6D9129F90A62dDC6f6024b33EcDad36',
      },
      {
        networkId: NetworkId['ethereum-mainnet'],
        vaultAddress: '0x0274a704a6D9129F90A62dDC6f6024b33EcDad36',
      },
    ])
  })

  it('should throw an error when API fetch fails', async () => {
    nock('https://api.sommelier.finance')
      .get('/tvl')
      .replyWithError('API error')

    await expect(getVaults()).rejects.toThrow('API error')
  })
})
