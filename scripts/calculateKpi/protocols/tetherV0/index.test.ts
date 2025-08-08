import { getBlockRange } from '../utils/events'
import { Address, Hex, pad, toEventSelector } from 'viem'
import { QueryResponse, Log } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../../../utils/hypersyncPagination'
import { getHyperSyncClient, getViemPublicClient } from '../../../utils'
import { BigNumber } from 'bignumber.js'
import { calculateKpi } from './index'
import { getReferrerIdFromTx } from './parseReferralTag/getReferrerIdFromTx'

// Mock dependencies
jest.mock('../utils/events')
jest.mock('../../../utils/hypersyncPagination')
jest.mock('../../../utils')
jest.mock('./parseReferralTag/getReferrerIdFromTx')

const mockGetBlockRange = jest.mocked(getBlockRange)
const mockPaginateQuery = jest.mocked(paginateQuery)
const mockGetHyperSyncClient = jest.mocked(getHyperSyncClient)
const mockGetReferrerIdFromTx = jest.mocked(getReferrerIdFromTx)

const testAddress = '0x1234567890123456789012345678901234567890' as Address

// Mock the memoize function to disable memoization in tests
jest.mock('@github/memoize', () => ({
  __esModule: true,
  default: (fn: unknown) => fn,
}))

const makeQueryResponse = (logs: Log[], nextBlock = 100): QueryResponse => ({
  data: {
    blocks: [],
    transactions: logs.map((log) => ({
      hash: log.transactionHash,
      to: '0x0000000000000000000000000000000000000000',
      input: '0xdoesnotmatter',
      from: testAddress,
    })),
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

  const mockReadContract = jest.fn()
  jest.mocked(getViemPublicClient).mockReturnValue({
    readContract: mockReadContract,
  } as unknown as ReturnType<typeof getViemPublicClient>)

  const transferEventSigHash = toEventSelector(
    'Transfer(address,address,uint256)',
  )
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
    mockGetReferrerIdFromTx.mockResolvedValue({
      referrerId: 'test-referrer',
      user: testAddress,
    })
    mockReadContract.mockResolvedValue(true)
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

      const result = await calculateKpi(defaultProps)

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

      const result = await calculateKpi(defaultProps)

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

      const result = await calculateKpi(defaultProps)

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

      const result = await calculateKpi(defaultProps)

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

      const result = await calculateKpi(defaultProps)

      // Should count both transactions (2 per network)
      expect(result[0].kpi).toBe(16)
    })

    it('should filter out referrers who have not registered agreements with the campaign', async () => {
      // Mock getReferrerIdFromTx to return different referrers
      mockGetReferrerIdFromTx.mockImplementation(async (txHash: string) => {
        if (txHash === '0xabc123')
          return { referrerId: 'registered-referrer', user: testAddress }
        if (txHash === '0xdef456')
          return { referrerId: 'unregistered-referrer', user: testAddress }
        return null
      })

      // Mock registry contract to return false for unregistered referrer
      mockReadContract.mockImplementation(
        async (args: { args: [string, string] }) => {
          if (args.args[1] === 'unregistered-referrer') {
            return false
          }
          return true
        },
      )

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
        ])
        await onPage(mockResponse)
      })

      const result = await calculateKpi(defaultProps)

      // Should only include the registered referrer
      expect(result).toEqual([
        {
          kpi: 8, // 1 transaction * 8 networks
          referrerId: 'registered-referrer',
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

      // Should handle gracefully and return empty array
      expect(result).toEqual([])
    })

    it('should group results by multiple referrers', async () => {
      mockGetReferrerIdFromTx.mockImplementation(async (txHash: string) => {
        if (txHash === '0xabc123')
          return { referrerId: 'referrer1', user: testAddress }
        if (txHash === '0xdef456')
          return { referrerId: 'referrer2', user: testAddress }
        if (txHash === '0xghi789')
          return { referrerId: 'referrer3', user: testAddress }
        if (txHash === '0xjkl012')
          return { referrerId: 'referrer1', user: testAddress }
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

      const result = await calculateKpi(defaultProps)

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
      mockGetReferrerIdFromTx.mockImplementation(async (txHash: string) => {
        if (txHash === '0xabc123')
          return { referrerId: 'referrer1', user: testAddress }
        if (txHash === '0xdef456') return null // This transaction should be filtered out
        if (txHash === '0xghi789')
          return { referrerId: 'referrer2', user: testAddress }
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

      const result = await calculateKpi(defaultProps)

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
