import yargs from 'yargs'
import { BigNumber } from 'bignumber.js'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { ResultDirectory } from '../../src/resultDirectory'
import { calculateProportionalPrizeContest } from '../../src/proportionalPrizeContest'
import {
  getDivviRewardsExcludedReferrers,
  ExcludedReferrers,
} from '../utils/divviRewardsExcludedReferrers'
import fs from 'fs'
import { parse } from 'csv-parse/sync'

const REWARD_POOL_ADDRESS = '0xB575210cdF52B18000aE24Be4981e9ABC7716F98' // on Ethereum mainnet

// Delegation mapping for Safes that can't claim on this chain
const BEEFY_SAFE_ADDRESS = '0x0000000000000000000000000000000000000000' // TODO: Replace with Beefy's Safe address
const BEEFY_EOA_ADDRESS = '0x0000000000000000000000000000000000000000' // TODO: Replace with Beefy's EOA address

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
      description:
        'the reward amount for this time period in USDT with 6 decimals',
      type: 'string',
      demandOption: true,
    })
    .option('excluded-referrers-csv', {
      alias: 'x',
      description: 'the excluded referrers for this time period in CSV format',
      type: 'string',
    })
    .strict()
    .parseSync()

  const excludedReferrers: Record<
    string,
    { referrerId: string; shouldWarn?: boolean }
  > = !args['excluded-referrers-csv']
    ? {}
    : parse(fs.readFileSync(args['excluded-referrers-csv'], 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }).reduce((acc: ExcludedReferrers, row: { referrerId: string }) => {
        const address = row['referrerId'].toLowerCase()
        acc[address] = {
          referrerId: address,
          shouldWarn: false,
        }
        return acc
      }, {} as ExcludedReferrers)

  return {
    resultDirectory: new ResultDirectory({
      datadir: args.datadir,
      name: 'tether-v0',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardAmount: args['reward-amount'],
    excludedReferrers,
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const resultDirectory = args.resultDirectory
  const rewardAmount = args.rewardAmount
  const kpiData = await resultDirectory.readKpi()

  let excludedReferrers = await getDivviRewardsExcludedReferrers()
  if (
    args.excludedReferrers &&
    Object.keys(args.excludedReferrers).length > 0
  ) {
    excludedReferrers = { ...excludedReferrers, ...args.excludedReferrers }
  }

  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  const rewards = calculateProportionalPrizeContest({
    kpiData,
    rewards: new BigNumber(rewardAmount),
    excludedReferrers,
  })

  const totalTransactionsPerReferrer: {
    [referrerId: string]: number
  } = {}

  for (const { referrerId, metadata } of kpiData) {
    if (!metadata) continue

    totalTransactionsPerReferrer[referrerId] =
      (totalTransactionsPerReferrer[referrerId] ?? 0) +
      Object.values(metadata as Record<string, { txCount?: number }>).reduce(
        (sum, networkData) => {
          return sum + (networkData.txCount ?? 0)
        },
        0,
      )
  }

  const rewardsWithMetadata = rewards.map((reward) => ({
    ...reward,
    totalTransactions: totalTransactionsPerReferrer[reward.referrerId] ?? 0,
    totalValue: reward.kpi,
  }))

  // Apply delegation mapping for Safes that can't claim on this chain
  const rewardsWithDelegation = rewards.map((reward) => ({
    ...reward,
    referrerId:
      reward.referrerId.toLowerCase() === BEEFY_SAFE_ADDRESS.toLowerCase()
        ? BEEFY_EOA_ADDRESS
        : reward.referrerId,
  }))

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards: rewardsWithDelegation,
    startTimestamp,
    endTimestampExclusive,
    useIdempotency: true,
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
