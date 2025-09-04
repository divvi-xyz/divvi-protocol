import yargs from 'yargs'
import { BigNumber } from 'bignumber.js'
import { calculateRewards } from '../../src/celoPGRewards'
import { ResultDirectory } from '../../src/resultDirectory'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { parseEther } from 'viem'

// TODO: support both CELO and OP reward pools
const REWARD_POOL_ADDRESS = '0xb14e0d244746FE8Ad6dA763B44f43669fab620f5' // on Celo mainnet

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
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const {
    resultDirectory,
    startTimestamp,
    endTimestampExclusive,
    rewardAmount,
  } = args

  const kpiData = await resultDirectory.readKpi()

  const rewards = calculateRewards({
    kpiData,
    rewards: BigNumber(parseEther(rewardAmount)),
    excludedReferrers: {},
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
    startTimestamp: new Date(startTimestamp),
    endTimestampExclusive: new Date(endTimestampExclusive),
    useIdempotency: true,
  })

  await resultDirectory.writeRewards(rewardsWithMetadata)
}

if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
