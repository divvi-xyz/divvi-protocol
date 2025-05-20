import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { formatEther, parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'
import { join } from 'path'
import { calculateProportionalPrizeContest } from './proportionalPrizeContest'

const scoutGameStartTimestamp = new Date('Tue Jun 03 2025 07:00:00 GMT+0000')
const scoutGameEndTimestampExclusive = new Date(
  'Fri Jul 02 2025 07:00:00 GMT+0000',
)

const totalRewards = parseEther('180000')
const REWARD_POOL_ADDRESS = '0x6F599b879541d289e344e325f4D9badf8c5bB49E' // on Base

const rewardsPerMillisecond = new BigNumber(totalRewards).div(
  new BigNumber(scoutGameStartTimestamp.getTime()).minus(
    new BigNumber(scoutGameEndTimestampExclusive.getTime()),
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

  return calculateProportionalPrizeContest({
    kpiData,
    rewards: totalRewardsForPeriod,
  })
}

function parseArgs() {
  return yargs
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
}

interface KpiRow {
  referrerId: string
  userAddress: string
  revenue: string
}

async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args['start-timestamp'])
  const endTimestampExclusive = new Date(args['end-timestamp'])

  const folderPath = join(
    args.datadir,
    'scout-game-v0',
    toPeriodFolderName({
      startTimestamp,
      endTimestampExclusive,
    }),
  )
  const inputPath = join(folderPath, 'revenue.csv')
  const outputPath = join(folderPath, 'safe-transactions.json')

  const kpiData = parse(readFileSync(inputPath, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  }) as KpiRow[]

  const rewards = calculateRewards({
    kpiData,
    startTimestamp,
    endTimestampExclusive,
  })

  console.log(
    'rewards:',
    rewards.map((r) => ({
      referrerId: r.referrerId,
      rewardAmount: formatEther(BigInt(r.rewardAmount)),
    })),
  )

  createAddRewardSafeTransactionJSON({
    filePath: outputPath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestampExclusive,
  })
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
