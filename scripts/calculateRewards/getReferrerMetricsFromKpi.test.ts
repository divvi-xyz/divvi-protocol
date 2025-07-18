import { getReferrerMetricsFromKpi } from './getReferrerMetricsFromKpi'
import { KpiRow } from '../../src/resultDirectory'

describe('getReferrerMetricsFromKpi', () => {
  it('should handle empty KPI array', () => {
    const result = getReferrerMetricsFromKpi([])
    expect(result).toEqual({
      referrerReferrals: {},
      referrerKpis: {},
    })
  })

  it('should calculate metrics for multiple referrers', () => {
    const kpi: KpiRow[] = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '100' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '200' },
      { referrerId: 'ref1', userAddress: 'user3', kpi: '300' },
      { referrerId: 'ref3', userAddress: 'user4', kpi: '400' },
    ]

    const result = getReferrerMetricsFromKpi(kpi)
    expect(result).toEqual({
      referrerReferrals: {
        ref1: 2,
        ref2: 1,
        ref3: 1,
      },
      referrerKpis: {
        ref1: BigInt(400),
        ref2: BigInt(200),
        ref3: BigInt(400),
      },
    })
  })
})
