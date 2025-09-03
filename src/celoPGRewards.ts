import { KpiRow } from './resultDirectory'
import { BigNumber } from 'bignumber.js'
import { getReferrerMetricsFromKpi } from '../scripts/calculateRewards/getReferrerMetricsFromKpi'

function calculateStage({
  uniqueWallets,
  gasUsage,
}: {
  uniqueWallets: number
  gasUsage: bigint
}) {
  if (uniqueWallets >= 1_000_000 && gasUsage >= 100_000_000_000n) {
    return 4
  } else if (uniqueWallets >= 10_000 && gasUsage >= 50_000_000_000n) {
    return 3
  } else if (uniqueWallets >= 2_500 && gasUsage >= 10_000_000_000n) {
    return 2
  } else if (uniqueWallets >= 100 && gasUsage >= 1_000_000_000n) {
    return 1
  } else {
    return 0
  }
}

export function calculateRewards({
  kpiData,
  rewards,
  excludedReferrers,
  stageBonusRatio = 0.2, // 20% for stage bonuses, 80% for base rewards
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
  stageBonusRatio?: number
}) {
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  // Split reward pools
  const baseRewardPool = rewards.times(1 - stageBonusRatio)
  const stageBonusPool = rewards.times(stageBonusRatio)

  // Calculate base rewards using existing sqrt formula
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

  // Calculate stage weights and total stage weight
  const referrerStages = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = calculateStage({
        uniqueWallets: referrerReferrals[referrerId],
        gasUsage: kpi,
      })
      return acc
    },
    {} as Record<string, number>,
  )

  const totalStageWeight = Object.entries(referrerStages).reduce(
    (sum, [referrerId, stage]) => {
      if (referrerId.toLowerCase() in excludedReferrers) {
        return sum
      }
      // Only qualified stages (1+) get stage bonuses. Stage 0 gets weight 0.
      return sum + stage
    },
    0,
  )

  const rewardsPerReferrer = Object.entries(referrerKpis).map(
    ([referrerId, kpi]) => {
      const isExcluded = referrerId.toLowerCase() in excludedReferrers
      const stage = referrerStages[referrerId]

      // Calculate pure sqrt reward for comparison (full pool, no stage logic)
      const sqrtOnlyProportion = isExcluded
        ? BigNumber(0)
        : referrerPowerKpis[referrerId].div(totalPower)
      const sqrtOnlyReward = rewards.times(sqrtOnlyProportion)

      // Calculate base reward (e.g. 80% of total pool if stageBonusRatio is 0.2)
      const baseProportion = isExcluded
        ? BigNumber(0)
        : referrerPowerKpis[referrerId].div(totalPower)
      const baseReward = baseRewardPool.times(baseProportion)

      // Calculate stage bonus (e.g. 20% of total pool if stageBonusRatio is 0.2)
      // Only qualified stages (1+) get stage bonuses. Stage 0 gets 0.
      const stageProportion =
        isExcluded || totalStageWeight === 0 || stage === 0
          ? BigNumber(0)
          : BigNumber(stage).div(totalStageWeight)
      const stageBonus = stageBonusPool.times(stageProportion)

      const totalReward = baseReward.plus(stageBonus)

      return {
        referrerId,
        kpi,
        referralCount: referrerReferrals[referrerId],
        uniqueWallets: referrerReferrals[referrerId],
        gasUsage: kpi,
        stage,
        sqrtOnlyReward: sqrtOnlyReward.toFixed(0, BigNumber.ROUND_DOWN),
        baseReward: baseReward.toFixed(0, BigNumber.ROUND_DOWN),
        stageBonus: stageBonus.toFixed(0, BigNumber.ROUND_DOWN),
        rewardAmount: totalReward.toFixed(0, BigNumber.ROUND_DOWN),
      }
    },
  )

  return rewardsPerReferrer
}
