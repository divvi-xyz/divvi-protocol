import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'

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
        acc[row.referrerId] = BigInt(row.revenue)
      } else {
        acc[row.referrerId] += BigInt(row.revenue)
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
}

interface KpiRow {
  referrerId: string
  userAddress: string
  revenue: string
}

async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args['start-timestamp'])
  const endTimestamp = new Date(args['end-timestamp'])

  const folderPath = `rewards/celo-pg/${toPeriodFolderName({
    startTimestamp,
    endTimestamp,
  })}`
  const inputPath = `${folderPath}/revenue.csv`
  const outputPath = `${folderPath}/safe-transactions.json`
  const rewardAmount = args['reward-amount']

  const kpiData = parse(readFileSync(inputPath, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  }) as KpiRow[]

  const rewards = calculateRewardsCeloPG({
    kpiData,
    rewardAmount,
  })

  createAddRewardSafeTransactionJSON({
    filePath: outputPath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestamp,
  })
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
