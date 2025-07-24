import yargs from 'yargs'
import { parseEther } from 'viem'
import { BigNumber } from 'bignumber.js'
import { ResultDirectory } from '../../src/resultDirectory'
import {
  calculateSqrtProportionalPriceByUser,
  calculateSqrtProportionalPrizeContest,
} from '../../src/proportionalPrizeContest'

function parseArgs() {
  const args = yargs
    .option('datadir', {
      description: 'the directory to store the results',
      type: 'string',
      default: 'rewards',
    })
    .option('protocol', {
      description: 'the protocol to calculate rewards for',
      type: 'string',
      demandOption: true,
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
    .option('reward-type', {
      alias: 't',
      description: 'the type of reward to calculate',
      type: 'string',
      demandOption: true,
      choices: ['builder', 'user'],
    })
    .strict()
    .parseSync()

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
    rewardType: args['reward-type'] as 'builder' | 'user',
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const resultDirectory = args.resultDirectory
  const rewardAmount = args.rewardAmount
  const kpiData = await resultDirectory.readKpi()

  const rewardsFunction =
    args.rewardType === 'builder'
      ? calculateSqrtProportionalPrizeContest
      : calculateSqrtProportionalPriceByUser

  const slicesRewards = rewardsFunction({
    kpiData,
    rewards: new BigNumber(parseEther(rewardAmount)),
    excludedReferrers: {},
  }).map((reward) => {
    // Round rewardAmount down to nearest 1e18. We might have UI assumptions that the SLICEs is
    // always a multiple of 1e18. It's safer to round down to avoid any issues.
    const amount = BigInt(reward.rewardAmount)
    const oneEther = 10n ** 18n
    const rounded = amount - (amount % oneEther)
    return { ...reward, rewardAmount: rounded.toString() }
  })

  if (args.rewardType === 'builder') {
    await resultDirectory.writeBuilderSlices(slicesRewards)
  } else {
    await resultDirectory.writeUserSlices(slicesRewards)
  }
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
