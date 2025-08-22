import { _calculateKpiBatch } from './calculateKpi'

const mockHandler = jest.fn()
const mockBatchHandler = jest.fn()

jest.mock('./calculateKpi/protocols', () => ({
  __esModule: true,
  default: {
    'celo-transactions': (...args: unknown[]) => mockHandler(...args),
    'tether-v0': (...args: unknown[]) => mockHandler(...args),
  },
  calculateKpiBatchHandlers: {
    'tether-v0': (...args: unknown[]) => mockBatchHandler(...args),
  },
}))

describe('_calculateKpiBatch', () => {
  mockHandler.mockImplementation(async ({ address }) => {
    return { kpi: address === '0x123' ? 100 : 50 }
  })

  mockBatchHandler.mockImplementation(
    async ({ users, referralTimestamps, referrerIds }) => {
      return users.map((user: string, index: number) => ({
        userAddress: user,
        referrerId: referrerIds[index],
        kpi: user === '0x123' ? 100 : 50,
        metadata: { referralTimestamp: referralTimestamps[index] },
      }))
    },
  )

  const startTimestamp = new Date('2024-01-01T00:00:00Z')
  const endTimestampExclusive = new Date('2024-01-31T23:59:59Z')
  const defaultArgs = {
    eligibleUsers: [],
    batchSize: 2,
    startTimestamp,
    endTimestampExclusive,
    protocol: 'celo-transactions' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('per-user processing', () => {
    it('should process users in batches and return correct KPI results', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-01-15T00:00:00Z',
        },
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-01-15T00:00:00Z',
        },
        {
          referrerId: 'ref3',
          userAddress: '0x789',
          timestamp: '2024-01-15T00:00:00Z',
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        eligibleUsers,
        batchSize: 2, // less than the number of eligible users
      })

      expect(results).toEqual([
        { referrerId: 'ref1', userAddress: '0x123', kpi: 100 },
        { referrerId: 'ref2', userAddress: '0x456', kpi: 50 },
        { referrerId: 'ref3', userAddress: '0x789', kpi: 50 },
      ])
      expect(mockHandler).toHaveBeenCalledTimes(3)
    })

    it('should skip users with referral dates at or after end timestamp', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-02-01T00:29:59Z',
        }, // At end date, accounting for the buffer
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-02-01T00:30:00Z',
        }, // After end date, accounting for the buffer
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-01-15T00:00:00Z',
        }, // Within range
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        eligibleUsers,
      })

      expect(results).toEqual([
        { referrerId: 'ref2', userAddress: '0x456', kpi: 50 },
      ])
      expect(mockHandler).toHaveBeenCalledTimes(1)
    })

    it('should use referral timestamp as start time if it is after period start', async () => {
      const referralDate = new Date('2024-01-15T00:00:00Z')
      const expectedStartTime = new Date('2024-01-14T23:30:00Z') // referral date minus buffer
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: referralDate.toISOString(),
        },
      ]

      await _calculateKpiBatch({
        ...defaultArgs,
        eligibleUsers,
      })
      expect(mockHandler).toHaveBeenCalledWith({
        address: '0x123',
        startTimestamp: expectedStartTime,
        endTimestampExclusive,
        referrerId: 'ref1',
      })
    })

    it('should use period start time if referral including buffer is before period start', async () => {
      const referralDate = new Date('2023-01-01T00:10:00Z') // Would be before period start if not for buffer
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: referralDate.toISOString(),
        },
      ]

      await _calculateKpiBatch({
        ...defaultArgs,
        eligibleUsers,
      })
      expect(mockHandler).toHaveBeenCalledWith({
        address: '0x123',
        startTimestamp,
        endTimestampExclusive,
        referrerId: 'ref1',
      })
    })

    it('should handle empty user list', async () => {
      const results = await _calculateKpiBatch({
        ...defaultArgs,
        eligibleUsers: [],
      })

      expect(results).toHaveLength(0)
    })

    it('should fail the whole function if there is an error for any user', async () => {
      mockHandler.mockImplementation(async ({ address }) => {
        if (address === '0x123') {
          throw new Error('Handler error')
        }
        return { kpi: 100 }
      })
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-01-15T00:00:00Z',
        },
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-01-15T00:00:00Z',
        },
      ]

      await expect(
        _calculateKpiBatch({
          ...defaultArgs,
          eligibleUsers,
        }),
      ).rejects.toThrow('Handler error')
    })
  })

  describe('batch processing (with batch handler)', () => {
    it('should use batch handler when available for protocol', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-01-15T00:00:00Z',
        },
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-01-15T00:00:00Z',
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 2,
      })

      expect(results).toEqual([
        {
          userAddress: '0x123',
          referrerId: 'ref1',
          kpi: 100,
          metadata: { referralTimestamp: expect.any(Date) },
        },
        {
          userAddress: '0x456',
          referrerId: 'ref2',
          kpi: 50,
          metadata: { referralTimestamp: expect.any(Date) },
        },
      ])
      expect(mockBatchHandler).toHaveBeenCalledTimes(1)
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should filter out users with referral dates at or after end timestamp in batch mode', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-02-01T00:29:59Z', // At end date with buffer
        },
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-02-01T00:30:00Z', // After end date with buffer
        },
        {
          referrerId: 'ref3',
          userAddress: '0x789',
          timestamp: '2024-01-15T00:00:00Z', // Within range
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 2,
      })

      expect(results).toEqual([
        {
          userAddress: '0x789',
          referrerId: 'ref3',
          kpi: 50,
          metadata: { referralTimestamp: expect.any(Date) },
        },
      ])
      expect(mockBatchHandler).toHaveBeenCalledTimes(1)
      expect(mockBatchHandler).toHaveBeenCalledWith({
        users: ['0x789'],
        referralTimestamps: [expect.any(Date)],
        referrerIds: ['ref3'],
        startTimestamp,
        endTimestampExclusive,
        redis: undefined,
        index: 0,
      })
    })

    it('should deduplicate users by address keeping first occurrence', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-01-10T00:00:00Z', // First occurrence
        },
        {
          referrerId: 'ref2',
          userAddress: '0x123', // Duplicate address
          timestamp: '2024-01-15T00:00:00Z', // Later occurrence
        },
        {
          referrerId: 'ref3',
          userAddress: '0x456',
          timestamp: '2024-01-20T00:00:00Z',
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 2,
      })

      expect(results).toEqual([
        {
          userAddress: '0x123',
          referrerId: 'ref1',
          kpi: 100,
          metadata: { referralTimestamp: expect.any(Date) },
        },
        {
          userAddress: '0x456',
          referrerId: 'ref3',
          kpi: 50,
          metadata: { referralTimestamp: expect.any(Date) },
        },
      ])

      // Should only call batch handler once with deduplicated users
      expect(mockBatchHandler).toHaveBeenCalledTimes(1)
      expect(mockBatchHandler).toHaveBeenCalledWith({
        users: ['0x123', '0x456'],
        referralTimestamps: [expect.any(Date), expect.any(Date)],
        referrerIds: ['ref1', 'ref3'],
        startTimestamp,
        endTimestampExclusive,
        redis: undefined,
        index: 0,
      })
    })

    it('should process large batches correctly with hypersync batch size', async () => {
      // Create more users than the hypersync batch size (100)
      const eligibleUsers = Array.from({ length: 250 }, (_, i) => ({
        referrerId: `ref${i}`,
        userAddress: `0x${i.toString().padStart(3, '0')}`,
        timestamp: '2024-01-15T00:00:00Z',
      }))

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 3, // 3 parallel requests
      })

      expect(results).toHaveLength(250)

      // Should call batch handler multiple times due to hypersync batch size limit
      // 250 users processed in 3 batches: 100 + 100 + 50
      expect(mockBatchHandler).toHaveBeenCalledTimes(3)

      // First batch should have 100 users
      expect(mockBatchHandler).toHaveBeenNthCalledWith(1, {
        users: expect.arrayContaining([expect.stringMatching(/^0x\d{3}$/)]),
        referralTimestamps: expect.arrayContaining([expect.any(Date)]),
        referrerIds: expect.arrayContaining([
          expect.stringMatching(/^ref\d+$/),
        ]),
        startTimestamp,
        endTimestampExclusive,
        redis: undefined,
        index: 0,
      })

      // Second batch should have users 100-199
      expect(mockBatchHandler).toHaveBeenNthCalledWith(2, {
        users: expect.arrayContaining([expect.stringMatching(/^0x\d{3}$/)]),
        referralTimestamps: expect.arrayContaining([expect.any(Date)]),
        referrerIds: expect.arrayContaining([
          expect.stringMatching(/^ref\d+$/),
        ]),
        startTimestamp,
        endTimestampExclusive,
        redis: undefined,
        index: 100,
      })
    })

    it('should handle empty batches gracefully', async () => {
      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-02-01T00:30:00Z', // After end date, will be filtered out
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 2,
      })

      expect(results).toHaveLength(0)
      expect(mockBatchHandler).not.toHaveBeenCalled()
    })

    it('should handle batch handler returning array results', async () => {
      mockBatchHandler.mockImplementation(
        async ({ users, referralTimestamps, referrerIds }) => {
          return users.map((user: string, index: number) => ({
            userAddress: user,
            referrerId: referrerIds[index],
            kpi: user === '0x123' ? 100 : 50,
            metadata: { referralTimestamp: referralTimestamps[index] },
          }))
        },
      )

      const eligibleUsers = [
        {
          referrerId: 'ref1',
          userAddress: '0x123',
          timestamp: '2024-01-15T00:00:00Z',
        },
        {
          referrerId: 'ref2',
          userAddress: '0x456',
          timestamp: '2024-01-15T00:00:00Z',
        },
      ]

      const results = await _calculateKpiBatch({
        ...defaultArgs,
        protocol: 'tether-v0',
        eligibleUsers,
        batchSize: 2,
      })

      expect(results).toEqual([
        {
          userAddress: '0x123',
          referrerId: 'ref1',
          kpi: 100,
          metadata: { referralTimestamp: expect.any(Date) },
        },
        {
          userAddress: '0x456',
          referrerId: 'ref2',
          kpi: 50,
          metadata: { referralTimestamp: expect.any(Date) },
        },
      ])
    })
  })
})
