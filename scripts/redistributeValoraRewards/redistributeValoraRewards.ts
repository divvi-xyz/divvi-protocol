import yargs from 'yargs'
import { listGCSFiles } from '../utils/uploadFileToCloudStorage'
import { campaigns } from '../../src/campaigns'
import { getViemPublicClient } from '../utils'
import { rewardPoolAbi } from '../../abis/RewardPool'
import { getRewards } from './getRewards'
import { proposeSafeAddRewardsTx } from './proposeSafeAddRewardsTx'
import { proposeSafeClaimOrDepositRewardTx } from './proposeSafeClaimOrDepositRewardTx'
import { waitForSafeTxExecuted } from './waitForSafeTxExecuted'

import {
  VALORA_DIVVI_IDENTIFIER,
  VALORA_MEDIUM_SECURITY_SAFE_ADDRESS,
} from './constants'
import { checkAndProposeTokenApproval } from './checkAndProposeTokenApproval'

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('protocol', {
      description: 'The protocol to redistribute valora rewards for',
      type: 'string',
    })
    .option('start-timestamp', {
      description:
        'The start timestamp of the reward period to redistribute valora rewards for',
      type: 'string',
      required: true,
    })
    .option('end-timestamp-exclusive', {
      description:
        'The end timestamp exclusive of the reward period to redistribute valora rewards for',
      type: 'string',
      required: true,
    })
    .option('dry-run', {
      description: 'Only show what would be done without actually doing it',
      type: 'boolean',
      default: false,
    }).argv

  return {
    protocol: argv['protocol'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp-exclusive'],
    dryRun: argv['dry-run'],
  }
}

