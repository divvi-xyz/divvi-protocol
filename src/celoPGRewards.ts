import { KpiRow } from './resultDirectory'
import { BigNumber } from 'bignumber.js'
import { getReferrerMetricsFromKpi } from '../scripts/calculateRewards/getReferrerMetricsFromKpi'

export function calculateStage({ uniqueWallets, gasUsage }: { uniqueWallets: number, gasUsage: bigint }) {
  if (uniqueWallets >= 1000000 && gasUsage >= 100000000000n) {
    return 4
  } else if (uniqueWallets >= 10000 && gasUsage >= 50000000000n) {
    return 3
  } else if (uniqueWallets >= 2500 && gasUsage >= 10000000000n) {
    return 2
  } else if (uniqueWallets >= 100 && gasUsage >= 1000000000n) {
    return 1
  } else {
    return 0
  }
}

export function calculateRewards({
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
        if (excludedReferrers[referrerId.toLowerCase()].shouldWarn) {
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
        uniqueWallets: referrerReferrals[referrerId],
        gasUsage: referrerKpis[referrerId],
        stage: calculateStage({ uniqueWallets: referrerReferrals[referrerId], gasUsage: referrerKpis[referrerId] }),
        rewardAmount: rewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}
