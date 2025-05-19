import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'
import { join } from 'path'

// proof-of-impact campaign parameters
// May 8 2025 12:00:00 AM UTC
const proofOfImpactStartTimestamp = '1746687600000'
// May 29 2025 12:00:00 AM UTC
const proofOfImpactendTimestampExclusive = '1748502000000'
const totalRewards = parseEther('14839')
const REWARD_POOL_ADDRESS = '0xE2bEdafB063e0B7f12607ebcf4636e2690A427a3' // on Celo mainnet

const rewardsPerMillisecond = new BigNumber(totalRewards).div(
  new BigNumber(proofOfImpactendTimestampExclusive).minus(
    new BigNumber(proofOfImpactStartTimestamp),
  ),
)

export const _rewardsPerMillisecond = rewardsPerMillisecond // for testing

export function calculateRewardsProofOfImpact({
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

  const referrerKpis = kpiData
    // filter out rows with no revenue, which is possible for users who were referred between the reward period end date and the time of the reward distribution
    .filter((row) => BigInt(row.revenue) > 0)
    .reduce(
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
    'celo-transactions',
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

  const rewards = calculateRewardsProofOfImpact({
    kpiData,
    startTimestamp,
    endTimestampExclusive,
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
