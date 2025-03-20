import {
  calculateWeightedAveragePrice,
  getDailySnapshots,
} from './dailySnapshots' // Adjust import as needed
import { DailySnapshot } from './types'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'
import { NetworkId } from '../../../types'

jest.mock('../../../utils/fetchWithTimeout')

describe('calculateWeightedAveragePrice', () => {
  it('calculates average price for a simple time range', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T00:00:00Z'),
      endTimestamp: new Date('2024-03-03T00:00:00Z'),
    })

    expect(avgPrice).toBeCloseTo(105)
  })

  it('handles partial periods with correct weighting', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T12:00:00Z'),
      endTimestamp: new Date('2024-03-02T12:00:00Z'),
    })

    expect(avgPrice).toBeCloseTo(105)
  })

  it('handles simple time ranges where the start and end times are at noon', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T12:00:00Z'),
      endTimestamp: new Date('2024-03-03T12:00:00Z'),
    })

    expect(avgPrice).toBeCloseTo(110)
  })

  it('handles a case where the end time is 18 hours after the last snapshot', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T12:00:00Z'),
      endTimestamp: new Date('2024-03-03T18:00:00Z'),
    })

    expect(avgPrice).toBeCloseTo(111.1111)
  })

  it('handles a single snapshot', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 150, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T00:00:00Z'),
      endTimestamp: new Date('2024-03-01T23:59:59Z'),
    })

    expect(avgPrice).toBe(150)
  })

  it('correctly calculates price with varying share price', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 2, timestamp: '2024-03-02T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice({
      snapshots,
      startTimestamp: new Date('2024-03-01T12:00:00Z'),
      endTimestamp: new Date('2024-03-02T12:00:00Z'),
    })

    expect(avgPrice).toBeCloseTo((100 + 55) / 2)
  })

  it('throws an error if no snapshots are provided', () => {
    expect(() =>
      calculateWeightedAveragePrice({
        snapshots: [],
        startTimestamp: new Date('2024-03-01T00:00:00Z'),
        endTimestamp: new Date('2024-03-02T00:00:00Z'),
      }),
    ).toThrow('No snapshots provided')
  })

  it('throws an error if startTimestamp is after endTimestamp', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]

    expect(() =>
      calculateWeightedAveragePrice({
        snapshots,
        startTimestamp: new Date('2024-03-02T00:00:00Z'),
        endTimestamp: new Date('2024-03-01T00:00:00Z'),
      }),
    ).toThrow('Invalid timestamps provided')
  })
})

describe('getDailySnapshots', () => {
  const params = {
    vaultAddress: '0x123',
    networkId: NetworkId['arbitrum-one'],
  }
  it('throws an error if start time is before the first snapshot', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
    ] as DailySnapshot[]

    jest.mocked(fetchWithTimeout).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue(snapshots),
        }) as unknown as ReturnType<typeof fetchWithTimeout>,
    )

    expect(() =>
      getDailySnapshots({
        startTimestamp: new Date('2024-03-01T00:00:00Z'),
        endTimestamp: new Date('2024-03-02T00:00:00Z'),
        ...params,
      }),
    ).rejects.toThrow('Start time is before the first snapshot')
  })

  it('throws an error if end time is after the last snapshot plus 24 hours', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]
    jest.mocked(fetchWithTimeout).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue(snapshots),
        }) as unknown as ReturnType<typeof fetchWithTimeout>,
    )

    expect(() =>
      getDailySnapshots({
        startTimestamp: new Date('2024-03-01T00:00:00Z'),
        endTimestamp: new Date('2024-03-03T00:00:01Z'),
        ...params,
      }),
    ).rejects.toThrow('End time is after the last snapshot')
  })

  it('throws an error if there are missing snapshots', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]
    jest.mocked(fetchWithTimeout).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue(snapshots),
        }) as unknown as ReturnType<typeof fetchWithTimeout>,
    )

    expect(() =>
      getDailySnapshots({
        startTimestamp: new Date('2024-03-01T00:00:00Z'),
        endTimestamp: new Date('2024-03-03T00:00:00Z'),
        ...params,
      }),
    ).rejects.toThrow('Missing snapshots')
  })
})
