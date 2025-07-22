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
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  let totalKpi = BigInt(0)
  for (const kpi of Object.values(referrerKpis)) {
    totalKpi += kpi
  }

  const rewardsPerReferrer = Object.entries(referrerKpis).map(
    ([referrerId, kpi]) => {
      if (totalKpi === BigInt(0)) {
        return {
          referrerId,
          kpi: 0n,
          referralCount: referrerReferrals[referrerId],
          rewardAmount: '0',
        }
      }
      return {
        referrerId,
        kpi,
        referralCount: referrerReferrals[referrerId],
        rewardAmount: rewards
          .times(kpi)
          .div(totalKpi)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}

export function calculateSqrtProportionalPrizeContest({
  kpiData,
  rewards,
  excludedReferrers,
}: {
  kpiData: KpiRow[]
  rewards: BigNumber
  excludedReferrers: Record<
    string,
    {
      referrerId: string
      shouldWarn?: boolean
    }
  >
}) {
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  const referrerPowerKpis = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = BigNumber(kpi).sqrt()
      return acc
    },
    {} as Record<string, BigNumber>,
  )

  const totalPower = Object.entries(referrerPowerKpis).reduce(
    (sum, [referrerId, value]) => {
      // exclude referrers in the exclude list
      if (referrerId.toLowerCase() in excludedReferrers) {
        if (excludedReferrers[referrerId].shouldWarn) {
          console.warn(
            `⚠️ Flagged address ${referrerId} is a referrer, they will be excluded from campaign rewards.`,
          )
        } else {
          console.log(
            `Excluded referrer ${referrerId} kpi's are ignored for reward calculations.`,
          )
        }
        return sum
      }

      return sum.plus(value)
    },
    BigNumber(0),
  )

  const rewardsPerReferrer = Object.entries(referrerPowerKpis).map(
    ([referrerId, powerKpi]) => {
      const proportion =
        referrerId.toLowerCase() in excludedReferrers
          ? BigNumber(0)
          : BigNumber(powerKpi).div(totalPower)
      const rewardAmount = rewards.times(proportion)

      return {
        referrerId,
        kpi: referrerKpis[referrerId],
        referralCount: referrerReferrals[referrerId],
        rewardAmount: rewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}
