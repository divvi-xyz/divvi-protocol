import { TokenPriceData } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getSwapEvents } from './getSwapEvents'
import { calculateSwapRevenue, calculateRevenue, SwapEvent } from './index'

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
    amountInToken: 2,
    tokenId: 'mockTokenId',
  },
  {
    timestamp: new Date('2025-01-02T22:29:55.868Z'),
    amountInToken: 3,
    tokenId: 'mockTokenId',
  },
]

const mockMultipleLiquidityPoolAddresses = ['0x1', '0x2']
const mockSwapEventsSecondPool: SwapEvent[] = [
  {
    timestamp: new Date('2025-01-01T21:29:55.868Z'),
    amountInToken: 5,
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
    it('should return correct calculation', async () => {
      jest.mocked(fetchTokenPrices).mockResolvedValue(mockTokenPrices)
      jest
        .mocked(getSwapEvents)
        .mockResolvedValueOnce(mockSwapEvents)
        .mockResolvedValueOnce(mockSwapEventsSecondPool)
      jest.mock('./constants', () => ({
        ...jest.requireActual('./constants'),
        SUPPORTED_LIQUIDITY_POOL_ADDRESSES: mockMultipleLiquidityPoolAddresses,
      }))
      const result = await calculateRevenue({
        address: 'mockAddress',
        startTimestamp: new Date(),
        endTimestamp: new Date(),
      })
      expect(result).toEqual(36)
    })
  })
})
