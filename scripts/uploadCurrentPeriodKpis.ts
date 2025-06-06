import { Protocol } from './types'
import { fetchReferrals } from './fetchReferrals'
import { protocolFilters } from './protocolFilters'
import { calculateKpi } from './calculateKpi'
import { join } from 'path'
import { toPeriodFolderName } from './utils/dateFormatting'
import { uploadFilesToGCS } from './utils/uploadFileToCloudStorage'
import yargs from 'yargs'
import { ResultDirectory } from '../src/resultDirectory'
import { main as calculateRewardsCeloPG } from './calculateRewards/celoPG'
import { main as calculateRewardsScoutGame } from './calculateRewards/scoutGameV0'

interface Campaign {
  protocol: Protocol
  rewardsPeriods: {
    startTimestamp: string
    endTimestampExclusive: string
    calculateRewards?: (args: {
      resultDirectory: ResultDirectory
      startTimestamp: string
      endTimestampExclusive: string
    }) => Promise<void>
  }[]
}

const campaigns: Campaign[] = [
  {
    protocol: 'celo-transactions',
    rewardsPeriods: [
      {
        startTimestamp: '2025-05-08T00:00:00Z',
        endTimestampExclusive: '2025-05-16T00:00:00Z',
      },
      {
        startTimestamp: '2025-05-16T00:00:00Z',
        endTimestampExclusive: '2025-05-23T00:00:00Z',
      },
      {
        startTimestamp: '2025-05-23T00:00:00Z',
        endTimestampExclusive: '2025-05-29T07:00:00Z',
      },
    ],
  },
  {
    protocol: 'celo-pg',
    rewardsPeriods: [
      {
        startTimestamp: '2025-05-15T00:00:00Z',
        endTimestampExclusive: '2025-06-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsCeloPG({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '25000',
            proportionLinear: 0.8,
            excludelist: [],
            failOnExclude: false,
          })
        },
      },
      {
        startTimestamp: '2025-06-01T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsCeloPG({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '50000',
            proportionLinear: 1,
            excludelist: [],
            failOnExclude: false,
          })
        },
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
      },
    ],
  },
  {
    protocol: 'scout-game-v0',
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-03T00:00:00Z',
        endTimestampExclusive: '2025-06-10T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-10T00:00:00Z',
        endTimestampExclusive: '2025-06-17T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-17T00:00:00Z',
        endTimestampExclusive: '2025-06-24T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-24T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
    ],
  },
]

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('dry-run', {
      description:
        'Only show what would be uploaded without actually uploading',
      type: 'boolean',
      default: false,
    })
    .option('calculation-timestamp', {
      description:
        'KPIs are calculated for the reward period that includes this timestamp, from the start of the period up to this timestamp (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      default: new Date().toISOString(),
    })
    .option('redis-connection', {
      type: 'string',
      description:
        'redis connection string, to run locally use redis://127.0.0.1:6379',
    }).argv

  return {
    dryRun: argv['dry-run'],
    calculationTimestamp: argv['calculation-timestamp'],
    redisConnection: argv['redis-connection'],
  }
}

async function uploadCurrentPeriodKpis(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  // This script will calculate rewards ending at the start of the current hour
  const startOfCalculationHour = new Date(args.calculationTimestamp).setMinutes(
    0,
    0,
    0,
  )
  const endTimestampExclusive = new Date(startOfCalculationHour).toISOString()

  const uploadFilePaths: string[] = []

  // Due to the DefiLlama API rate limit, there is no point in parallelising the calculations across campaigns
  for (const campaign of campaigns) {
    const campaignStartTimestamp = Date.parse(
      campaign.rewardsPeriods[0].startTimestamp,
    )
    const campaignEndTimestampExclusive = Date.parse(
      campaign.rewardsPeriods[campaign.rewardsPeriods.length - 1]
        .endTimestampExclusive,
    )

    if (
      campaignStartTimestamp > startOfCalculationHour ||
      campaignEndTimestampExclusive <= startOfCalculationHour
    ) {
      console.log(`Campaign ${campaign.protocol} is not active, skipping`)
      continue
    }

    // Find the most recent period that started before the start of the current hour
    const currentPeriod = campaign.rewardsPeriods
      .filter(
        (period) => Date.parse(period.startTimestamp) < startOfCalculationHour,
      )
      .sort(
        (a, b) => Date.parse(b.startTimestamp) - Date.parse(a.startTimestamp),
      )[0]

    if (!currentPeriod) {
      throw new Error(
        `No active period found for campaign ${campaign.protocol}`,
      )
    }

    const datadir = 'kpi'

    const outputDir = join(
      datadir,
      campaign.protocol,
      toPeriodFolderName({
        startTimestamp: new Date(currentPeriod.startTimestamp),
        endTimestampExclusive: new Date(currentPeriod.endTimestampExclusive),
      }),
    )
    const resultDirectory = new ResultDirectory({
      datadir,
      name: campaign.protocol,
      startTimestamp: new Date(currentPeriod.startTimestamp),
      endTimestampExclusive: new Date(currentPeriod.endTimestampExclusive),
    })

    const fetchReferralsStartTime = Date.now()
    await fetchReferrals({
      protocol: campaign.protocol,
      startTimestamp: currentPeriod.startTimestamp,
      endTimestampExclusive,
      outputDir,
      builderAllowList: undefined, // TODO: not really sure how to get an up to date builder allowlist for CI...
      useStaging: false,
      protocolFilter: protocolFilters[campaign.protocol],
      redisConnection: args.redisConnection,
    })
    console.log(
      `Fetched referrals for campaign ${campaign.protocol} in ${Date.now() - fetchReferralsStartTime}ms`,
    )

    const calculateKpiStartTime = Date.now()
    await calculateKpi({
      resultDirectory,
      protocol: campaign.protocol,
      startTimestamp: currentPeriod.startTimestamp,
      endTimestampExclusive,
      redisConnection: args.redisConnection,
    })
    console.log(
      `Calculated kpi's for campaign ${campaign.protocol} in ${Date.now() - calculateKpiStartTime}ms`,
    )

    // These are the output files calculateKpi writes with ResultDirectory
    const outputFilePathCsv = join(outputDir, 'kpi.csv')
    const outputFilePathJson = join(outputDir, 'kpi.json')
    uploadFilePaths.push(outputFilePathCsv, outputFilePathJson)

    if (currentPeriod.calculateRewards) {
      await currentPeriod.calculateRewards({
        resultDirectory,
        startTimestamp: currentPeriod.startTimestamp,
        endTimestampExclusive,
      })
      const rewardsFilePathCsv = join(outputDir, 'rewards-test.csv')
      const rewardsFilePathJson = join(outputDir, 'rewards-test.json')
      uploadFilePaths.push(rewardsFilePathCsv, rewardsFilePathJson)
    }
  }

  const validPaths = uploadFilePaths.filter((path) => path !== null)

  await uploadFilesToGCS(
    validPaths,
    'divvi-campaign-data-production',
    args.dryRun,
  )
}

// Only run if this file is being run directly
if (require.main === module) {
  getArgs()
    .then(uploadCurrentPeriodKpis)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
