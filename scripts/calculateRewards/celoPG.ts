import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { Address, parseEther } from 'viem'
import BigNumber from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { filterIncludedReferrerIds } from '../utils/filterReferrerIds'
import { ResultDirectory } from '../../src/resultDirectory'
import { getReferrerMetricsFromKpi } from './getReferrerMetricsFromKpi'

const REWARD_POOL_ADDRESS = '0xc273fB49C5c291F7C697D0FcEf8ce34E985008F3' // on Celo mainnet

export function calculateRewardsCeloPG({
  kpiData,
  rewardAmount,
  proportionLinear,
}: {
  kpiData: KpiRow[]
  rewardAmount: string
  proportionLinear: number
}) {
  const totalRewardsForPeriod = new BigNumber(parseEther(rewardAmount))
  const totalLinearRewardsForPeriod =
    totalRewardsForPeriod.times(proportionLinear)
  const totalPowerRewardsForPeriod = totalRewardsForPeriod.times(
    1 - proportionLinear,
  )

  const {
    referrerReferrals,
    referrerKpis,
    totalKpi: totalLinear,
  } = getReferrerMetricsFromKpi(kpiData)

  const referrerPowerKpis = Object.entries(referrerKpis).reduce(
    (acc, [referrerId, kpi]) => {
      acc[referrerId] = BigNumber(kpi).sqrt()
      return acc
    },
    {} as Record<string, BigNumber>,
  )

  const totalPower = Object.values(referrerPowerKpis).reduce(
    (sum, value) => sum.plus(value),
    BigNumber(0),
  )

  const rewards = Object.entries(referrerKpis).map(([referrerId, kpi]) => {
    const linearProportion = BigNumber(kpi).div(totalLinear)
    const powerProportion = BigNumber(referrerPowerKpis[referrerId]).div(
      totalPower,
    )

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
    .option('reward-amount', {
      alias: 'r',
      description: 'the reward amount for this time period in CELO in decimals',
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
    .option('builder-allowlist-file', {
      alias: 'a',
      description: 'a csv file of allowlisted builders',
      type: 'string',
    })
    .strict()
    .parseSync()

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'celo-pg',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardAmount: args['reward-amount'],
    proportionLinear: args['proportion-linear'],
    builderAllowListFile: args['builder-allowlist-file'],
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
  const rewardAmount = args.rewardAmount
  const proportionLinear = args.proportionLinear
  const kpiData = await resultDirectory.readKpi()

  const allowList = args.builderAllowListFile
    ? (parse(readFileSync(args.builderAllowListFile, 'utf-8').toString(), {
        skip_empty_lines: true,
        columns: true,
      }).map(
        ({ referrerId }: { referrerId: Address }) => referrerId,
      ) as Address[])
    : undefined

  const filteredKpiData = filterIncludedReferrerIds({
    data: kpiData,
    allowList,
  })

  const rewards = calculateRewardsCeloPG({
    kpiData: filteredKpiData,
    rewardAmount,
    proportionLinear,
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

  if (args.builderAllowListFile) {
    const fileName = args.builderAllowListFile
    await resultDirectory.writeIncludeList(fileName)
    console.log(
      `Saved include list ${fileName} to ${resultDirectory.includeListFilePath(fileName)}`,
    )
  }

  await resultDirectory.writeRewards(rewardsWithMetadata)
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
