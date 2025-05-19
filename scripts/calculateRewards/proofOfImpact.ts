import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'

// proof-of-impact campaign parameters
// May 8 2025 12:00:00 AM UTC
const proofOfImpactStartTimestamp = '1746687600000'
// May 29 2025 12:00:00 AM UTC
const proofOfImpactEndTimestamp = '1748502000000'
const totalRewards = parseEther('14839')
const REWARD_POOL_ADDRESS = '0xE2bEdafB063e0B7f12607ebcf4636e2690A427a3' // on Celo mainnet

const rewardsPerMillisecond = new BigNumber(totalRewards).div(
  new BigNumber(proofOfImpactEndTimestamp).minus(
    new BigNumber(proofOfImpactStartTimestamp),
  ),
)

export const _rewardsPerMillisecond = rewardsPerMillisecond // for testing

export function calculateRewardsProofOfImpact({
  kpiData,
  startTimestamp,
  endTimestamp,
}: {
  kpiData: KpiRow[]
  startTimestamp: Date
  endTimestamp: Date
}) {
  const timeDiff = new BigNumber(endTimestamp.getTime()).minus(
    new BigNumber(startTimestamp.getTime()),
  )
  const totalRewardsForPeriod = timeDiff.times(rewardsPerMillisecond)

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
      kpi,
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
  const endTimestamp = new Date(args['end-timestamp'])

  const folderPath = `rewards/celo-transactions/${toPeriodFolderName({
    startTimestamp,
    endTimestamp,
  })}`
  const inputPath = `${folderPath}/revenue.csv`
  const outputPath = `${folderPath}/safe-transactions.json`

  const kpiData = parse(readFileSync(inputPath, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  }) as KpiRow[]

  const rewards = calculateRewardsProofOfImpact({
    kpiData,
    startTimestamp,
    endTimestamp,
  })

  console.log(
    'rewards:',
    rewards.map((r) => ({
      referrerId: r.referrerId,
      kpi: r.kpi,
      rewardAmount: BigNumber(r.rewardAmount).shiftedBy(-18).toFixed(0),
    })),
  )

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
