import { fetchReferrals } from './fetchReferrals'
import { protocolFilters } from './protocolFilters'
import { calculateKpi } from './calculateKpi'
import { join } from 'path'
import { toPeriodFolderName } from './utils/dateFormatting'
import { uploadFilesToGCS } from './utils/uploadFileToCloudStorage'
import yargs from 'yargs'
import { ResultDirectory } from '../src/resultDirectory'
import { campaigns, STORAGE_BUCKET_NAME, DATADIR } from '../src/campaigns'
import { Campaign } from '../src/types'
import { main as createRewardPoolWithKpiTxAndSimulateRewards } from './createRewardPoolWithKpiTxAndSimulateRewards'

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
    })
    .option('kpi-function-id', {
      type: 'string',
      description: 'the kpi function id (e.g., github commit hash)',
      demandOption: true,
    }).argv

  return {
    dryRun: argv['dry-run'],
    calculationTimestamp: argv['calculation-timestamp'],
    redisConnection: argv['redis-connection'],
    protocols: argv['protocols'],
    kpiFunctionId: argv['kpi-function-id'],
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
    if (campaign.rewardsPeriods.length === 0) {
      console.log(
        `Campaign ${campaign.protocol} has no rewards periods, skipping`,
      )
      continue
    }

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

    const datadir = DATADIR

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
      startTimestamp: campaign.rewardsPeriods[0].startTimestamp,
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
    const campaignFilePaths = [
      `${resultDirectory.kpiFileSuffix}.csv`,
      `${resultDirectory.kpiFileSuffix}.json`,
    ]

    if (campaign.useRewardPoolWithKpi && currentPeriod.rewardAmount) {
      await createRewardPoolWithKpiTxAndSimulateRewards({
        resultDirectory,
        startTimestamp: currentPeriod.startTimestamp,
        endTimestampExclusive: currentPeriod.endTimestampExclusive,
        rewardAmount: currentPeriod.rewardAmount,
        protocol: campaign.protocol,
        excludedReferrers: {},
        kpiFunctionId: args.kpiFunctionId,
      })
      campaignFilePaths.push(
        `${resultDirectory.rewardsFileSuffix}.csv`,
        `${resultDirectory.rewardsFileSuffix}.json`,
        resultDirectory.safeTransactionsFilePath,
      )
    }

    if (currentPeriod.calculateRewards) {
      await currentPeriod.calculateRewards({
        resultDirectory,
        startTimestamp: currentPeriod.startTimestamp,
        endTimestampExclusive: currentPeriod.endTimestampExclusive,
      })
      campaignFilePaths.push(
        `${resultDirectory.rewardsFileSuffix}.csv`,
        `${resultDirectory.rewardsFileSuffix}.json`,
      )
      if (campaign.protocol === 'celo-pg-s1') {
        campaignFilePaths.push(
          resultDirectory.safeTransactionsFileWithSuffixPath('celo'),
        )
        if (
          new Date(currentPeriod.startTimestamp) >=
          new Date('2025-10-21T00:00:00Z')
        ) {
          campaignFilePaths.push(
            resultDirectory.safeTransactionsFileWithSuffixPath('op'),
          )
        }
      } else {
        campaignFilePaths.push(resultDirectory.safeTransactionsFilePath)
      }
    }

    if (campaign.protocol === 'celo-pg-s1') {
      campaignFilePaths.push(
        `${resultDirectory.prosperityPassportDataFileSuffix}.json`,
      )
    }

    if (currentPeriod.calculateRewardSlices) {
      await currentPeriod.calculateRewardSlices({
        resultDirectory,
        startTimestamp: currentPeriod.startTimestamp,
        endTimestampExclusive: currentPeriod.endTimestampExclusive,
      })

      campaignFilePaths.push(
        `${resultDirectory.builderSlicesFileSuffix}.json`,
        `${resultDirectory.builderSlicesFileSuffix}.csv`,
      )
    }

    const validPaths = campaignFilePaths.filter((path) => path !== null)
    await uploadFilesToGCS(validPaths, STORAGE_BUCKET_NAME, args.dryRun)
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
