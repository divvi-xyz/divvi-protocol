import { QueryResponse } from '@envio-dev/hypersync-client'
import { NetworkId, ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { filter } from './aerodrome'

jest.mock('../utils', () => ({
  getHyperSyncClient: jest.fn(),
  getBlock: jest.fn(),
}))

const makeQueryResponse = (
  blocks: { number: number }[],
  nextBlock = 100,
): QueryResponse => ({
  data: {
    blocks,
    transactions: [],
    logs: [],
    traces: [],
  },
  nextBlock,
  totalExecutionTime: 50,
})

describe('filter', () => {
  const userAddress = '0xUser'
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
  })

  it('returns false if first found block is before the referral event timestamp', async () => {
    mockClient.get.mockResolvedValueOnce(makeQueryResponse([{ number: 123 }]))

    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742194800n, // March 17, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(false)
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalled()
  })

  it('returns true if a first found block is after the referral event timestamp', async () => {
    mockClient.get.mockResolvedValueOnce(makeQueryResponse([{ number: 456 }]))

    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, _blockNumber: bigint) =>
        Promise.resolve({
          timestamp: 1742367600n, // March 19, 2025
        }) as unknown as ReturnType<typeof getBlock>,
    )

    const result = await filter(event)
    expect(result).toBe(true)
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalled()
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

  it('handles paginated results and returns true if the first found block is after the referral event timestamp ', async () => {
    mockClient.get
      .mockResolvedValueOnce(makeQueryResponse([], 50))
      .mockResolvedValueOnce(makeQueryResponse([], 100))
      .mockResolvedValueOnce(makeQueryResponse([{ number: 456 }], 100))

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
    expect(getBlock).toHaveBeenCalledTimes(1)
  })

  it('throws if API fails', async () => {
    mockClient.get.mockRejectedValueOnce(new Error('API failed'))

    await expect(filter(event)).rejects.toThrow('API failed')
    expect(mockClient.get).toHaveBeenCalledTimes(1)
  })
})
