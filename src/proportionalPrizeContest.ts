import BigNumber from 'bignumber.js'
import { getReferrerMetricsFromKpi } from '../scripts/calculateRewards/getReferrerMetricsFromKpi'

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
  const { referrerReferrals, referrerKpis, totalKpi } =
    getReferrerMetricsFromKpi(kpiData)

  const rewardsPerReferrer = Object.entries(referrerKpis).map(
    ([referrerId, kpi]) => {
      return {
        referrerId,
        kpi,
        numReferrals: referrerReferrals[referrerId],
        rewardAmount: rewards
          .times(kpi)
          .div(totalKpi === BigInt(0) ? BigInt(1) : totalKpi)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}

export function calculateSqrtProportionalPrizeContest({
  kpiData,
  rewards,
}: {
  kpiData: KpiRow[]
  rewards: BigNumber
}) {
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  const referrerPowerKpis = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = BigNumber(kpi).sqrt()
      return acc
    },
    {} as Record<string, BigNumber>,
  )

  const totalPower = Object.values(referrerPowerKpis).reduce(
    (sum, value) => sum.plus(value),
    BigNumber(0),
  )

  const rewardsPerReferrer = Object.entries(referrerPowerKpis).map(
    ([referrerId, powerKpi]) => {
      const proportion = BigNumber(powerKpi).div(totalPower)
      const rewardAmount = rewards.times(proportion)

      return {
        referrerId,
        kpi: referrerKpis[referrerId],
        numReferrals: referrerReferrals[referrerId],
        rewardAmount: rewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}
