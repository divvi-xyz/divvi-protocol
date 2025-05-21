import BigNumber from 'bignumber.js'

interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
}

export function calculateProportionalPrizeContest({
  kpiData,
  rewards,
}: {
  kpiData: KpiRow[]
  rewards: BigNumber
}) {
  const referrerKpis = kpiData
    // filter out rows with no KPI, which is possible for users who were referred between the reward period end date and the time of the reward distribution
    .filter((row) => BigInt(row.kpi) > 0)
    .reduce(
      (acc, row) => {
        if (!(row.referrerId in acc)) {
          acc[row.referrerId] = BigInt(row.kpi)
        } else {
          acc[row.referrerId] += BigInt(row.kpi)
        }
        return acc
      },
      {} as Record<string, bigint>,
    )

  const total = Object.values(referrerKpis).reduce(
    (sum, value) => sum + value,
    BigInt(0),
  )

  const rewardsPerReferrer = Object.entries(referrerKpis).map(
    ([referrerId, kpi]) => {
      return {
        referrerId,
        rewardAmount: rewards
          .times(kpi)
          .div(total)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}
