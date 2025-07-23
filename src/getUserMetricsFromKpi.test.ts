import { getUserMetricsFromKpi } from './getUserMetricsFromKpi'
import { KpiRow } from './resultDirectory'

describe('getUserMetricsFromKpi', () => {
  it('should handle empty KPI array', () => {
    const result = getUserMetricsFromKpi([])
    expect(result).toEqual({
      userReferrals: {},
      userKpis: {},
    })
  })

  it('should calculate metrics for multiple users', () => {
    const kpi: KpiRow[] = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '100' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '200' },
      { referrerId: 'ref1', userAddress: 'user1', kpi: '300' },
      { referrerId: 'ref3', userAddress: 'user3', kpi: '400' },
    ]

    const result = getUserMetricsFromKpi(kpi)
    expect(result).toEqual({
      userReferrals: {
        user1: 2,
        user2: 1,
        user3: 1,
      },
      userKpis: {
        user1: BigInt(400),
        user2: BigInt(200),
        user3: BigInt(400),
      },
    })
  })
})
