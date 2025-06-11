import { KpiRow } from '../../src/resultDirectory'

export function getReferrerMetricsFromKpi(kpi: KpiRow[]) {
  const referrerReferrals: Record<string, number> = {}
  const referrerKpis: Record<string, bigint> = {}
  let totalKpi = BigInt(0)

  kpi.forEach((row) => {
    if (!referrerReferrals[row.referrerId]) {
      referrerReferrals[row.referrerId] = 0
    }
    referrerReferrals[row.referrerId]++

    if (referrerKpis[row.referrerId] === undefined) {
      referrerKpis[row.referrerId] = BigInt(0)
    }
    referrerKpis[row.referrerId] += BigInt(row.kpi)

    totalKpi += BigInt(row.kpi)
  })

  return { referrerReferrals, referrerKpis, totalKpi }
}
