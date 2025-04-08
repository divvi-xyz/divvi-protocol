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
import { Address } from 'viem'
import { getFonbnkAssets, getPayoutWallets } from './helpers'
import { FonbnkNetwork } from './constants'

jest.mock('../../../utils', () => ({
  getHyperSyncClient: jest.fn(),
  getBlock: jest.fn(),
  getErc20Contract: jest.fn(),
}))
jest.mock('../utils/tokenPrices')
jest.mock('./helpers')

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
    data: '0x00000000000000000000000000002710',
    topics: [],
  },
  {
    blockNumber: 17358606,
    address: '0x123',
    data: '0x000000000000000000000000000088B8',
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

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address

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
    expect(result.length).toEqual(2)

    expect(result[0].tokenAddress).toEqual('0x123')
    expect(result[1].tokenAddress).toEqual('0x123')

    expect(result[0].timestamp).toEqual(new Date('2025-01-01T23:30:00.000Z'))
    expect(result[1].timestamp).toEqual(new Date('2025-01-02T23:30:00.000Z'))
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
      .mockResolvedValue(makeQueryResponse(MOCK_HYPERSYNC_LOGS))
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
    jest.mocked(getFonbnkAssets).mockResolvedValue([
      { network: FonbnkNetwork.CELO, asset: 'USDC' },
      { network: FonbnkNetwork.CELO, asset: 'CUSD' },
    ])
    jest
      .mocked(getPayoutWallets)
      .mockResolvedValueOnce(['0x123'])
      .mockResolvedValue(['0x456', '0x123'])
    const result = await calculateRevenue({
      address: MOCK_ADDRESS,
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestamp: new Date('2025-01-03T00:00:00Z'),
    })
    expect(getFonbnkAssets).toHaveBeenCalledTimes(1)
    expect(getPayoutWallets).toHaveBeenCalledTimes(2)
    expect(result).toEqual(41)
  })
})
