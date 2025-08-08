import { BigNumber } from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../../src/resultDirectory'
import { calculateProportionalPrizeContest, calculateSqrtProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import { getDivviRewardsExcludedReferrers } from '../utils/divviRewardsExcludedReferrers'

type RewardFunction = 'linear' | 'sqrt'

export async function calculateProportionalRewards({
  resultDirectory,
  startTimestamp,
  endTimestampExclusive,
  rewardPoolAddress,
  rewardAmountInWei,
  rewardFunction,
}: {
  resultDirectory: ResultDirectory
  startTimestamp: string
  endTimestampExclusive: string
  rewardPoolAddress: string
  rewardAmountInWei: string
  rewardFunction: RewardFunction
}) {
  const kpiData = await resultDirectory.readKpi()

  const excludedReferrers = await getDivviRewardsExcludedReferrers()
  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  const rewards: { referrerId: string; rewardAmount: string }[] = rewardFunction === 'linear' ? calculateProportionalPrizeContest({
    kpiData,
      excludedReferrers,
      rewards: new BigNumber(rewardAmountInWei),
    }) : calculateSqrtProportionalPrizeContest({
      kpiData,
      excludedReferrers,
      rewards: new BigNumber(rewardAmountInWei),
    })

  const totalTransactionsPerReferrer: {
    [referrerId: string]: number
  } = {}

  for (const { referrerId, metadata } of kpiData) {
    if (!metadata) continue

    totalTransactionsPerReferrer[referrerId] =
      (totalTransactionsPerReferrer[referrerId] ?? 0) +
      (metadata.totalTransactions ?? 0)
  }

  const rewardsWithMetadata = rewards.map((reward) => ({
    ...reward,
    totalTransactions: totalTransactionsPerReferrer[reward.referrerId],
  }))

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: rewardPoolAddress,
    rewards,
    startTimestamp: new Date(startTimestamp),
    endTimestampExclusive: new Date(endTimestampExclusive),
  })

  await resultDirectory.writeRewards(rewardsWithMetadata)
}
