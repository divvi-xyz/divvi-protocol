import { TokenPriceData } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getSwapEvents } from './getSwapEvents'
import { calculateSwapRevenue, calculateRevenue } from './index'
import { SwapEvent } from './types'

jest.mock('../utils/tokenPrices')
jest.mock('./getSwapEvents')

const mockTokenPrices: TokenPriceData[] = [
  {
    priceUsd: '3',
    priceFetchedAt: new Date('2025-01-01T20:29:55.868Z').getTime(), // Just before the first swap
  },
  {
    priceUsd: '5',
    priceFetchedAt: new Date('2025-01-02T20:29:55.868Z').getTime(), // Just before the second swap
  },
]

const mockSwapEvents: SwapEvent[] = [
  {
    timestamp: new Date('2025-01-01T22:29:55.868Z'),
    amountInToken: BigInt(200000000),
    tokenDecimals: BigInt(8),
    tokenId: 'mockTokenId',
  },
  {
    timestamp: new Date('2025-01-02T22:29:55.868Z'),
    amountInToken: BigInt(300000000),
    tokenDecimals: BigInt(8),
    tokenId: 'mockTokenId',
  },
]

describe('Aerodrome revenue calculation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('calculateSwapRevenue', () => {
    it('should return correct calculation', async () => {
      jest.mocked(fetchTokenPrices).mockResolvedValue(mockTokenPrices)
      const result = await calculateSwapRevenue(mockSwapEvents)
      expect(result).toEqual(21)
    })
  })

  describe('calculateRevenue', () => {
    // Same as above because only one liquidity pool supported, as more are
    // supported this test can be extended.
    it('should return correct calculation', async () => {
      jest.mocked(fetchTokenPrices).mockResolvedValue(mockTokenPrices)
      jest.mocked(getSwapEvents).mockResolvedValue(mockSwapEvents)
      const result = await calculateRevenue({
        address: 'mockAddress',
        startTimestamp: new Date(),
        endTimestamp: new Date(),
      })
      expect(getSwapEvents).toHaveBeenCalledTimes(1)
      expect(result).toEqual(21)
    })
  })
})
