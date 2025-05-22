import { _calculateKpiBatch } from './calculateKpi'

const mockHandler = jest.fn()
jest.mock('./calculateKpi/protocols', () => ({
  __esModule: true,
  default: {
    'celo-transactions': (...args: unknown[]) => mockHandler(...args),
  },
}))

describe('_calculateKpiBatch', () => {
  mockHandler.mockImplementation(async ({ address }) => {
    return address === '0x123' ? 100 : 50
  })

  const startTimestamp = new Date('2024-01-01T00:00:00Z')
  const endTimestampExclusive = new Date('2024-01-31T23:59:59Z')
  const defaultArgs = {
    eligibleUsers: [],
    handler: mockHandler,
    batchSize: 2,
    startTimestamp,
    endTimestampExclusive,
    protocol: 'celo-transactions' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

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

  it('should skip users with referral dates after end timestamp', async () => {
    const eligibleUsers = [
      {
        referrerId: 'ref1',
        userAddress: '0x123',
        timestamp: '2024-02-01T01:00:00Z',
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
    })
  })

  it('should handle empty user list', async () => {
    const results = await _calculateKpiBatch({
      ...defaultArgs,
      eligibleUsers: [],
    })

    expect(results).toHaveLength(0)
  })

  it('should handle handler errors gracefully', async () => {
    mockHandler.mockImplementation(async ({ address }) => {
      if (address === '0x123') {
        throw new Error('Handler error')
      }
      return 100
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
