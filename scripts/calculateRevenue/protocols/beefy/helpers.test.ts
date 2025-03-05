import { _fetchVaultTvlHistory, _fetchFeeEvents } from './helpers'
import { BeefyVaultTvlData } from './types'
import { getStrategyContract } from '../utils/viem'
import { getViemPublicClient } from '../../../utils'
import { NetworkId } from '../../../types'
import nock from 'nock'
import { fetchEvents } from '../utils/events'
import { erc20Abi } from 'viem'

jest.mock('../utils/viem')
jest.mock('../../../utils')
jest.mock('../utils/events')

describe('Beefy revenue calculation helpers', () => {
  describe('fetchVaultTvlHistory', () => {
    it('should return correct results for a <1 week span', async () => {
      const mockVaultTvlData = [
        ['foo', 1],
        ['bar', 2],
      ] as BeefyVaultTvlData[]
      nock(`https://databarn.beefy.com`)
        .get(`/api/v1/beefy/product/celo/0x123/tvl`)
        .query({
          from_date_utc: '2025-01-10T16:14:52.000Z',
          to_date_utc: '2025-01-13T16:14:52.000Z',
        })
        .reply(200, mockVaultTvlData)

      const vaultAddress = '0x123'
      const beefyChain = 'celo'
      const startTimestamp = new Date('2025-01-10T16:14:52+00:00')
      const endTimestamp = new Date('2025-01-13T16:14:52+00:00')

      const result = await _fetchVaultTvlHistory({
        vaultAddress,
        beefyChain,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual(mockVaultTvlData)
    })
    it('should return correct results for an exactly 1 week span', async () => {
      const mockVaultTvlData = [
        ['foo', 1],
        ['bar', 2],
      ] as BeefyVaultTvlData[]
      nock(`https://databarn.beefy.com`)
        .get(`/api/v1/beefy/product/celo/0x123/tvl`)
        .query({
          from_date_utc: '2025-01-10T16:14:52.000Z',
          to_date_utc: '2025-01-17T16:14:52.000Z',
        })
        .reply(200, mockVaultTvlData)

      const vaultAddress = '0x123'
      const beefyChain = 'celo'
      const startTimestamp = new Date('2025-01-10T16:14:52+00:00')
      const endTimestamp = new Date('2025-01-17T16:14:52+00:00')

      const result = await _fetchVaultTvlHistory({
        vaultAddress,
        beefyChain,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual(mockVaultTvlData)
    })
    it('should return correct results for a >1 week span', async () => {
      const mockVaultTvlWeekOneData = [
        ['foo', 1],
        ['bar', 2],
      ] as BeefyVaultTvlData[]
      const mockVaultTvlWeekTwoData = [
        ['baz', 3],
        ['bat', 4],
      ] as BeefyVaultTvlData[]

      const mockVaultTvlData = [
        ['foo', 1],
        ['bar', 2],
        ['baz', 3],
        ['bat', 4],
      ] as BeefyVaultTvlData[]

      nock(`https://databarn.beefy.com`)
        .get(`/api/v1/beefy/product/celo/0x123/tvl`)
        .query({
          from_date_utc: '2025-01-10T16:14:52.000Z',
          to_date_utc: '2025-01-17T16:14:52.000Z',
        })
        .reply(200, mockVaultTvlWeekOneData)
      nock(`https://databarn.beefy.com`)
        .get(`/api/v1/beefy/product/celo/0x123/tvl`)
        .query({
          from_date_utc: '2025-01-17T16:14:52.000Z',
          to_date_utc: '2025-01-20T16:14:52.000Z',
        })
        .reply(200, mockVaultTvlWeekTwoData)

      const vaultAddress = '0x123'
      const beefyChain = 'celo'
      const startTimestamp = new Date('2025-01-10T16:14:52+00:00')
      const endTimestamp = new Date('2025-01-20T16:14:52+00:00')

      const result = await _fetchVaultTvlHistory({
        vaultAddress,
        beefyChain,
        startTimestamp,
        endTimestamp,
      })
      expect(result).toEqual(mockVaultTvlData)
    })
  })
  describe('fetchFeeEvents', () => {
    it('should fetch all fee events over multiple requests', async () => {
      jest.mocked(fetchEvents).mockResolvedValueOnce([
        { blockNumber: 0n, args: { beefyFees: 100n } },
        { blockNumber: 10001n, args: { beefyFees: 200n } },
      ] as unknown as ReturnType<typeof fetchEvents>)
      const mockGetBlock = jest
        .fn()
        .mockImplementation(({ blockNumber }: { blockNumber: bigint }) => {
          return {
            timestamp: blockNumber * 100n,
          }
        })

      jest.mocked(getViemPublicClient).mockReturnValue({
        getBlock: mockGetBlock,
      } as unknown as ReturnType<typeof getViemPublicClient>)
      jest.mocked(getStrategyContract).mockResolvedValueOnce({
        abi: erc20Abi,
        address: '0x123',
      } as unknown as ReturnType<typeof getStrategyContract>)

      const vaultAddress = '0x123'
      const networkId = NetworkId['arbitrum-one']
      const startTimestamp = new Date(0)
      const endTimestamp = new Date(1000)
      const result = await _fetchFeeEvents({
        vaultAddress,
        networkId,
        startTimestamp,
        endTimestamp,
      })

      const expected = [
        { beefyFee: 100n, timestamp: new Date('1970-01-01T00:00:00.000Z') },
        { beefyFee: 200n, timestamp: new Date('1970-01-12T13:48:20.000Z') },
      ]
      expect(result[0]).toHaveProperty('beefyFee', expected[0].beefyFee)
      expect(result[0]).toHaveProperty('timestamp', expected[0].timestamp)
      expect(result[1]).toHaveProperty('beefyFee', expected[1].beefyFee)
      expect(result[1]).toHaveProperty('timestamp', expected[1].timestamp)
    })
  })
})
