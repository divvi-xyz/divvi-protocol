import yargs from 'yargs'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../../src/resultDirectory'
import { calculateSqrtProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import { getDivviRewardsExcludedReferrerIds } from '../utils/divviRewardsExcludedReferrerIds'

const REWARD_POOL_ADDRESS = '0xA2a4C1eb286a2EfA470d42676081B771bbe9C1c8' // on Base mainnet
const REWARD_AMOUNT = '1000000000' // 1000 USDC

function parseArgs() {
  const args = yargs
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
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'base-v0',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const resultDirectory = args.resultDirectory
  const kpiData = await resultDirectory.readKpi()

  const excludeList = await getDivviRewardsExcludedReferrerIds()
  await resultDirectory.writeExcludeList(Object.values(excludeList))

  const rewards = calculateSqrtProportionalPrizeContest({
    kpiData,
    excludeList,
    rewards: new BigNumber(REWARD_AMOUNT),
  })

  const totalTransactionsPerReferrer: {
    [referrerId: string]: number
  } = {}

  for (const { referrerId, metadata } of kpiData) {
    if (!metadata) continue

    totalTransactionsPerReferrer[referrerId] =
      (totalTransactionsPerReferrer[referrerId] ?? 0) +
      (metadata['totalTransactions'] ?? 0)
  }

  const rewardsWithMetadata = rewards.map((reward) => ({
    ...reward,
    totalTransactions: totalTransactionsPerReferrer[reward.referrerId],
  }))

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestampExclusive,
  })

  await resultDirectory.writeRewards(rewardsWithMetadata)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
