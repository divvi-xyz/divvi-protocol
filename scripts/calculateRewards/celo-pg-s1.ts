import yargs from 'yargs'
import { BigNumber } from 'bignumber.js'
import { calculateSqrtProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import { ResultDirectory } from '../../src/resultDirectory'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'

// TODO(sbw): haven't deployed RewardPool yet.
const REWARD_POOL_ADDRESS = '0x0000000000000000000000000000000000000000'

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
    .option('reward-amount', {
      alias: 'r',
      description: 'the reward amount for this time period in CELO in decimals',
      type: 'string',
      demandOption: true,
    })
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'celo-pg-s1',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardAmount: args['reward-amount'],
    proportionLinear: args['proportion-linear'],
  }
}

async function main(args: ReturnType<typeof parseArgs>) {
  const {
    resultDirectory,
    startTimestamp,
    endTimestampExclusive,
    rewardAmount,
  } = args

  const kpiData = await resultDirectory.readKpi()

  const rewards = calculateSqrtProportionalPrizeContest({
    kpiData,
    rewards: BigNumber(rewardAmount),
    excludedReferrers: {},
  })

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp: new Date(startTimestamp),
    endTimestampExclusive: new Date(endTimestampExclusive),
  })

  await resultDirectory.writeRewards(rewards)
}

if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
