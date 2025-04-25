import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { NetworkId } from '../../../types'
import { RAY, rayMul } from './math'
import { fetchBlockchainData } from './blockchainData'
import { calculateRevenue } from './index'

jest.mock('./blockchainData', () => ({
  fetchBlockchainData: jest.fn(),
}))

function liquidityIndex(interest: number) {
  return rayMul(RAY, (BigInt(100 + interest) * RAY) / BigInt(100))
}

jest.mock('./config', () => ({
  SUPPORTED_NETWORKS: [
    {
      networkId: NetworkId['ethereum-mainnet'],
      poolAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
      poolConfiguratorAddress:
        '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
      oracleAddress: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
      subgraphId: 'mock-subgraph-id',
    },
  ],
}))

describe('Aave revenue calculation', () => {
  const mockUserAddress =
    '0x1234567890123456789012345678901234567890' as Address
  const mockStartTimestamp = new Date('2025-01-01T00:00:00Z')
  const mockEndTimestamp = new Date(
    mockStartTimestamp.getTime() + 86400 * 1000 * 4,
  ) // 4 days later

  const mockReserveToken1 =
    '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as Address
  const mockReserveToken2 =
    '0x9876543210ABCDEF9876543210ABCDEF98765432' as Address

  const mockReserveTokenDecimals1 = 18
  const mockReserveTokenDecimals2 = 6

  const mockAToken1 = '0x1111111111111111111111111111111111111111' as Address
  const mockAToken2 = '0x2222222222222222222222222222222222222222' as Address

  const startTimestampSeconds = Math.floor(mockStartTimestamp.getTime() / 1000)

  const interval1 = startTimestampSeconds + 86400 * 1 // 1 day after start
  const interval2 = startTimestampSeconds + 86400 * 2 // 2 days after start
  const interval3 = startTimestampSeconds + 86400 * 3 // 3 days after start

  const mockStartReserveData = new Map([
    [
      mockReserveToken1,
      {
        reserveTokenAddress: mockReserveToken1,
        reserveTokenDecimals: mockReserveTokenDecimals1,
        aTokenAddress: mockAToken1,
        liquidityIndex: RAY,
        reserveFactor: BigInt(2000), // 20% in bps
      },
    ],
    [
      mockReserveToken2,
      {
        reserveTokenAddress: mockReserveToken2,
        reserveTokenDecimals: mockReserveTokenDecimals2,
        aTokenAddress: mockAToken2,
        liquidityIndex: RAY,
        reserveFactor: BigInt(2000), // 20% in bps
      },
    ],
  ])

  const mockEndReserveData = new Map([
    [
      mockReserveToken1,
      {
        reserveTokenAddress: mockReserveToken1,
        reserveTokenDecimals: mockReserveTokenDecimals1,
        aTokenAddress: mockAToken1,
        liquidityIndex: liquidityIndex(6),
        reserveFactor: BigInt(8000), // 80% in bps
      },
    ],
    [
      mockReserveToken2,
      {
        reserveTokenAddress: mockReserveToken2,
        reserveTokenDecimals: mockReserveTokenDecimals2,
        aTokenAddress: mockAToken2,
        liquidityIndex: liquidityIndex(40),
        reserveFactor: BigInt(5000), // 50% in bps
      },
    ],
  ])

  const mockReserveFactorHistory = new Map([
    [
      mockReserveToken1,
      [
        { reserveFactor: BigInt(6000), timestamp: interval1 },
        { reserveFactor: BigInt(8000), timestamp: interval3 },
      ],
    ],
    [
      mockReserveToken2,
      [{ reserveFactor: BigInt(5000), timestamp: interval1 }],
    ],
  ])

  const mockStartBalances = new Map([
    [mockAToken1, BigInt(10e18)], // 10 tokens
    [mockAToken2, BigInt(1000e6)], // 1000 tokens
  ])

  const mockBalanceHistory = new Map([
    [
      mockAToken1,
      [
        {
          // balance increased
          scaledATokenBalance: BigInt(20e18),
          liquidityIndex: liquidityIndex(1),
          timestamp: interval1,
        },
        {
          // balance decreased
          scaledATokenBalance: BigInt(10e18),
          liquidityIndex: liquidityIndex(2),
          timestamp: interval2,
        },
      ],
    ],
    // for token2, the balance is constant
  ])

  const mockTokenUSDPrices = new Map([
    [mockReserveToken1, new BigNumber(1000)], // $1000 per token
    [mockReserveToken2, new BigNumber(1)], // $1 per token
  ])

  const mockBlockchainData = {
    startReserveData: mockStartReserveData,
    endReserveData: mockEndReserveData,
    reserveFactorHistory: mockReserveFactorHistory,
    startBalances: mockStartBalances,
    balanceHistory: mockBalanceHistory,
    tokenUSDPrices: mockTokenUSDPrices,
  }

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(fetchBlockchainData).mockResolvedValueOnce(mockBlockchainData)
  })

  it('should correctly calculate revenue with ', async () => {
    // Token 1: deposit amount changed during the period:
    // - Day 1:   10 tokens, earnings = 0.1 = 10 * 0.01 (liquidity index increase)
    // - Day 2:   20 tokens, earnings = 0.2 = 20 * 0.01 (liquidity index increase)
    // - Day 3-4: 10 tokens, earnings = 0.4 = 10 * 0.04 (liquidity index increase)
    //
    // Reserve factor also changed frequently:
    // - Day 1   20%
    // - Day 2-3 60%
    // - Day 4   80%
    //
    // Protocol revenue:
    // - Day 1   (reserve factor 20%): 0.025 =  0.1              * (0.20 / (1 - 0.20))
    // - Day 2-3 (reserve factor 50%): 0.6   = (0.2 + 0.4 * 0.5) * (0.60 / (1 - 0.60))
    // - Day 4   (reserve factor 80%): 0.8   =        0.4 * 0.5  * (0.80 / (1 - 0.80))
    // Total: 1.425

    // Token 2: amount of 1000 was constantly held the entire period
    // User earnings: 400 = 1000 * 0.4 (liquidity index increase)
    //
    // Reserve factor was 20% during first day, 50% during the last 3 days
    // Protocol revenue:
    // - Day 1   (reserve factor 20%):  25 = 400 * 0.25 * (0.20 / (1 - 0.20))
    // - Day 2-4 (reserve factor 50%): 300 = 400 * 0.75 * (0.50 / (1 - 0.50))
    // Total: 325

    const revenue = await calculateRevenue({
      address: mockUserAddress,
      startTimestamp: mockStartTimestamp,
      endTimestamp: mockEndTimestamp,
    })

    expect(revenue).toEqual(1750) // Total revenue in USD ((1.425 * 1000) + (325 * 1))
  })
})
