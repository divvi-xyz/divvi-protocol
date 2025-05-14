import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'

// e2e Testing RewardPool address
const REWARD_POOL_ADDRESS = '0x5782CaB7e3dC7991d15665A413aa64a52E62B769' // on Celo mainnet

export function calculateTestRewards({ kpiData }: { kpiData: KpiRow[] }) {
  const referrerKpis = kpiData.reduce(
    (acc, row) => {
      if (!(row.referrerId in acc)) {
        acc[row.referrerId] = BigInt(row.revenue)
      } else {
        acc[row.referrerId] += BigInt(row.revenue)
      }
      return acc
    },
    {} as Record<string, bigint>,
  )

  const rewards = Object.entries(referrerKpis).map(([referrerId, kpi]) => {
    return {
      referrerId,
      kpi,
      rewardAmount: kpi.toString(),
    }
  })
  return rewards
}

function parseArgs() {
  return yargs
    .option('input-file', {
      alias: 'i',
      description: 'input file path containing transaction data',
      type: 'string',
      demandOption: false,
    })
    .option('output-file', {
      alias: 'o',
      description: 'output file path to write reward allocations',
      type: 'string',
      demandOption: false,
    })
    .option('start-timestamp', {
      alias: 's',
      description: 'start timestamp (inclusive)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description: 'end timestamp (exclusive)',
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
  const inputPath = args['input-file'] ?? 'celo-transactions.csv'
  const outputPath =
    args['output-file'] ?? 'celo-transactions-safe-transactions.json'

  const kpiData = parse(readFileSync(inputPath, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  }) as KpiRow[]

  const rewards = calculateTestRewards({
    kpiData,
  })

  createAddRewardSafeTransactionJSON({
    filePath: outputPath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp: args['start-timestamp'],
    endTimestamp: args['end-timestamp'],
  })
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
