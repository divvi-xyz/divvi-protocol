import yargs from 'yargs'
import { parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../../src/resultDirectory'
import { getReferrerMetricsFromKpi } from './getReferrerMetricsFromKpi'
import { getDivviRewardsExcludedReferrers } from '../utils/divviRewardsExcludedReferrers'

const REWARD_POOL_ADDRESS = '0xBBF7B15C819102B137A96703E63eCF1c3d57CC68'
const REWARD_AMOUNT_IN_DECIMALS = '15000'

export function calculateRewardsLiskV0({
  kpiData,
  proportionLinear,
  excludedReferrers,
}: {
  kpiData: KpiRow[]
  proportionLinear: number
  excludedReferrers: Record<
    string,
    { referrerId: string; shouldWarn?: boolean }
  >
}) {
  const totalRewardsForPeriod = new BigNumber(
    parseEther(REWARD_AMOUNT_IN_DECIMALS),
  )
  const totalLinearRewardsForPeriod =
    totalRewardsForPeriod.times(proportionLinear)
  const totalPowerRewardsForPeriod = totalRewardsForPeriod.times(
    1 - proportionLinear,
  )

  const { referrerReferrals, referrerKpis } = getReferrerMetricsFromKpi(kpiData)

  const referrerPowerKpis = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = BigNumber(kpi).sqrt()
      return acc
    },
    {} as Record<string, BigNumber>,
  )

  const totalLinear = Object.entries(referrerKpis).reduce(
    (sum, [referrerId, kpi]) => {
      if (referrerId.toLowerCase() in excludedReferrers) {
        if (excludedReferrers[referrerId].shouldWarn) {
          console.warn(
            `⚠️ Flagged address ${referrerId} is a referrer, they will be excluded from campaign rewards.`,
          )
        } else {
          console.log(
            `Excluded referrer ${referrerId} kpi's are ignored for reward calculations.`,
          )
        }
        return sum
      }
      return sum.plus(kpi)
    },
    BigNumber(0),
  )
  const totalPower = Object.entries(referrerPowerKpis).reduce(
    (sum, [referrerId, kpi]) => {
      if (referrerId.toLowerCase() in excludedReferrers) {
        return sum
      }
      return sum.plus(kpi)
    },
    BigNumber(0),
  )

  const rewards = Object.entries(referrerKpis).map(([referrerId, kpi]) => {
    const isExcludedReferrer = referrerId.toLowerCase() in excludedReferrers
    const linearProportion = isExcludedReferrer
      ? BigNumber(0)
      : BigNumber(kpi).div(totalLinear)
    const powerProportion = isExcludedReferrer
      ? BigNumber(0)
      : BigNumber(referrerPowerKpis[referrerId]).div(totalPower)

    const linearReward = totalLinearRewardsForPeriod.times(linearProportion)
    const powerReward = totalPowerRewardsForPeriod.times(powerProportion)
    const rewardAmount = linearReward.plus(powerReward)

    return {
      referrerId,
      rewardAmount: rewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      referralCount: referrerReferrals[referrerId],
      kpi,
      linearProportion: linearProportion.toFixed(8, BigNumber.ROUND_DOWN),
      powerProportion: powerProportion.toFixed(8, BigNumber.ROUND_DOWN),
      linearReward: linearReward.toFixed(8, BigNumber.ROUND_DOWN),
      powerReward: powerReward.toFixed(8, BigNumber.ROUND_DOWN),
    }
  })

  return rewards
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
    .option('proportion-linear', {
      alias: 'l',
      description:
        'the proportion of the rewards that are distributed linearly',
      type: 'number',
      default: 1,
    })
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'lisk-v0',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    proportionLinear: args['proportion-linear'],
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
  const proportionLinear = args.proportionLinear
  const kpiData = await resultDirectory.readKpi()

  const excludedReferrers = await getDivviRewardsExcludedReferrers()
  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  const rewards = calculateRewardsLiskV0({
    kpiData,
    proportionLinear,
    excludedReferrers,
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
