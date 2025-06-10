import yargs from 'yargs'
import { formatEther, parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { calculateSqrtProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import { KpiRow, ResultDirectory } from '../../src/resultDirectory'

const scoutGameStartTimestamp = new Date('Tue Jun 03 2025 00:00:00 GMT+0000')
const scoutGameEndTimestampExclusive = new Date(
  'Fri Jul 02 2025 00:00:00 GMT+0000',
)

const totalRewards = parseEther('180000')
const REWARD_POOL_ADDRESS = '0x6F599b879541d289e344e325f4D9badf8c5bB49E' // on Base

const rewardsPerMillisecond = new BigNumber(totalRewards).div(
  new BigNumber(scoutGameEndTimestampExclusive.getTime()).minus(
    new BigNumber(scoutGameStartTimestamp.getTime()),
  ),
)

export function calculateRewards({
  kpiData,
  startTimestamp,
  endTimestampExclusive,
}: {
  kpiData: KpiRow[]
  startTimestamp: Date
  endTimestampExclusive: Date
}) {
  const timeDiff = new BigNumber(endTimestampExclusive.getTime()).minus(
    new BigNumber(startTimestamp.getTime()),
  )
  const totalRewardsForPeriod = timeDiff.times(rewardsPerMillisecond)

  return calculateSqrtProportionalPrizeContest({
    kpiData,
    rewards: totalRewardsForPeriod,
  })
}

function parseArgs() {
  const args = yargs
    .option('datadir', {
      description: 'the directory to store the results',
      type: 'string',
      default: 'rewards',
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'Start timestamp (inclusive) (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'End timestamp (exclusive) (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'scout-game-v0',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: new Date(args['start-timestamp']),
    endTimestampExclusive: new Date(args['end-timestamp']),
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const { resultDirectory, startTimestamp, endTimestampExclusive } = args

  const kpiData = await resultDirectory.readKpi()

  const rewards = calculateRewards({
    kpiData,
    startTimestamp,
    endTimestampExclusive,
  })

  const segmentedKpiPerReferrer: {
    [referrerId: string]: { [key: string]: bigint }
  } = {}

  for (const { referrerId, breakdown } of kpiData) {
    if (!breakdown) continue

    if (!segmentedKpiPerReferrer[referrerId]) {
      segmentedKpiPerReferrer[referrerId] = {}
    }

    for (const [key, value] of Object.entries(breakdown)) {
      segmentedKpiPerReferrer[referrerId][key] =
        (segmentedKpiPerReferrer[referrerId][key] ?? 0n) + BigInt(value)
    }
  }

  const rewardsWithSegmentedKpi = rewards.map((reward) => ({
    ...reward,
    ...segmentedKpiPerReferrer[reward.referrerId],
  }))

  console.log(
    'rewards:',
    rewards.map((r) => ({
      referrerId: r.referrerId,
      rewardAmount: formatEther(BigInt(r.rewardAmount)),
    })),
  )

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestampExclusive,
  })

  resultDirectory.writeRewards(rewardsWithSegmentedKpi)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
