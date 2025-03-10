import { Address, erc20Abi } from 'viem'
import { getErc20Contract, getViemPublicClient } from '../../../utils'
import { fetchEvents } from '../utils/events'
import { getAerodromeLiquidityPoolContract } from '../utils/viem'
import { getSwapEvents } from './getSwapEvents'

jest.mock('../utils/events')
jest.mock('../utils/viem')
jest.mock('../../../utils')

const address1: Address = '0x1111111111111111111111111111111111111111'
const address2: Address = '0x2222222222222222222222222222222222222222'
const mockFetchEvents = [
  { blockNumber: 1n, args: { recipient: address1, amount0: 10000n } },
  { blockNumber: 2n, args: { recipient: address2, amount0: 25000n } },
  { blockNumber: 3n, args: { recipient: address1, amount0: -600000n } },
]

const mockTokenId = '0x123456789'

const expectedSwapEventsUser1 = [
  { timestamp: new Date(100000), amountInToken: 10000n, tokenDecimals: 4n, tokenId: '0x123456789' },
  { timestamp: new Date(300000), amountInToken: 600000n, tokenDecimals: 4n, tokenId: '0x123456789' },
]
const expectedSwapEventsUser2 = [
  { timestamp: new Date(200000), amountInToken: 25000n, tokenDecimals: 4n, tokenId: '0x123456789' },
]

describe('getSwapEvents', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })
  it('should return expected swap events for user address 0x1', async () => {
    jest.mocked(getAerodromeLiquidityPoolContract).mockResolvedValueOnce({
      abi: erc20Abi,
      address: '0x123',
    } as unknown as ReturnType<typeof getAerodromeLiquidityPoolContract>)
    jest
      .mocked(fetchEvents)
      .mockResolvedValueOnce(
        mockFetchEvents as unknown as ReturnType<typeof fetchEvents>,
      )
    const mockGetBlock = jest
      .fn()
      .mockImplementation(({ blockNumber }: { blockNumber: bigint }) => {
        return {
          timestamp: blockNumber * 100n,
        }
      })
    jest.mocked(getViemPublicClient).mockReturnValue({
      getBlock: mockGetBlock,
      readContract: jest.fn().mockResolvedValue(mockTokenId),
    } as unknown as ReturnType<typeof getViemPublicClient>)
    jest.mocked(getErc20Contract).mockResolvedValue({
      read: {
        decimals: jest.fn().mockResolvedValue(4n),
      },
    } as unknown as ReturnType<typeof getErc20Contract>)

    const result = await getSwapEvents(
      address1,
      '0x123',
      new Date(0),
      new Date(1000000),
    )
    expect(getAerodromeLiquidityPoolContract).toHaveBeenCalledTimes(1)
    expect(fetchEvents).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expectedSwapEventsUser1)
  })
  it('should return expected swap events for user address 0x2', async () => {
    jest.mocked(getAerodromeLiquidityPoolContract).mockResolvedValueOnce({
      abi: erc20Abi,
      address: '0x123',
    } as unknown as ReturnType<typeof getAerodromeLiquidityPoolContract>)
    jest
      .mocked(fetchEvents)
      .mockResolvedValueOnce(
        mockFetchEvents as unknown as ReturnType<typeof fetchEvents>,
      )
    const mockGetBlock = jest
      .fn()
      .mockImplementation(({ blockNumber }: { blockNumber: bigint }) => {
        return {
          timestamp: blockNumber * 100n,
        }
      })
    jest.mocked(getViemPublicClient).mockReturnValue({
      getBlock: mockGetBlock,
      readContract: jest.fn().mockResolvedValue(mockTokenId),
    } as unknown as ReturnType<typeof getViemPublicClient>)
    jest.mocked(getErc20Contract).mockResolvedValue({
      read: {
        decimals: jest.fn().mockResolvedValue(4n),
      },
    } as unknown as ReturnType<typeof getErc20Contract>)

    const result = await getSwapEvents(
      address2,
      '0x123',
      new Date(0),
      new Date(1000000),
    )
    expect(getAerodromeLiquidityPoolContract).toHaveBeenCalledTimes(1)
    expect(fetchEvents).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expectedSwapEventsUser2)
  })
})
