import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { copyFileSync, readFileSync } from 'fs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'
import { join } from 'path'
import filterExcludedReferrerIds from '../utils/filterExcludedReferralIds'

const REWARD_POOL_ADDRESS = '0xc273fB49C5c291F7C697D0FcEf8ce34E985008F3' // on Celo mainnet

export function calculateRewardsCeloPG({
  kpiData,
  rewardAmount,
}: {
  kpiData: KpiRow[]
  rewardAmount: string
}) {
  const totalRewardsForPeriod = new BigNumber(parseEther(rewardAmount))

  const referrerKpis = kpiData.reduce(
    (acc, row) => {
      if (!(row.referrerId in acc)) {
        acc[row.referrerId] = BigInt(row.kpi)
      } else {
        acc[row.referrerId] += BigInt(row.kpi)
      }
      return acc
    },
    {} as Record<string, bigint>,
  )

  const total = Object.values(referrerKpis).reduce(
    (sum, value) => sum + value,
    BigInt(0),
  )

  const rewards = Object.entries(referrerKpis).map(([referrerId, kpi]) => {
    return {
      referrerId,
      rewardAmount: totalRewardsForPeriod
        .times(kpi)
        .div(total)
        .toFixed(0, BigNumber.ROUND_DOWN),
    }
  })

  return rewards
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
}

interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
}

async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args['start-timestamp'])
  const endTimestampExclusive = new Date(args['end-timestamp'])

  const folderPath = join(
    args.datadir,
    'celo-pg',
    toPeriodFolderName({
      startTimestamp,
      endTimestampExclusive,
    }),
  )
  const inputPath = join(folderPath, 'kpi.csv')
  const outputPath = join(folderPath, 'safe-transactions.json')
  const rewardAmount = args['reward-amount']

  const kpiData = parse(readFileSync(inputPath, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  }) as KpiRow[]

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
    failOnExclude: args['fail-on-exclude'],
  })

  const rewards = calculateRewardsCeloPG({
    kpiData: filteredKpiData,
    rewardAmount,
  })

  createAddRewardSafeTransactionJSON({
    filePath: outputPath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestampExclusive,
  })

  for (const file of args.excludelist) {
    const excludeListOutputFile = join(folderPath, `exclude-${file}`)
    copyFileSync(file, excludeListOutputFile)
    console.log(`Copied exclude list ${file} to ${excludeListOutputFile}`)
  }
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
