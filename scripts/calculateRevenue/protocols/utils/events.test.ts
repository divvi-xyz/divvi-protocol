import {
  fetchEvents,
  getBlockRange,
  _getNearestBlockForTesting as getNearestBlock,
} from './events'
import nock from 'nock'
import { NetworkId } from '../../../types'
import { BlockTimestampData } from '../types'
import { getViemPublicClient } from '../../../utils'
import { erc20Abi, GetContractReturnType } from 'viem'

// This makes memoize(fn) return fn, effectively disabling memoization
// so it doesn't interfere with the tests.
jest.mock('@github/memoize', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (fn: any) => fn,
}))

jest.mock('../../../utils')

const networkId = NetworkId['arbitrum-one']

describe('On-chain event helpers', () => {
  beforeEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  describe('getNearestBlock', () => {
    it('should correctly fetch the nearest block data to a given timestamp', async () => {
      const mockBlockTimestamp: BlockTimestampData = {
        timestamp: 1234,
        height: 345,
      }
      nock(`https://coins.llama.fi`)
        .get(`/block/arbitrum/1736525692`)
        .reply(200, mockBlockTimestamp)

      const timestamp = new Date(1736525692000)
      const result = await getNearestBlock(networkId, timestamp)

      expect(result).toEqual(mockBlockTimestamp)
    })
  })

  describe('getBlockRange', () => {
    it('should return correct start and end blocks for a valid range', async () => {
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1000')
        .reply(200, { height: 10, timestamp: 1000 })
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/2000')
        .reply(200, { height: 20, timestamp: 2000 })

      const startTimestamp = new Date(1000000)
      const endTimestamp = new Date(2000000)
      const result = await getBlockRange({
        networkId,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual({ startBlock: 10, endBlockExclusive: 20 })
    })

    it('should exercise the +1 logic in getFirstBlockAtOrAfterTimestamp for startBlock', async () => {
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1005')
        .reply(200, { height: 100, timestamp: 1000 })
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/2000')
        .reply(200, { height: 200, timestamp: 2000 })

      const startTimestamp = new Date(1005000)
      const endTimestamp = new Date(2000000)
      const result = await getBlockRange({
        networkId,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual({ startBlock: 101, endBlockExclusive: 200 })
    })

    it('should exercise the +1 logic in getFirstBlockAtOrAfterTimestamp for endBlock', async () => {
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1000')
        .reply(200, { height: 100, timestamp: 1000 })
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/2005')
        .reply(200, { height: 200, timestamp: 2000 })

      const startTimestamp = new Date(1000000)
      const endTimestamp = new Date(2005000)
      const result = await getBlockRange({
        networkId,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual({ startBlock: 100, endBlockExclusive: 201 })
    })

    it('should throw if startTimestamp is not before endTimestamp', async () => {
      const startTimestamp = new Date(2000000)
      const endTimestamp = new Date(1000000)
      await expect(
        getBlockRange({ networkId, startTimestamp, endTimestamp }),
      ).rejects.toThrow('Start timestamp must be before end timestamp.')
    })

    it('should throw if startTimestamp is equal to endTimestamp', async () => {
      const startTimestamp = new Date(1000000)
      const endTimestamp = new Date(1000000)
      await expect(
        getBlockRange({ networkId, startTimestamp, endTimestamp }),
      ).rejects.toThrow('Start timestamp must be before end timestamp.')
    })

    it('should throw if calculated startBlock is equal to endBlockExclusive', async () => {
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1000') // For startTimestamp = new Date(1000000)
        .reply(200, { height: 9, timestamp: 990 }) // Results in startBlock = 10

      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1001') // For endTimestamp = new Date(1001000)
        .reply(200, { height: 9, timestamp: 990 }) // Results in endBlock = 10

      const startTimestamp = new Date(1000000)
      const endTimestamp = new Date(1001000) // endTimestamp > startTimestamp, so first validation passes

      await expect(
        getBlockRange({ networkId, startTimestamp, endTimestamp }),
      ).rejects.toThrow(
        `Calculated startBlock (height: 10) is not strictly less than calculated endBlockExclusive (height: 10).`,
      )
    })
  })

  describe('fetchEvents', () => {
    const mockContract: GetContractReturnType = {
      address: '0x123',
      abi: erc20Abi,
    }

    it('should fetch all events over multiple requests based on getBlockRange result', async () => {
      const mockGetContractEvents = jest
        .fn()
        .mockImplementation(({ fromBlock }: { fromBlock: bigint }) => {
          return [{ blockNumber: fromBlock, args: {}, eventName: 'Swap' }]
        })
      jest.mocked(getViemPublicClient).mockReturnValue({
        getContractEvents: mockGetContractEvents,
      } as unknown as ReturnType<typeof getViemPublicClient>)

      nock('https://coins.llama.fi')
        .get('/block/arbitrum/0')
        .reply(200, { height: 0, timestamp: 0 })
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1')
        .reply(200, { height: 15000, timestamp: 1 })

      const startTimestamp = new Date(0)
      const endTimestamp = new Date(1000)
      const result = await fetchEvents({
        contract: mockContract,
        eventName: 'Swap',
        networkId,
        startTimestamp,
        endTimestamp,
      })

      expect(mockGetContractEvents).toHaveBeenCalledTimes(2)
      expect(mockGetContractEvents).toHaveBeenNthCalledWith(1, {
        address: mockContract.address,
        abi: mockContract.abi,
        eventName: 'Swap',
        fromBlock: 0n,
        toBlock: 9999n,
      })
      expect(mockGetContractEvents).toHaveBeenNthCalledWith(2, {
        address: mockContract.address,
        abi: mockContract.abi,
        eventName: 'Swap',
        fromBlock: 10000n,
        toBlock: 14999n,
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toHaveProperty('blockNumber', 0n)
      expect(result[1]).toHaveProperty('blockNumber', 10000n)
    })

    it('should propagate error if getBlockRange determines an empty/invalid range', async () => {
      const mockGetContractEvents = jest.fn()
      jest.mocked(getViemPublicClient).mockReturnValue({
        getContractEvents: mockGetContractEvents,
      } as unknown as ReturnType<typeof getViemPublicClient>)

      // Setup nock for getBlockRange to throw an error.
      // This scenario makes startBlock = 10 and endBlock = 10.
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1000') // For startTimestamp = new Date(1000000)
        .reply(200, { height: 9, timestamp: 990 }) // Results in startBlock = 10
      nock('https://coins.llama.fi')
        .get('/block/arbitrum/1001') // For endTimestamp = new Date(1001000)
        .reply(200, { height: 9, timestamp: 990 }) // Results in endBlock = 10

      const startTimestamp = new Date(1000000)
      const endTimestamp = new Date(1001000) // startTimestamp < endTimestamp is true

      // We expect fetchEvents to propagate the error thrown by getBlockRange.
      await expect(
        fetchEvents({
          contract: mockContract,
          eventName: 'Swap',
          networkId,
          startTimestamp: startTimestamp,
          endTimestamp: endTimestamp,
        }),
      ).rejects.toThrow(
        `Calculated startBlock (height: 10) is not strictly less than calculated endBlockExclusive (height: 10).`,
      )
      expect(mockGetContractEvents).not.toHaveBeenCalled()
    })
  })
})
