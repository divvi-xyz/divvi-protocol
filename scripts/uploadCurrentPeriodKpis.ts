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

async function uploadCurrentPeriodKpis(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  // This script will calculate rewards ending at the start of the current hour
  const startOfCurrentHour = new Date().setMinutes(0, 0, 0)
  const endTimestampExclusive = new Date(startOfCurrentHour).toISOString()

  const kpiFilePaths: string[] = []

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
      campaignStartTimestamp > startOfCurrentHour ||
      campaignEndTimestampExclusive <= startOfCurrentHour
    ) {
      console.log(`Campaign ${campaign.protocol} is not active, skipping`)
      continue
    }

    // Find the most recent period that started before the start of the current hour
    const currentPeriod = campaign.rewardsPeriods
      .filter(
        (period) => Date.parse(period.startTimestamp) < startOfCurrentHour,
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
      builderAllowList: undefined, // TODO: not really sure how to get an up to date builder allowlist for CI...
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
    kpiFilePaths.push(outputFilePath)
  }

  const validPaths = kpiFilePaths.filter((path) => path !== null)

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