export async function redistributeValoraRewards(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  const campaign = campaigns.find((c) => c.protocol === args.protocol)
  if (!campaign) {
    throw new Error(`Campaign not found for protocol ${args.protocol}`)
  }
  if (!campaign.valoraRewardsPoolAddress) {
    throw new Error(
      `Valora rewards pool address not found for campaign ${args.protocol}`,
    )
  }

  const client = getViemPublicClient(campaign.networkId)
  const rewards = await client.readContract({
    address: campaign.rewardsPoolAddress,
    abi: rewardPoolAbi,
    functionName: 'pendingRewards',
    args: [VALORA_DIVVI_IDENTIFIER],
  })
  const pendingRewards = rewards.toString()

  console.log(`Fetched pending rewards for ${args.protocol}: ${pendingRewards}`)

  if (rewards > BigInt(0)) {
    const gcsFiles = await listGCSFiles(process.env.BUCKET_NAME!)
    // Find the latest rewards file for this campaign
    const { filename, rewardAmounts } = await getRewards({
      gcsFiles,
      protocol: campaign.protocol,
      startTimestamp: args.startTimestamp,
      endTimestampExclusive: args.endTimestampExclusive,
    })

    const valoraRewardsFromGcs =
      rewardAmounts.find(
        (reward) =>
          reward.referrerId.toLowerCase() ===
          VALORA_DIVVI_IDENTIFIER.toLowerCase(),
      )?.rewardAmount ?? null

    // If the rewards from the GCS file don't match the pending rewards, there are some inconsistencies, so throw an error
    if (valoraRewardsFromGcs !== pendingRewards) {
      throw new Error(
        `Rewards mismatch: ${valoraRewardsFromGcs} !== ${pendingRewards}`,
      )
    }

    const {
      safeTxUrl: claimRewardsSafeTxUrl,
      safeTxHash: claimRewardsSafeTxHash,
    } = await proposeSafeClaimOrDepositRewardTx({
      safeAddress: VALORA_DIVVI_IDENTIFIER,
      rewardPoolAddress: campaign.rewardsPoolAddress,
      rewardAmount: rewards,
      isClaiming: true,
      networkId: campaign.networkId,
      alchemyKey: process.env.ALCHEMY_KEY!,
      dryRun: args.dryRun,
    })

    console.log(
      `\n\nClaim rewards Safe tx url: ${claimRewardsSafeTxUrl}\nSign and execute the tx on the Safe to continue`,
    )

    // Wait until the claim tx is executed
    if (claimRewardsSafeTxUrl && !args.dryRun) {
      console.log(
        `\n⏳ Waiting for claim transaction ${claimRewardsSafeTxHash} to be executed...`,
      )
      await waitForSafeTxExecuted(claimRewardsSafeTxHash!, campaign.networkId)
    }

    // Check and propose token approval before deposit
    const { safeTxUrl: approvalSafeTxUrl, safeTxHash: approvalSafeTxHash } =
      await checkAndProposeTokenApproval({
        safeAddress: VALORA_DIVVI_IDENTIFIER,
        rewardPoolAddress: campaign.valoraRewardsPoolAddress,
        rewardAmount: rewards,
        networkId: campaign.networkId,
        alchemyKey: process.env.ALCHEMY_KEY!,
        dryRun: args.dryRun,
      })

    if (approvalSafeTxUrl) {
      console.log(
        `\n\nToken approval Safe tx url: ${approvalSafeTxUrl}\nSign and execute the tx on the Safe to continue`,
      )

      // Wait until the approval tx is executed
      if (!args.dryRun) {
        console.log(
          `\n⏳ Waiting for approval transaction ${approvalSafeTxHash} to be executed...`,
        )
        await waitForSafeTxExecuted(approvalSafeTxHash!, campaign.networkId)
      }
    }

    const {
      safeTxUrl: depositRewardsSafeTxUrl,
      safeTxHash: depositRewardsSafeTxHash,
    } = await proposeSafeClaimOrDepositRewardTx({
      safeAddress: VALORA_DIVVI_IDENTIFIER,
      rewardPoolAddress: campaign.valoraRewardsPoolAddress,
      rewardAmount: rewards,
      isClaiming: false,
      networkId: campaign.networkId,
      alchemyKey: process.env.ALCHEMY_KEY!,
      dryRun: args.dryRun,
    })

    console.log(
      `\n\nDeposit rewards Safe tx url: ${depositRewardsSafeTxUrl}\nSign and execute the tx on the Safe to continue`,
    )

    // Wait until the deposit tx is executed
    if (depositRewardsSafeTxUrl && !args.dryRun) {
      console.log(
        `\n⏳ Waiting for deposit transaction ${depositRewardsSafeTxHash} to be executed...`,
      )
      await waitForSafeTxExecuted(depositRewardsSafeTxHash!, campaign.networkId)
    }

    const { safeTxUrl: addRewardsSafeTxUrl, safeTxHash: addRewardsSafeTxHash } =
      await proposeSafeAddRewardsTx({
        safeAddress: VALORA_MEDIUM_SECURITY_SAFE_ADDRESS,
        rewardPoolAddress: campaign.valoraRewardsPoolAddress,
        rewardAmounts,
        valoraRewards: rewards,
        networkId: campaign.networkId,
        alchemyKey: process.env.ALCHEMY_KEY!,
        dryRun: args.dryRun,
        excludeReferrerIds: [VALORA_DIVVI_IDENTIFIER],
        rewardsFilename: filename,
      })

    console.log(
      `\n\nAdd rewards Safe tx url: ${addRewardsSafeTxUrl}\nSign and execute the tx on the Safe to continue`,
    )

    // Wait until the add rewards tx is executed
    if (addRewardsSafeTxUrl && !args.dryRun) {
      console.log(
        `\n⏳ Waiting for add rewards transaction ${addRewardsSafeTxHash} to be executed...`,
      )
      await waitForSafeTxExecuted(addRewardsSafeTxHash!, campaign.networkId)
    }

    console.log(`\n\nRewards successfully redistributed for ${args.protocol}!`)
  }
}

// Only run if this file is being run directly
if (require.main === module) {
  getArgs()
    .then((args) => redistributeValoraRewards(args))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
