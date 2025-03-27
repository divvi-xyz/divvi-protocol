import { erc20Abi } from 'viem'
import { TokenPriceData } from '../../../types'
import { getViemPublicClient } from '../../../utils'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getAerodromeLiquidityPoolContract } from '../utils/viem'
import { getSwapEvents } from './getSwapEvents'
import { calculateSwapRevenue, calculateRevenue } from './index'
import { SwapEvent } from './types'

jest.mock('../utils/tokenPrices')
jest.mock('./getSwapEvents')
jest.mock('../utils/viem')
jest.mock('../../../utils')

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
const mockTokenPricesOther: TokenPriceData[] = [
  {
    priceUsd: '2',
    priceFetchedAt: new Date('2025-01-01T20:29:55.868Z').getTime(), // Just before the first swap
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

const mockSwapEventsOther: SwapEvent[] = [
  {
    timestamp: new Date('2025-01-01T22:29:55.868Z'),
    amountInToken: BigInt(4000000000000000000),
    tokenDecimals: BigInt(18),
    tokenId: 'mockTokenId',
  },
]

const MOCK_FEE = 10000 // 1% fee

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
      jest
        .mocked(fetchTokenPrices)
        .mockResolvedValue(mockTokenPricesOther)
        .mockResolvedValueOnce(mockTokenPrices)
      jest
        .mocked(getSwapEvents)
        .mockResolvedValue(mockSwapEventsOther)
        .mockResolvedValueOnce(mockSwapEvents)
      jest.mocked(getAerodromeLiquidityPoolContract).mockResolvedValue({
        abi: erc20Abi,
        address: '0x123',
      } as unknown as ReturnType<typeof getAerodromeLiquidityPoolContract>)
      const mockGetBlock = jest
        .fn()
        .mockImplementation(({ blockNumber }: { blockNumber: bigint }) => {
          return {
            timestamp: blockNumber * 100n,
          }
        })
      jest.mocked(getViemPublicClient).mockReturnValue({
        getBlock: mockGetBlock,
        readContract: jest.fn().mockResolvedValue(MOCK_FEE),
      } as unknown as ReturnType<typeof getViemPublicClient>)
      const result = await calculateRevenue({
        address: 'mockAddress',
        startTimestamp: new Date(),
        endTimestamp: new Date(),
      })
      expect(getSwapEvents).toHaveBeenCalledTimes(6)
      expect(result).toBeCloseTo(0.61)
    })
  })
})
