import { getBlockRange } from '../utils/events'
import { Address, Hex, pad, toEventSelector } from 'viem'
import { QueryResponse, Log } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { getHyperSyncClient } from '../../../utils'
import { BigNumber } from 'bignumber.js'
import { calculateKpi } from './index'

// Mock dependencies
jest.mock('../utils/events')
jest.mock('../../../utils/hypersyncPagination')
jest.mock('../../../utils')

const mockGetBlockRange = jest.mocked(getBlockRange)
const mockPaginateQuery = jest.mocked(paginateQuery)
const mockGetHyperSyncClient = jest.mocked(getHyperSyncClient)

// Mock the memoize function to disable memoization in tests
jest.mock('@github/memoize', () => ({
  __esModule: true,
  default: (fn: unknown) => fn,
}))

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

describe('Tether V0 Protocol KPI Calculation', () => {
  const mockClient = {
    get: jest.fn(),
  } as unknown as ReturnType<typeof getHyperSyncClient>
  const mockGetReferrerIdFromTx = jest.fn()

  const transferEventSigHash = toEventSelector(
    'Transfer(address,address,uint256)',
  )
  const testAddress = '0x1234567890123456789012345678901234567890' as Address
  const startTimestamp = new Date('2024-01-01T00:00:00Z')
  const endTimestampExclusive = new Date('2024-01-31T23:59:59Z')

  const defaultProps = {
    address: testAddress,
    startTimestamp,
    endTimestampExclusive,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetHyperSyncClient.mockReturnValue(mockClient)
    mockGetBlockRange.mockResolvedValue({
      startBlock: 1000,
      endBlockExclusive: 2000,
    })
    mockGetReferrerIdFromTx.mockResolvedValue('test-referrer')
  })

  describe('calculateKpi', () => {
    it('should calculate KPI across all supported networks', async () => {
      await calculateKpi(defaultProps)

      // Verify getBlockRange was called for each network
      expect(mockGetBlockRange).toHaveBeenCalledTimes(8)
    })

    it('should handle networks with no eligible transactions', async () => {
      // Mock paginateQuery to return no transactions
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([])
        await onPage(mockResponse)
      })

      const result = await calculateKpi(defaultProps)

      // Should return empty array when no eligible transactions
      expect(result).toEqual([])
    })

    it('should throw errors from getBlockRange', async () => {
      mockGetBlockRange.mockRejectedValue(new Error('Block range error'))

      await expect(calculateKpi(defaultProps)).rejects.toThrow(
        'Block range error',
      )
    })

    it('should throw errors from paginateQuery', async () => {
      mockPaginateQuery.mockRejectedValue(new Error('Query error'))

      await expect(calculateKpi(defaultProps)).rejects.toThrow('Query error')
    })
  })

  describe('getEligibleTxCount', () => {
    const encodedValueAboveThreshold = ('0x' +
      BigNumber(2).shiftedBy(6).toString(16).padStart(64, '0')) as Hex
    const encodedValueBelowThreshold = ('0x' +
      BigNumber(0.5).shiftedBy(6).toString(16).padStart(64, '0')) as Hex

    it('should count transactions with transfer value above minimum threshold', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      expect(result[0].kpi).toBeGreaterThan(0)
    })

    it('should not count transactions with transfer value below minimum threshold', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueBelowThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      expect(result.length).toBe(0)
    })

    it('should count each transaction only once even if it has multiple transfer events', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123', // Same transaction hash
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should count as 1 transaction per network, not 2
      expect(result[0].kpi).toBe(8)
    })

    it('should not count transactions with net transfer value below minimum threshold', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueAboveThreshold,
            // transfer out
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
          {
            data: encodedValueAboveThreshold,
            // transfer in
            topics: [
              transferEventSigHash,
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              pad(testAddress, { size: 32 }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123', // Same transaction hash
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should count as 0 transactions per network since the net transfer value is 0
      expect(result.length).toBe(0)
    })

    it('should handle both incoming and outgoing transfers', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          // Outgoing transfer (user as sender)
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
          // Incoming transfer (user as receiver)
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              pad(testAddress, { size: 32 }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xdef456',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should count both transactions (2 per network)
      expect(result[0].kpi).toBe(16)
    })

    it('should handle malformed log data gracefully', async () => {
      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: undefined, // Malformed data
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should handle gracefully and return empty array
      expect(result).toEqual([])
    })

    it('should group results by multiple referrers', async () => {
      const mockGetReferrerIdFromTx = jest
        .fn()
        .mockImplementation((txHash: Hex) => {
          if (txHash === '0xabc123') return 'referrer1'
          if (txHash === '0xdef456') return 'referrer2'
          if (txHash === '0xghi789') return 'referrer3'
          if (txHash === '0xjkl012') return 'referrer1'
        })

      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xdef456',
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xghi789',
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xjkl012',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should group by referrer ID: referrer1 has 2 transactions, referrer2 has 1, referrer3 has 1
      expect(result).toEqual([
        {
          kpi: 16, // 2 transactions * 8 networks
          referrerId: 'referrer1',
          userAddress: testAddress,
          metadata: {
            'ethereum-mainnet': 2,
            'avalanche-mainnet': 2,
            'celo-mainnet': 2,
            'unichain-mainnet': 2,
            'ink-mainnet': 2,
            'op-mainnet': 2,
            'arbitrum-one': 2,
            'berachain-mainnet': 2,
          },
        },
        {
          kpi: 8, // 1 transaction * 8 networks
          referrerId: 'referrer2',
          userAddress: testAddress,
          metadata: {
            'ethereum-mainnet': 1,
            'avalanche-mainnet': 1,
            'celo-mainnet': 1,
            'unichain-mainnet': 1,
            'ink-mainnet': 1,
            'op-mainnet': 1,
            'arbitrum-one': 1,
            'berachain-mainnet': 1,
          },
        },
        {
          kpi: 8, // 1 transaction * 8 networks
          referrerId: 'referrer3',
          userAddress: testAddress,
          metadata: {
            'ethereum-mainnet': 1,
            'avalanche-mainnet': 1,
            'celo-mainnet': 1,
            'unichain-mainnet': 1,
            'ink-mainnet': 1,
            'op-mainnet': 1,
            'arbitrum-one': 1,
            'berachain-mainnet': 1,
          },
        },
      ])
    })

    it('should filter out transactions with null referrerId', async () => {
      const mockGetReferrerIdFromTx = jest
        .fn()
        .mockImplementation((txHash: string) => {
          if (txHash === '0xabc123') return 'referrer1'
          if (txHash === '0xdef456') return null // This transaction should be filtered out
          if (txHash === '0xghi789') return 'referrer2'
          return null
        })

      mockPaginateQuery.mockImplementation(async (_client, _query, onPage) => {
        const mockResponse = makeQueryResponse([
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xabc123',
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xdef456', // This will return null referrerId
          },
          {
            data: encodedValueAboveThreshold,
            topics: [
              transferEventSigHash,
              pad(testAddress, { size: 32 }),
              pad('0x4567890123456789012345678901234567890123' as Address, {
                size: 32,
              }),
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            ],
            transactionHash: '0xghi789',
          },
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi({
        ...defaultProps,
        getReferrerIdFromTx: mockGetReferrerIdFromTx,
      })

      // Should only include transactions with valid referrer IDs
      expect(result).toEqual([
        {
          kpi: 8, // 1 transaction * 8 networks
          referrerId: 'referrer1',
          userAddress: testAddress,
          metadata: {
            'ethereum-mainnet': 1,
            'avalanche-mainnet': 1,
            'celo-mainnet': 1,
            'unichain-mainnet': 1,
            'ink-mainnet': 1,
            'op-mainnet': 1,
            'arbitrum-one': 1,
            'berachain-mainnet': 1,
          },
        },
        {
          kpi: 8, // 1 transaction * 8 networks
          referrerId: 'referrer2',
          userAddress: testAddress,
          metadata: {
            'ethereum-mainnet': 1,
            'avalanche-mainnet': 1,
            'celo-mainnet': 1,
            'unichain-mainnet': 1,
            'ink-mainnet': 1,
            'op-mainnet': 1,
            'arbitrum-one': 1,
            'berachain-mainnet': 1,
          },
        },
      ])
    })
  })
})
