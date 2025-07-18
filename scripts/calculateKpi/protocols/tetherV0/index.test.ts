import { NetworkId } from '../../../types'
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

  const transferEventSigHash = toEventSelector(
    'Transfer(address,address,uint256)',
  )
  const testAddress = '0x1234567890123456789012345678901234567890' as Address
  const startTimestamp = new Date('2024-01-01T00:00:00Z')
  const endTimestampExclusive = new Date('2024-01-31T23:59:59Z')
  const testReferrerId = 'test-referrer-id'

  const defaultProps = {
    address: testAddress,
    startTimestamp,
    endTimestampExclusive,
    referrerId: testReferrerId,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetHyperSyncClient.mockReturnValue(mockClient)
    mockGetBlockRange.mockResolvedValue({
      startBlock: 1000,
      endBlockExclusive: 2000,
    })
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

      expect(result).toEqual({
        [testReferrerId]: {
          referrerId: testReferrerId,
          kpi: 0,
          metadata: {
            [NetworkId['ethereum-mainnet']]: 0,
            [NetworkId['avalanche-mainnet']]: 0,
            [NetworkId['celo-mainnet']]: 0,
            [NetworkId['unichain-mainnet']]: 0,
            [NetworkId['ink-mainnet']]: 0,
            [NetworkId['op-mainnet']]: 0,
            [NetworkId['arbitrum-one']]: 0,
            [NetworkId['berachain-mainnet']]: 0,
          },
        },
      })
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

      const result = await calculateKpi(defaultProps)

      expect(result[testReferrerId].kpi).toBeGreaterThan(0)
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

      const result = await calculateKpi(defaultProps)

      expect(result[testReferrerId].kpi).toBe(0)
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

      const result = await calculateKpi(defaultProps)

      // Should count as 1 transaction per network, not 2
      expect(result[testReferrerId].kpi).toBe(8)
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

      const result = await calculateKpi(defaultProps)

      // Should count as 0 transactions per network since the net transfer value is 0
      expect(result[testReferrerId].kpi).toBe(0)
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

      const result = await calculateKpi(defaultProps)

      // Should count both transactions (2 per network)
      expect(result[testReferrerId].kpi).toBe(16)
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

      const result = await calculateKpi(defaultProps)

      // Should handle gracefully and return 0
      expect(result[testReferrerId].kpi).toBe(0)
    })
  })
})
