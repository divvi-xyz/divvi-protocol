import yargs from 'yargs'
import { createUpdateKpiAndProcessRewardsSafeTransactionJSON } from './utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../src/resultDirectory'
import {
  getDivviRewardsExcludedReferrers,
  ExcludedReferrers,
} from './utils/divviRewardsExcludedReferrers'
import fs from 'fs'
import { parse } from 'csv-parse/sync'
import { protocols } from './types'
import { campaigns } from '../src/campaigns'
import { getReferrerMetricsFromKpi } from './calculateRewards/getReferrerMetricsFromKpi'
import { getViemPublicClient } from './utils'
import { rewardFunctionAbi } from '../abis/RewardFunction'
import { rewardPoolWithKpiAbi } from '../abis/RewardPoolWithKpi'

function parseArgs() {
  const args = yargs
    .option('protocol', {
      description: 'the protocol to calculate rewards for',
      type: 'string',
      demandOption: true,
      choices: protocols,
    })
    .option('datadir', {
      description: 'the directory to store the results',
      type: 'string',
      default: 'rewards',
    })
    .option('start-timestamp', {
      alias: 's',
      description: 'start timestamp',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description: 'end timestamp',
      type: 'string',
      demandOption: true,
    })
    .option('reward-amount', {
      alias: 'r',
      description: 'the reward amount for this time period in smallest units',
      type: 'string',
      demandOption: true,
    })
    .option('kpi-function-id', {
      alias: 'k',
      description: 'the kpi function id (e.g., github commit hash)',
      type: 'string',
      demandOption: true,
    })
    .option('excluded-referrers-csv', {
      alias: 'x',
      description: 'the excluded referrers for this time period in CSV format',
      type: 'string',
    })
    .strict()
    .parseSync()

  const excludedReferrers: Record<
    string,
    { referrerId: string; shouldWarn?: boolean }
  > = !args['excluded-referrers-csv']
    ? {}
    : parse(fs.readFileSync(args['excluded-referrers-csv'], 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }).reduce((acc: ExcludedReferrers, row: { referrerId: string }) => {
        const address = row['referrerId'].toLowerCase()
        acc[address] = {
          referrerId: address,
          shouldWarn: false,
        }
        return acc
      }, {} as ExcludedReferrers)

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: args.protocol,
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardAmount: args['reward-amount'],
    excludedReferrers,
    protocol: args.protocol,
    kpiFunctionId: args['kpi-function-id'],
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const resultDirectory = args.resultDirectory
  const rewardAmount = BigInt(args.rewardAmount)
  const kpiData = await resultDirectory.readKpi()
  const campaign = campaigns.find((c) => c.protocol === args.protocol)
  if (!campaign) {
    throw new Error(`Campaign ${args.protocol} not found`)
  }
  const rewardPoolAddress = campaign.rewardsPoolAddress

  let excludedReferrers = await getDivviRewardsExcludedReferrers()
  if (
    args.excludedReferrers &&
    Object.keys(args.excludedReferrers).length > 0
  ) {
    excludedReferrers = { ...excludedReferrers, ...args.excludedReferrers }
  }

  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  // group kpis by referrer and remove excluded referrers
  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)
  const kpis = Object.entries(referrerKpis)
    .filter(([referrerId]) => !(referrerId.toLowerCase() in excludedReferrers))
    .map(([referrerId, kpi]) => ({
      kpi,
      referrer: referrerId as `0x${string}`,
    }))

  createUpdateKpiAndProcessRewardsSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress,
    kpis,
    startTimestamp,
    endTimestampExclusive,
    kpiFunctionId: args.kpiFunctionId,
    rewardAmount,
  })

  // get the reward function address from the reward pool contract and use it to simulate the rewards calculation
  const publicClient = getViemPublicClient(campaign.networkId)
  const rewardFunctionAddress = await publicClient.readContract({
    address: rewardPoolAddress,
    abi: rewardPoolWithKpiAbi,
    functionName: 'rewardFunctionAddress',
  })
  const rewards = await publicClient.readContract({
    address: rewardFunctionAddress,
    abi: rewardFunctionAbi,
    functionName: 'calculateReward',
    args: [kpis, rewardAmount],
  })

  const rewardsWithMetadata = rewards.map((reward) => ({
    ...reward,
    totalKpi: referrerKpis[reward.referrer],
    referralCount: referrerReferrals[reward.referrer],
  }))

  await resultDirectory.writeRewards(rewardsWithMetadata)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
