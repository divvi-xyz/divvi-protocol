import { Log, QueryResponse } from '@envio-dev/hypersync-client'
import { NetworkId, ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { filter } from './fonbnk'
import {
  getFonbnkAssets,
  getPayoutWallets,
} from '../calculateRevenue/protocols/fonbnk/helpers'
import { Address } from 'viem'

jest.mock('../utils', () => ({
  getHyperSyncClient: jest.fn(),
  getBlock: jest.fn(),
}))
jest.mock('../calculateRevenue/protocols/fonbnk/helpers')

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address

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

describe('filter', () => {
  const userAddress = MOCK_ADDRESS
  const event: ReferralEvent = {
    userAddress: userAddress,
    timestamp: Math.round(new Date('2025-03-18T00:00:00Z').getTime() / 1000),
    protocol: 'aerodrome',
    referrerId: 'referrer1',
  }
  let mockClient: { get: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    mockClient = { get: jest.fn() }
    jest
      .mocked(getHyperSyncClient)
      .mockReturnValue(
        mockClient as unknown as ReturnType<typeof getHyperSyncClient>,
      )
    jest
      .mocked(getFonbnkAssets)
      .mockResolvedValue([{ network: 'CELO', asset: 'USDC' }])
    jest.mocked(getPayoutWallets).mockResolvedValue(['0x123'])
  })

  it('returns false if first found block is before the referral event timestamp', async () => {
    mockClient.get.mockResolvedValueOnce(
      makeQueryResponse([{ blockNumber: 123, topics: [] }]),
    )

    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742194800n, // March 17, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(false)
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalledWith(
      NetworkId['celo-mainnet'],
      BigInt(123),
    )
  })

  it('returns true if a first found block is after the referral event timestamp', async () => {
    mockClient.get.mockResolvedValueOnce(
      makeQueryResponse([{ blockNumber: 456, topics: [] }]),
    )

    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742367600n, // March 19, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(true)
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalledWith(
      NetworkId['celo-mainnet'],
      BigInt(456),
    )
  })

  it('returns false if no blocks are found', async () => {
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse([]))
      .mockResolvedValueOnce(makeQueryResponse([])) // causes loop to break

    const result = await filter(event)
    expect(result).toBe(false)
    expect(mockClient.get).toHaveBeenCalledTimes(2)
    expect(getBlock).not.toHaveBeenCalled()
  })

  it('returns false if first found block is before the referral event timestamp for the second payout wallet', async () => {
    jest.mocked(getPayoutWallets).mockResolvedValue(['0x123', '0x456'])
    mockClient.get
      .mockResolvedValueOnce(
        makeQueryResponse([{ blockNumber: 456, topics: [] }], 0),
      )
      .mockResolvedValueOnce(
        makeQueryResponse([{ blockNumber: 123, topics: [] }], 0),
      )
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, blockNumber: bigint) =>
        Promise.resolve({
          timestamp: blockNumber === BigInt(456) ? 1742367600n : 1742194800n,
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(false)
    expect(mockClient.get).toHaveBeenCalledTimes(2)
    expect(getBlock).toHaveBeenCalledTimes(2)
  })

  it('returns true if first found block is after the referral event timestamp for the second payout wallet', async () => {
    jest.mocked(getPayoutWallets).mockResolvedValue(['0x123', '0x456'])
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse([], 0))
      .mockResolvedValueOnce(
        makeQueryResponse([{ blockNumber: 456, topics: [] }], 0),
      )
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742367600n,
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(true)
    expect(mockClient.get).toHaveBeenCalledTimes(2)
    expect(getBlock).toHaveBeenCalledWith(
      NetworkId['celo-mainnet'],
      BigInt(456),
    )
  })

  it('handles paginated results and returns true if the first found block is after the referral event timestamp ', async () => {
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse([], 50))
      .mockResolvedValueOnce(makeQueryResponse([], 100))
      .mockResolvedValueOnce(
        makeQueryResponse([{ blockNumber: 456, topics: [] }], 100),
      )

    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742367600n, // March 19, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    jest.mocked(getBlock).mockImplementationOnce(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742428800n, // March 20, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(true)
    expect(mockClient.get).toHaveBeenCalledTimes(3)
    expect(getBlock).toHaveBeenCalledWith(
      NetworkId['celo-mainnet'],
      BigInt(456),
    )
  })

  it('throws if API fails', async () => {
    mockClient.get.mockRejectedValueOnce(new Error('API failed'))

    await expect(filter(event)).rejects.toThrow('API failed')
    expect(mockClient.get).toHaveBeenCalledTimes(1)
  })
})
