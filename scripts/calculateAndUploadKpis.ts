import { Protocol } from './types'
import { fetchReferrals } from './fetchReferrals'
import { protocolFilters } from './protocolFilters'
import { calculateKpi } from './calculateKpi'
import { join } from 'path'
import { toPeriodFolderName } from './utils/dateFormatting'
import { uploadFilesToGCS } from './utils/uploadFileToCloudStorage'
import yargs from 'yargs'

interface Campaign {
  protocol: Protocol
  rewardsPeriods: {
    startTimestamp: string
    endTimestampExclusive: string
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
        endTimestampExclusive: '2025-05-30T00:00:00Z',
      },
    ],
  },
  {
    protocol: 'celo-pg',
    rewardsPeriods: [
      {
        startTimestamp: '2025-05-15T00:00:00Z',
        endTimestampExclusive: '2025-06-01T00:00:00Z',
      },
      {
        startTimestamp: '2025-06-01T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
      },
    ],
  },
]

// Some buffer for the current time in case the latest block is not yet available from DeFiLlama
const NOW_BUFFER_IN_MS = 1000 * 60 * 5 // 5 minutes

const executionStartTime = Date.now()
const endTimestampExclusive = new Date(
  executionStartTime - NOW_BUFFER_IN_MS,
).toISOString()

async function getArgs() {
  const argv = await yargs.env('').option('dry-run', {
    description: 'Only show what would be uploaded without actually uploading',
    type: 'boolean',
    default: false,
  }).argv

  return {
    dryRun: argv['dry-run'],
  }
}

async function calculateAndUploadKpis(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  const kpiResults = campaigns.map(async (campaign) => {
    const campaignStartTimestamp = Date.parse(
      campaign.rewardsPeriods[0].startTimestamp,
    )
    const campaignEndTimestampExclusive = Date.parse(
      campaign.rewardsPeriods[campaign.rewardsPeriods.length - 1]
        .endTimestampExclusive,
    )

    if (
      campaignStartTimestamp > executionStartTime ||
      campaignEndTimestampExclusive <= executionStartTime
    ) {
      console.log(`Campaign ${campaign.protocol} is not active, skipping`)
      return null
    }

    // Find the most recent period that started before or at the same time as now
    const currentPeriod = campaign.rewardsPeriods
      .filter(
        (period) => Date.parse(period.startTimestamp) <= executionStartTime,
      )
      .sort(
        (a, b) => Date.parse(b.startTimestamp) - Date.parse(a.startTimestamp),
      )[0]

    if (!currentPeriod) {
      throw new Error(
        `No active period found for campaign ${campaign.protocol}`,
      )
    }

    const outputDir = join(
      'kpi',
      campaign.protocol,
      toPeriodFolderName({
        startTimestamp: new Date(currentPeriod.startTimestamp),
        endTimestampExclusive: new Date(currentPeriod.endTimestampExclusive),
      }),
    )

    const fetchReferralsStartTime = Date.now()
    await fetchReferrals({
      protocol: campaign.protocol,
      startTimestamp: currentPeriod.startTimestamp,
      endTimestampExclusive,
      outputDir,
      builderAllowList: undefined, // TODO
      useStaging: false,
      protocolFilter: protocolFilters[campaign.protocol],
    })
    console.log(
      `Fetched referrals for campaign ${campaign.protocol} in ${Date.now() - fetchReferralsStartTime}ms`,
    )

    const calculateKpiStartTime = Date.now()
    await calculateKpi({
      protocol: campaign.protocol,
      startTimestamp: currentPeriod.startTimestamp,
      endTimestampExclusive,
      outputDir,
    })
    console.log(
      `Calculated kpi's for campaign ${campaign.protocol} in ${Date.now() - calculateKpiStartTime}ms`,
    )

    const outputFilePath = join(outputDir, 'kpi.csv') // this is the output file of calculateKpi
    return outputFilePath
  })

  const kpiFilePaths = await Promise.all(kpiResults)
  const validPaths = kpiFilePaths.filter((path) => path !== null)
  await uploadFilesToGCS(validPaths, 'divvi-campaign-data', args.dryRun)
}

// Only run if this file is being run directly
if (require.main === module) {
  getArgs()
    .then(calculateAndUploadKpis)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
