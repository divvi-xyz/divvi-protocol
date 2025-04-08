import { Log, QueryResponse } from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import { NetworkId, TokenPriceData } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { FonbnkTransaction } from './types'
import {
  calculateRevenue,
  getTotalRevenueUsdFromTransactions,
  getUserTransactions,
} from '.'

jest.mock('../../../utils', () => ({
  getHyperSyncClient: jest.fn(),
  getBlock: jest.fn(),
  getErc20Contract: jest.fn(),
}))
jest.mock('../utils/tokenPrices')

const mockTokenPrices: TokenPriceData[] = [
  {
    priceUsd: '3',
    priceFetchedAt: new Date('2025-01-01T20:29:55.868Z').getTime(), // Just before the first transaction
  },
  {
    priceUsd: '5',
    priceFetchedAt: new Date('2025-01-02T20:29:55.868Z').getTime(), // Just before the second transaction
  },
]

const makeQueryResponse = (logs: Log[], nextBlock = 100): QueryResponse => ({
  data: {
    blocks: [],
    transactions: [],
    logs,
    traces: [],
  },
  nextBlock,
  totalExecutionTime: 50,
})

const MOCK_HYPERSYNC_LOGS: Log[] = [
  {
    blockNumber: 17357742,
    address: '0x123',
    data: '0x00000000000000000000000000010000',
    topics: [],
  },
  {
    blockNumber: 17358606,
    address: '0x123',
    data: '0x00000000000000000000000000035000',
    topics: [],
  },
]

const MOCK_FONBNK_TRANSACTIONS: FonbnkTransaction[] = [
  {
    amount: BigInt(10000),
    tokenAddress: '0x123',
    timestamp: new Date('2025-01-01T21:30:00.000Z'),
  },
  {
    amount: BigInt(35000),
    tokenAddress: '0x123',
    timestamp: new Date('2025-01-02T21:30:00.000Z'),
  },
]

describe('getUserTransactions', () => {
  let mockClient: { get: jest.Mock }
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should fetch user transactions', async () => {
    mockClient = { get: jest.fn() }
    jest
      .mocked(getHyperSyncClient)
      .mockReturnValue(
        mockClient as unknown as ReturnType<typeof getHyperSyncClient>,
      )
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse(MOCK_HYPERSYNC_LOGS))
      .mockResolvedValue(makeQueryResponse([]))
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, blockNumber: bigint) =>
        Promise.resolve({
          timestamp: blockNumber * 100n,
        }) as unknown as ReturnType<typeof getBlock>,
    )
    const result = await getUserTransactions({
      address: '0x123',
      payoutWallet: '0x456',
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestamp: new Date('2025-01-03T00:00:00Z'),
      client: mockClient,
      networkId: NetworkId['celo-mainnet'],
    })
    expect(result).toEqual(MOCK_FONBNK_TRANSACTIONS)
  })
})

describe('getTotalRevenueUsdFromTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should return the correct total revenue in USD', async () => {
    jest.mocked(getErc20Contract).mockResolvedValue({
      read: {
        decimals: jest.fn().mockResolvedValue(4n),
      },
    } as unknown as ReturnType<typeof getErc20Contract>)
    jest.mocked(fetchTokenPrices).mockResolvedValue(mockTokenPrices)
    const result = await getTotalRevenueUsdFromTransactions({
      transactions: MOCK_FONBNK_TRANSACTIONS,
      networkId: NetworkId['celo-mainnet'],
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestamp: new Date('2025-01-03T00:00:00Z'),
    })
    expect(result).toEqual(20.5)
  })
})

describe('calculateRevenue', () => {
  let mockClient: { get: jest.Mock }
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should calculate revenue correctly', async () => {
    mockClient = { get: jest.fn() }
    jest
      .mocked(getHyperSyncClient)
      .mockReturnValue(
        mockClient as unknown as ReturnType<typeof getHyperSyncClient>,
      )
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse(MOCK_HYPERSYNC_LOGS))
      .mockResolvedValue(makeQueryResponse([]))
    jest.mocked(getErc20Contract).mockResolvedValue({
      read: {
        decimals: jest.fn().mockResolvedValue(4n),
      },
    } as unknown as ReturnType<typeof getErc20Contract>)
    jest.mocked(fetchTokenPrices).mockResolvedValue(mockTokenPrices)
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, blockNumber: bigint) =>
        Promise.resolve({
          timestamp: blockNumber * 100n,
        }) as unknown as ReturnType<typeof getBlock>,
    )
    const result = await calculateRevenue({
      address: '0x123',
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestamp: new Date('2025-01-03T00:00:00Z'),
    })
    expect(result).toEqual(20.5)
  })
})
