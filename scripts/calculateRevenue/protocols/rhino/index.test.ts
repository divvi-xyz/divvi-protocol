import {
  HypersyncClient,
  Log,
  QueryResponse,
} from '@envio-dev/hypersync-client'
import { getBlock, getErc20Contract, getHyperSyncClient } from '../../../utils'
import { NetworkId, TokenPriceData } from '../../../types'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { BridgeTransaction } from './types'
import {
  calculateRevenue,
  getTotalRevenueUsdFromBridges,
  getUserBridges,
} from '.'
import { Address } from 'viem'
import { getBlockRange } from '../utils/events'

jest.mock('../../../utils', () => ({
  getHyperSyncClient: jest.fn(),
  getBlock: jest.fn(),
  getErc20Contract: jest.fn(),
}))
jest.mock('../utils/tokenPrices')
jest.mock('../utils/events')

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

function createData({
  address,
  tokenAddress,
  amount,
}: {
  address: Address
  tokenAddress: Address
  amount: string
}) {
  return `0x${address.slice(2).padStart(64, '0')}${tokenAddress.slice(2).padStart(64, '0')}${amount.padStart(64, '0')}${'80'.padStart(64, '0')}${'0'.padStart(64, '0')}`
}

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address
const MOCK_TOKEN_ADDRESS =
  '0x0987654321098765432109876543210987654321' as Address

const MOCK_HYPERSYNC_LOGS: Log[] = [
  {
    blockNumber: 17357742,
    data: createData({
      address: MOCK_ADDRESS,
      tokenAddress: MOCK_TOKEN_ADDRESS,
      amount: '2710',
    }),
    topics: [
      '0xe4f4f1fb3534fe80225d336f6e5a73007dc992e5f6740152bf13ed2a08f3851a',
    ],
  },
  {
    blockNumber: 17358606,
    data: createData({
      address: MOCK_ADDRESS,
      tokenAddress: MOCK_TOKEN_ADDRESS,
      amount: '88B8',
    }),
    topics: [
      '0xe4f4f1fb3534fe80225d336f6e5a73007dc992e5f6740152bf13ed2a08f3851a',
    ],
  },
]

const MOCK_BRIDGE_TRANSACTIONS: BridgeTransaction[] = [
  {
    amount: BigInt(10000),
    tokenAddress: MOCK_TOKEN_ADDRESS,
    timestamp: new Date('2025-01-01T21:30:00.000Z'),
  },
  {
    amount: BigInt(35000),
    tokenAddress: MOCK_TOKEN_ADDRESS,
    timestamp: new Date('2025-01-02T21:30:00.000Z'),
  },
]

describe('getUserBridges', () => {
  const mockClient: HypersyncClient = {
    get: jest.fn(),
  } as unknown as HypersyncClient
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should fetch user transactions', async () => {
    jest.mocked(getHyperSyncClient).mockReturnValue(mockClient)
    jest
      .mocked(mockClient.get)
      .mockResolvedValueOnce(makeQueryResponse(MOCK_HYPERSYNC_LOGS))
      .mockResolvedValue(makeQueryResponse([]))
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, blockNumber: bigint) =>
        Promise.resolve({
          timestamp: blockNumber * 100n,
        }) as unknown as ReturnType<typeof getBlock>,
    )
    jest.mocked(getBlockRange).mockImplementation(
      ({}: {
        networkId: NetworkId
        startTimestamp: Date
        endTimestampExclusive: Date
      }) =>
        Promise.resolve({
          startBlock: 0,
          endBlock: 0,
        }) as unknown as ReturnType<typeof getBlockRange>,
    )

    const result = await getUserBridges({
      address: MOCK_ADDRESS,
      contractAddress: '0x456',
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestampExclusive: new Date('2025-01-03T00:00:00Z'),
      client: mockClient as unknown as HypersyncClient,
      networkId: NetworkId['celo-mainnet'],
    })

    expect(result.length).toEqual(2)
    expect(result[0].tokenAddress).toEqual(MOCK_TOKEN_ADDRESS)
    expect(result[1].tokenAddress).toEqual(MOCK_TOKEN_ADDRESS)
    expect(Number(result[0].amount)).toEqual(10000)
    expect(Number(result[1].amount)).toEqual(35000)
    expect(result[0].timestamp).toEqual(new Date('2025-01-01T23:30:00.000Z'))
    expect(result[1].timestamp).toEqual(new Date('2025-01-02T23:30:00.000Z'))
  })
})

describe('getTotalRevenueUsdFromBridges', () => {
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

    const result = await getTotalRevenueUsdFromBridges({
      userBridges: MOCK_BRIDGE_TRANSACTIONS,
      networkId: NetworkId['celo-mainnet'],
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestampExclusive: new Date('2025-01-03T00:00:00Z'),
    })

    // The first transaction has value of 10000 with 4 decimals which is 1, with a price of 3 that is 3 USD
    // The second transaction has hex value of 35000 with 4 decimals which is 3.5, with a price of 5 that is 17.5 USD
    expect(result).toEqual(20.5)
  })
})

describe('calculateRevenue', () => {
  const mockClient: HypersyncClient = {
    get: jest.fn(),
  } as unknown as HypersyncClient
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should calculate revenue correctly', async () => {
    jest.mocked(getHyperSyncClient).mockReturnValue(mockClient)
    jest
      .mocked(mockClient.get)
      .mockResolvedValue(makeQueryResponse(MOCK_HYPERSYNC_LOGS, 0))
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
    jest.mocked(getBlockRange).mockImplementation(
      ({}: {
        networkId: NetworkId
        startTimestamp: Date
        endTimestampExclusive: Date
      }) =>
        Promise.resolve({
          startBlock: 0,
          endBlock: 0,
        }) as unknown as ReturnType<typeof getBlockRange>,
    )

    const result = await calculateRevenue({
      address: MOCK_ADDRESS,
      startTimestamp: new Date('2025-01-01T00:00:00Z'),
      endTimestampExclusive: new Date('2025-01-03T00:00:00Z'),
    })

    expect(mockClient.get).toHaveBeenCalledTimes(3)

    // The first included transaction has hex value 0x2710 with 4 decimals which is 1, with a price of 3 that is 3 USD
    // The second included transaction has hex value 0x88B8 with 4 decimals which is 3.5, with a price of 5 that is 17.5 USD
    // Then each transaction is included three times, once for each supported network (since the mocked hypersync returns the same for each)
    expect(result).toEqual(61.5)
  })
})
