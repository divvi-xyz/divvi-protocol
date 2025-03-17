import { calculateWeightedAveragePrice } from './dailySnapshots' // Adjust import as needed
import { DailySnapshot } from './types'

describe('calculateWeightedAveragePrice', () => {
  it('calculates average price for a simple time range', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T00:00:00Z'),
      new Date('2024-03-03T00:00:00Z'),
    )

    expect(avgPrice).toBeCloseTo(105)
  })

  it('handles partial periods with correct weighting', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T12:00:00Z'),
      new Date('2024-03-02T12:00:00Z'),
    )

    expect(avgPrice).toBeCloseTo(105)
  })
  it('handles simple time ranges where the start and end times are at noon', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T12:00:00Z'),
      new Date('2024-03-03T12:00:00Z'),
    )

    expect(avgPrice).toBeCloseTo(110)
  })

  it('handles a case where the end time is 18 hours after the last snapshot', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 1, timestamp: '2024-03-02T00:00:00Z' },
      { price_usd: 120, share_price: 1, timestamp: '2024-03-03T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T12:00:00Z'),
      new Date('2024-03-03T18:00:00Z'),
    )

    expect(avgPrice).toBeCloseTo(111.1111)
  })

  it('handles a single snapshot', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 150, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T00:00:00Z'),
      new Date('2024-03-01T23:59:59Z'),
    )

    expect(avgPrice).toBe(150)
  })

  it('correctly calculates price with varying share price', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
      { price_usd: 110, share_price: 2, timestamp: '2024-03-02T00:00:00Z' },
    ] as DailySnapshot[]

    const avgPrice = calculateWeightedAveragePrice(
      snapshots,
      new Date('2024-03-01T12:00:00Z'),
      new Date('2024-03-02T12:00:00Z'),
    )

    expect(avgPrice).toBeCloseTo((100 + 55) / 2)
  })

  it('throws an error if no snapshots are provided', () => {
    expect(() =>
      calculateWeightedAveragePrice(
        [],
        new Date('2024-03-01T00:00:00Z'),
        new Date('2024-03-02T00:00:00Z'),
      ),
    ).toThrow('No snapshots provided')
  })

  it('throws an error if startTimestamp is after endTimestamp', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]

    expect(() =>
      calculateWeightedAveragePrice(
        snapshots,
        new Date('2024-03-02T00:00:00Z'),
        new Date('2024-03-01T00:00:00Z'),
      ),
    ).toThrow('Invalid timestamps provided')
  })

  it('throws an error if no snapshots are in the time range', () => {
    const snapshots: DailySnapshot[] = [
      { price_usd: 100, share_price: 1, timestamp: '2024-03-01T00:00:00Z' },
    ] as DailySnapshot[]

    expect(() =>
      calculateWeightedAveragePrice(
        snapshots,
        new Date('2024-03-02T00:00:00Z'),
        new Date('2024-03-03T00:00:00Z'),
      ),
    ).toThrow('No snapshots in range')
  })
})
