import yargs from 'yargs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { ResultDirectory } from '../../src/resultDirectory'
import { getReferrerMetricsFromKpi } from './getReferrerMetricsFromKpi'

function parseArgs() {
  const args = yargs
    .option('datadir', {
      description: 'the directory to store the results',
      type: 'string',
      default: 'rewards',
    })
    .option('protocol', {
      description: 'the protocol to calculate rewards for',
      type: 'string',
      demandOption: true,
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
    .option('reward-rate', {
      alias: 'r',
      description: 'the reward rate for this time period in SLICES in decimals',
      type: 'string',
      demandOption: true,
    })
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: args.protocol,
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardRate: args['reward-rate'],
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const resultDirectory = args.resultDirectory
  const rewardRate = args.rewardRate
  const kpiData = await resultDirectory.readKpi()

  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  const referrerPowerKpis = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = BigNumber(kpi).sqrt()
      return acc
    },
    {} as Record<string, BigNumber>,
  )

  const slicesRewards = Object.entries(referrerPowerKpis).map(
    ([referrerId, powerKpi]) => {
      return {
        referrerId,
        kpi: referrerKpis[referrerId],
        referralCount: referrerReferrals[referrerId],
        rewardAmount: parseEther(
          powerKpi.times(rewardRate).toFixed(0, BigNumber.ROUND_DOWN),
        ),
      }
    },
  )

  await resultDirectory.writeBuilderSlices(slicesRewards)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
