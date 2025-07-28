import { KpiRow } from './resultDirectory'

export function getUserMetricsFromKpi(kpi: KpiRow[]) {
  const userReferrals: Record<string, number> = {}
  const userKpis: Record<string, bigint> = {}

  kpi.forEach((row) => {
    if (!(row.userAddress in userReferrals)) {
      userReferrals[row.userAddress] = 0
      userKpis[row.userAddress] = BigInt(0)
    }
    userReferrals[row.userAddress]++
    userKpis[row.userAddress] += BigInt(row.kpi)
  })

  return { userReferrals, userKpis }
}
