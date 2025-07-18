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
import { main as calculateRewardsLiskV0 } from './calculateRewards/liskV0'
import { main as calculateRewardsBaseV0 } from './calculateRewards/baseV0'
import { main as calculateRewardsTetherV0 } from './calculateRewards/tetherV0'

export interface Campaign {
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
            proportionLinear: 0.1,
          })
        },
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
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
            rewardAmount: '75000',
            proportionLinear: 0.1,
          })
        },
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
  {
    protocol: 'lisk-v0',
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-05T00:00:00Z',
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
          await calculateRewardsLiskV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            proportionLinear: 1,
          })
        },
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsLiskV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            proportionLinear: 1,
          })
        },
      },
    ],
  },
  {
    protocol: 'base-v0',
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-30T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsBaseV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
          })
        },
      },
    ],
  },
  {
    protocol: 'tether-v0',
    rewardsPeriods: [
      {
        startTimestamp: '2025-07-28T00:00:00Z',
        endTimestampExclusive: '2025-08-30T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsTetherV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '5000000000', // 5000 USDT
            excludelist: [],
            failOnExclude: false,
          })
        },
      },
      {
        startTimestamp: '2025-08-30T00:00:00Z',
        endTimestampExclusive: '2025-09-30T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }: {
          resultDirectory: ResultDirectory
          startTimestamp: string
          endTimestampExclusive: string
        }) => {
          await calculateRewardsTetherV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '10000000000', // 10000 USDT
            excludelist: [],
            failOnExclude: false,
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
    .option('protocols', {
      description:
        'Comma separated list of protocols to calculate KPIs for, e.g. celo-pg, scout-game-v0, lisk-v0. If not specified, KPIs will be calculated for all protocols.',
      type: 'string',
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
    protocols: argv['protocols'],
  }
}

export async function uploadCurrentPeriodKpis(
  args: Awaited<ReturnType<typeof getArgs>>,
  campaigns: Campaign[],
) {
  // If protocols is specified, only calculate KPIs for those campaigns.
  // Otherwise, calculate KPIs for all campaigns.
  let campaignsToCalculate = campaigns
  if (args.protocols) {
    campaignsToCalculate = args.protocols.split(',').map((protocol) => {
      const campaign = campaigns.find((c) => c.protocol === protocol)
      if (!campaign) {
        throw new Error(`Campaign ${protocol} not found`)
      }
      return campaign
    })
  }

  // This script will calculate rewards ending at the start of the current hour
  const startOfCalculationHour = new Date(args.calculationTimestamp).setMinutes(
    0,
    0,
    0,
  )
  const endTimestampExclusive = new Date(startOfCalculationHour).toISOString()

  console.log(
    `📣 Calculating KPIs for protocol(s) ${campaignsToCalculate
      .map((campaign) => campaign.protocol)
      .join(', ')}`,
  )

  // Due to the DefiLlama API rate limit, there is no point in parallelising the calculations across campaigns
  for (const campaign of campaignsToCalculate) {
    const campaignStartTimestamp = Date.parse(
      campaign.rewardsPeriods[0].startTimestamp,
    )
    const campaignEndTimestampExclusive = Date.parse(
      campaign.rewardsPeriods[campaign.rewardsPeriods.length - 1]
        .endTimestampExclusive,
    )

    if (
      campaignStartTimestamp > startOfCalculationHour ||
      campaignEndTimestampExclusive < startOfCalculationHour
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

    console.log(
      `🧮 Calculating KPIs for campaign ${campaign.protocol}, from ${currentPeriod.startTimestamp} to ${endTimestampExclusive} (exclusive)`,
    )

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
      useStaging: false,
      protocolFilter: protocolFilters[campaign.protocol],
      redisConnection: args.redisConnection,
    })
    console.log(
      `👍🏻 Fetched referrals for campaign ${campaign.protocol} in ${Date.now() - fetchReferralsStartTime}ms`,
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
      `🍾 Calculated kpi's for campaign ${campaign.protocol} in ${Date.now() - calculateKpiStartTime}ms`,
    )

    // These are the output files calculateKpi writes with ResultDirectory
    const outputFilePathCsv = join(outputDir, 'kpi.csv')
    const outputFilePathJson = join(outputDir, 'kpi.json')
    const campaignFilePaths = [outputFilePathCsv, outputFilePathJson]

    if (currentPeriod.calculateRewards) {
      await currentPeriod.calculateRewards({
        resultDirectory,
        startTimestamp: currentPeriod.startTimestamp,
        endTimestampExclusive: currentPeriod.endTimestampExclusive,
      })
      const rewardsFilePathCsv = join(outputDir, 'rewards.csv')
      const rewardsFilePathJson = join(outputDir, 'rewards.json')
      const safeTransactionsJson = join(outputDir, 'safe-transactions.json')
      campaignFilePaths.push(
        rewardsFilePathCsv,
        rewardsFilePathJson,
        safeTransactionsJson,
      )
    }

    const validPaths = campaignFilePaths.filter((path) => path !== null)
    await uploadFilesToGCS(
      validPaths,
      'divvi-campaign-data-production',
      args.dryRun,
    )
    console.log(`🎉 Uploaded files for campaign ${campaign.protocol}`)
  }

  console.log('🥳 All campaigns have been processed')
}

// Only run if this file is being run directly
if (require.main === module) {
  getArgs()
    .then((args) => uploadCurrentPeriodKpis(args, campaigns))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
