import { BigNumber } from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../../src/resultDirectory'
import { calculateProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import { getDivviRewardsExcludedReferrers } from '../utils/divviRewardsExcludedReferrers'

export async function calculateLinearProportionalRewards({
  resultDirectory,
  startTimestamp,
  endTimestampExclusive,
  rewardPoolAddress,
  rewardAmountInWei,
}: {
  resultDirectory: ResultDirectory
  startTimestamp: string
  endTimestampExclusive: string
  rewardPoolAddress: string
  rewardAmountInWei: string
}) {
  const kpiData = await resultDirectory.readKpi()

  const excludedReferrers = await getDivviRewardsExcludedReferrers()
  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  const rewards = calculateProportionalPrizeContest({
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
