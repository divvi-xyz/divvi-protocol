import yargs from 'yargs'
import { formatEther, parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { calculateProportionalPrizeContestNoExcludedReferrers } from '../../src/proportionalPrizeContest'
import { ResultDirectory, KpiRow } from '../../src/resultDirectory'

// proof-of-impact campaign parameters
// May 8 2025 12:00:00 AM UTC
const proofOfImpactStartTimestamp = '1746687600000'
// May 29 2025 07:00:00 AM UTC
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

  return calculateProportionalPrizeContestNoExcludedReferrers({
    kpiData,
    rewards: totalRewardsForPeriod,
  }).map((row) => ({
    ...row,
    rewardAmountDecimal: formatEther(BigInt(row.rewardAmount)),
  }))
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

async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args['start-timestamp'])
  const endTimestampExclusive = new Date(args['end-timestamp'])

  const resultDirectory = new ResultDirectory({
    datadir: args.datadir,
    name: 'celo-transactions',
    startTimestamp,
    endTimestampExclusive,
  })

  const kpiData = await resultDirectory.readKpi()

  const rewards = calculateRewardsProofOfImpact({
    kpiData,
    startTimestamp,
    endTimestampExclusive,
  })

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp,
    endTimestampExclusive,
  })

  await resultDirectory.writeRewards(rewards)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
