import { KpiRow } from '../../src/resultDirectory'

export function getReferrerMetricsFromKpi(kpi: KpiRow[]) {
  const referrerReferrals: Record<string, number> = {}
  const referrerKpis: Record<string, bigint> = {}

  kpi.forEach((row) => {
    if (!(row.referrerId in referrerReferrals)) {
      referrerReferrals[row.referrerId] = 0
      referrerKpis[row.referrerId] = BigInt(0)
    }
    referrerReferrals[row.referrerId]++
    referrerKpis[row.referrerId] += BigInt(row.kpi)
  })

  return { referrerReferrals, referrerKpis }
}
