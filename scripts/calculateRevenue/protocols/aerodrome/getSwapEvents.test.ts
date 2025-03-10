import { Address, erc20Abi } from 'viem'
import { getErc20Contract, getViemPublicClient } from '../../../utils'
import { fetchEvents } from '../utils/events'
import { getAerodromeLiquidityPoolContract } from '../utils/viem'
import { getSwapEvents } from './getSwapEvents'
import { AERODROME_NETWORK_ID } from './constants'

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

const mockTokenAddress = '0x123456789'

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
      readContract: jest.fn().mockResolvedValue(mockTokenAddress),
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
    expect(result.length).toEqual(2)
    expect(result[0].amountInToken).toEqual(10000n)
    expect(result[0].timestamp).toEqual(new Date(100000))
    expect(result[0].tokenDecimals).toEqual(4n)
    expect(result[0].tokenId).toEqual(
      `${AERODROME_NETWORK_ID}:${mockTokenAddress}`,
    )
    expect(result[1].amountInToken).toEqual(600000n)
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
      readContract: jest.fn().mockResolvedValue(mockTokenAddress),
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
    expect(result.length).toEqual(1)
    expect(result[0].amountInToken).toEqual(25000n)
    expect(result[0].timestamp).toEqual(new Date(200000))
    expect(result[0].tokenDecimals).toEqual(4n)
    expect(result[0].tokenId).toEqual(
      `${AERODROME_NETWORK_ID}:${mockTokenAddress}`,
    )
  })
})
