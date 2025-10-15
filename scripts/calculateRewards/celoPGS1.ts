import yargs from 'yargs'
import { BigNumber } from 'bignumber.js'
import {
  calculateRewards,
  calculateStageV0,
  calculateStageV1,
  calculateStageV2,
  getQualityUserScores,
} from '../../src/celoPGRewards'
import { KpiRow, ResultDirectory } from '../../src/resultDirectory'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { parseEther } from 'viem'
import {
  ExcludedReferrers,
  getDivviRewardsExcludedReferrers,
} from '../utils/divviRewardsExcludedReferrers'
import fs from 'fs'
import { parse } from 'csv-parse/sync'
import axios from 'axios'

// TODO: support both CELO and OP reward pools
const REWARD_POOL_ADDRESS = '0xb14e0d244746FE8Ad6dA763B44f43669fab620f5' // on Celo mainnet

async function readKpiFile(url: string) {
  if (url.startsWith('https://')) {
    const response = await axios.get(url)
    return response.data as KpiRow[]
  } else {
    return JSON.parse(fs.readFileSync(url, 'utf8')) as KpiRow[]
  }
}

const stageFunctions = [calculateStageV0, calculateStageV1, calculateStageV2]

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
    .option('excluded-referrers-csv', {
      alias: 'x',
      description: 'the excluded referrers for this time period in CSV format',
      type: 'string',
    })
    .option('previous-kpi-files', {
      description:
        'URL of the kpi file that should be include in stage calculation',
      type: 'array',
      string: true,
      default: [],
    })
    .option('stage-function-version', {
      description: 'the version of the stage function',
      type: 'number',
      choices: stageFunctions.map((_, index) => index),
      demandOption: true,
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
      name: 'celo-pg-s1',
      startTimestamp: new Date(args['start-timestamp']),
      endTimestampExclusive: new Date(args['end-timestamp']),
    }),
    startTimestamp: args['start-timestamp'],
    endTimestampExclusive: args['end-timestamp'],
    rewardAmount: args['reward-amount'],
    excludedReferrers,
    previousKpiFiles: args['previous-kpi-files'],
    stageFunction: stageFunctions[args['stage-function-version']],
  }
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const {
    resultDirectory,
    startTimestamp,
    endTimestampExclusive,
    rewardAmount,
    previousKpiFiles,
    stageFunction,
  } = args

  const kpiData = await resultDirectory.readKpi()

  let excludedReferrers = await getDivviRewardsExcludedReferrers()
  if (
    args.excludedReferrers &&
    Object.keys(args.excludedReferrers).length > 0
  ) {
    excludedReferrers = { ...excludedReferrers, ...args.excludedReferrers }
  }

  await resultDirectory.writeExcludeList(Object.values(excludedReferrers))

  let previousStageData: KpiRow[][] = []
  if (previousKpiFiles.length > 0) {
    previousStageData = await Promise.all(previousKpiFiles.map(readKpiFile))
  }

  const totalTransactionsPerReferrer: {
    [referrerId: string]: number
  } = {}

  for (const { referrerId, metadata } of kpiData) {
    if (!metadata) continue

    totalTransactionsPerReferrer[referrerId] =
      (totalTransactionsPerReferrer[referrerId] ?? 0) +
      (typeof metadata['totalTransactions'] === 'number'
        ? metadata['totalTransactions']
        : 0)
  }

  const usersPerReferrer: {
    [referrerId: string]: string[]
  } = {}
  for (const { referrerId, userAddress } of kpiData) {
    if (!usersPerReferrer[referrerId]) {
      usersPerReferrer[referrerId] = []
    }
    usersPerReferrer[referrerId].push(userAddress)
  }

  const qualityUserScores = await getQualityUserScores(
    usersPerReferrer,
    resultDirectory,
  )

  const rewards = calculateRewards({
    kpiData,
    rewards: BigNumber(parseEther(rewardAmount)),
    excludedReferrers,
    previousStageData,
    stageFunction,
    qualityUserScores,
  })

  const rewardsWithMetadata = rewards.map((reward) => ({
    ...reward,
    totalTransactions: totalTransactionsPerReferrer[reward.referrerId],
  }))

  createAddRewardSafeTransactionJSON({
    filePath: resultDirectory.safeTransactionsFilePath,
    rewardPoolAddress: REWARD_POOL_ADDRESS,
    rewards,
    startTimestamp: new Date(startTimestamp),
    endTimestampExclusive: new Date(endTimestampExclusive),
    useIdempotency: true,
  })

  await resultDirectory.writeRewards(rewardsWithMetadata)
}

if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
