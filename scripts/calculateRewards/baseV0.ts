import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { filterExcludedReferrerIds } from '../utils/filterReferrerIds'
import { ResultDirectory } from '../../src/resultDirectory'
import { calculateSqrtProportionalPrizeContest } from '../../src/proportionalPrizeContest'

const REWARD_POOL_ADDRESS = '0xA2a4C1eb286a2EfA470d42676081B771bbe9C1c8' // on Base mainnet
const REWARD_AMOUNT = '1000000000' // 1000 USDC

export function calculateRewardsBaseV0({ kpiData }: { kpiData: KpiRow[] }) {
  return calculateSqrtProportionalPrizeContest({
    kpiData,
    rewards: new BigNumber(REWARD_AMOUNT),
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
    .option('excludelist', {
      description:
        'Comma-separated list of CSV files with excluded addresses (e.g., file1.csv,file2.csv)',
      type: 'array',
      default: [],
      coerce: (arg: string[]) => {
        return arg
          .flatMap((s) => s.split(',').map((item) => item.trim()))
          .filter(Boolean)
      },
    })
    .option('fail-on-exclude', {
      description:
        'Fail if any of the excluded addresses are found in the referral events',
      type: 'boolean',
      default: false,
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
    excludelist: args.excludelist,
    failOnExclude: args['fail-on-exclude'],
  }
}

interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const resultDirectory = args.resultDirectory
  const kpiData = await resultDirectory.readKpi()

  const excludeList = args.excludelist.flatMap((file) =>
    parse(readFileSync(file, 'utf-8').toString(), {
      skip_empty_lines: true,
      columns: true,
    }).map(({ referrerId }: { referrerId: string }) =>
      referrerId.toLowerCase(),
    ),
  ) as string[]

  const filteredKpiData = filterExcludedReferrerIds({
    data: kpiData,
    excludeList,
    failOnExclude: args.failOnExclude,
  })

  const rewards = calculateRewardsBaseV0({
    kpiData: filteredKpiData,
  })

  const totalTransactionsPerReferrer: {
    [referrerId: string]: number
  } = {}

  for (const { referrerId, metadata } of filteredKpiData) {
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
