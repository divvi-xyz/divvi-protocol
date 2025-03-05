import { _fetchEvents, _getNearestBlock } from './events'
import nock from 'nock'
import { NetworkId } from '../../../types'
import { BlockTimestampData } from '../types'
import { getViemPublicClient } from '../../../utils'
import { erc20Abi, GetContractReturnType } from 'viem'

jest.mock('../utils/viem')
jest.mock('../../../utils')

describe('On-chain event helpers', () => {
  describe('getNearestBlock', () => {
    it('should correctly fetch the nearest block to a given timestamp', async () => {
      const mockBlockTimestamp: BlockTimestampData = {
        timestamp: 1234,
        height: 345,
      }
      nock(`https://coins.llama.fi`)
        .get(`/block/arbitrum/1736525692`)
        .reply(200, mockBlockTimestamp)

      const networkId = NetworkId['arbitrum-one']
      const timestamp = new Date(1736525692000)
      const result = await _getNearestBlock(networkId, timestamp)

      expect(result).toEqual(345)
    })
  })
  describe('fetchEvents', () => {
    it('should fetch all events over multiple requests', async () => {
      const mockGetContractEvents = jest
        .fn()
        .mockImplementation(({ fromBlock }: { fromBlock: bigint }) => {
          return [
            {
              blockNumber: fromBlock,
              args: {},
              eventName: 'Swap',
            },
          ]
        })
      jest.mocked(getViemPublicClient).mockReturnValue({
        getContractEvents: mockGetContractEvents,
      } as unknown as ReturnType<typeof getViemPublicClient>)

      const mockContract: GetContractReturnType = {
        address: '0x123',
        abi: erc20Abi,
      }

      const mockStartBlockTimestamp: BlockTimestampData = {
        timestamp: 0,
        height: 0,
      }
      const mockEndBlockTimestamp: BlockTimestampData = {
        timestamp: 1000,
        height: 15000,
      }

      nock(`https://coins.llama.fi`)
        .get(`/block/arbitrum/0`)
        .reply(200, mockStartBlockTimestamp)
      nock(`https://coins.llama.fi`)
        .get(`/block/arbitrum/1`)
        .reply(200, mockEndBlockTimestamp)

      const networkId = NetworkId['arbitrum-one']
      const startTimestamp = new Date(0)
      const endTimestamp = new Date(1000)
      const result = await _fetchEvents({
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
        toBlock: 10000n,
      })
      expect(mockGetContractEvents).toHaveBeenNthCalledWith(2, {
        address: mockContract.address,
        abi: mockContract.abi,
        eventName: 'Swap',
        fromBlock: 10001n,
        toBlock: 15000n,
      })

      expect(result).toHaveLength(2)

      // Using toHaveProperty instead of toEqual because the blockNumber is a bigint
      // and Jest doesn't handle bigint comparisons well

      expect(result[0]).toHaveProperty('blockNumber', 0n)
      expect(result[0]).toHaveProperty('eventName', 'Swap')
      expect(result[1]).toHaveProperty('blockNumber', 10001n)
      expect(result[1]).toHaveProperty('eventName', 'Swap')
    })
  })
})
