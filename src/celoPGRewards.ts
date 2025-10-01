import { KpiRow } from './resultDirectory'
import { BigNumber } from 'bignumber.js'
import { getReferrerMetricsFromKpi } from '../scripts/calculateRewards/getReferrerMetricsFromKpi'

//
// Consider these stage values "internal" or "private" (they're not necessarily
// what we show builders, etc.)
//
// Sometimes we map the stages we calculate below to different values before
// displaying them. E.g., we calculate stage 1, but display it as 0; or we
// calculate stage 0, but display it as N/A.
//
export function calculateStageV0({
  uniqueWallets,
  gasUsage,
  isExcludedReferrer,
}: {
  uniqueWallets: number
  gasUsage: bigint
  isExcludedReferrer: boolean
}) {
  if (isExcludedReferrer) {
    return 0
  }

  if (uniqueWallets >= 1_000_000 && gasUsage >= 50_000_000_000n) {
    return 4
  } else if (uniqueWallets >= 10_000 && gasUsage >= 25_000_000_000n) {
    return 3
  } else if (uniqueWallets >= 2_500 && gasUsage >= 5_000_000_000n) {
    return 2
  } else if (uniqueWallets >= 100 && gasUsage >= 500_000_000n) {
    return 1
  } else {
    return 0
  }
}

export function calculateStageV1({
  uniqueWallets,
  gasUsage,
  isExcludedReferrer,
}: {
  uniqueWallets: number
  gasUsage: bigint
  isExcludedReferrer: boolean
}) {
  if (isExcludedReferrer) {
    return 0
  }

  if (uniqueWallets >= 100_000 && gasUsage >= 500_000_000_000n) {
    return 5
  } else if (uniqueWallets >= 10_000 && gasUsage >= 25_000_000_000n) {
    return 4
  } else if (uniqueWallets >= 2_500 && gasUsage >= 2_500_000_000n) {
    return 3
  } else if (uniqueWallets >= 100 && gasUsage >= 250_000_000n) {
    return 2
  } else if (uniqueWallets >= 10 && gasUsage >= 50_000_000n) {
    return 1
  } else {
    return 0
  }
}

export function calculateRewards({
  kpiData,
  rewards,
  excludedReferrers,
  stageFunction,
  previousStageData = [],
  stageBonusRatio = 0.25, // 25% for stage bonuses, 75% for base rewards
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
  stageFunction: ({
    uniqueWallets,
    gasUsage,
    isExcludedReferrer,
  }: {
    uniqueWallets: number
    gasUsage: bigint
    isExcludedReferrer: boolean
  }) => number
  previousStageData: KpiRow[][]
  stageBonusRatio?: number
}) {
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)
  const {
    referrerReferrals: stageReferrerReferrals,
    referrerKpis: stageReferrerKpis,
  } = getReferrerMetricsFromKpi([...kpiData, ...previousStageData.flat()])

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

  // Calculate stage for each referrer once
  const referrerStages = Object.entries(stageReferrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      const uniqueWallets = stageReferrerReferrals[referrerId]
      const gasUsage = kpi

      acc[referrerId] = {
        stage: stageFunction({
          uniqueWallets,
          gasUsage,
          isExcludedReferrer: referrerId.toLowerCase() in excludedReferrers,
        }),
        uniqueWallets,
        gasUsage,
      }
      return acc
    },
    {} as Record<
      string,
      { stage: number; uniqueWallets: number; gasUsage: bigint }
    >,
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

      // exclude stage 0 referrers from all rewards
      const stage = referrerStages[referrerId].stage
      if (stage === 0) {
        return sum
      }

      return sum.plus(value)
    },
    BigNumber(0),
  )

  const totalStageWeight = Object.entries(referrerStages).reduce(
    (sum, [referrerId, { stage }]) => {
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
      const {
        stage,
        uniqueWallets: uniqueWalletsForStageCalculation,
        gasUsage: gasUsageForStageCalculation,
      } = referrerStages[referrerId]

      // Calculate pure sqrt reward for comparison (full pool, no stage logic)
      // Stage 0 gets no rewards at all
      const sqrtOnlyProportion =
        isExcluded || stage === 0
          ? BigNumber(0)
          : referrerPowerKpis[referrerId].div(totalPower)
      const sqrtOnlyReward = rewards.times(sqrtOnlyProportion)

      // Calculate base reward (e.g. 75% of total pool if stageBonusRatio is 0.25)
      // Stage 0 gets no rewards at all
      const baseProportion =
        isExcluded || stage === 0
          ? BigNumber(0)
          : referrerPowerKpis[referrerId].div(totalPower)
      const baseReward = baseRewardPool.times(baseProportion)

      // Calculate stage bonus (e.g. 25% of total pool if stageBonusRatio is 0.25)
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
        uniqueWalletsForStageCalculation,
        gasUsageForStageCalculation,
        isExcluded,
      }
    },
  )

  return rewardsPerReferrer
}
