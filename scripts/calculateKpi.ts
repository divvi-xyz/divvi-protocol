import calculateKpiHandlers from './calculateKpi/protocols'
import yargs from 'yargs'
import { Protocol, protocols } from './types'
import { ResultDirectory } from '../src/resultDirectory'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_MS = 30 * 60 * 1000 // 30 minutes
// Calculate KPIs for end users in batches to speed things up
const BATCH_SIZE = 20

// DefiLlama API limit, at worst we need to fetch the referral block timestamp for every user
const MAX_REQUESTS_PER_MINUTE = 500

interface KpiResult {
  referrerId: string
  userAddress: string
  kpi: number
}

interface ReferralData {
  referrerId: string
  userAddress: string
  timestamp: string
}

// for testing
export const _calculateKpiBatch = calculateKpiBatch

async function calculateKpiBatch({
  eligibleUsers,
  batchSize,
  startTimestamp,
  endTimestampExclusive,
  protocol,
}: {
  eligibleUsers: ReferralData[]
  batchSize: number
  startTimestamp: Date
  endTimestampExclusive: Date
  protocol: Protocol
}): Promise<KpiResult[]> {
  const results: KpiResult[] = []
  const delayPerBatchInMs = (60_000 * BATCH_SIZE) / MAX_REQUESTS_PER_MINUTE

  for (let i = 0; i < eligibleUsers.length; i += batchSize) {
    const batch = eligibleUsers.slice(i, i + batchSize)
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(eligibleUsers.length / batchSize)} for campaign ${protocol}`,
    )

    const batchPromises = batch.map(
      async ({ referrerId, userAddress, timestamp }) => {
        console.log(
          `Calculating KPI for ${userAddress} for campaign ${protocol}`,
        )

        const referralTimestamp = new Date(
          Date.parse(timestamp) - REFERRAL_TIME_BUFFER_IN_MS,
        )

        if (referralTimestamp.getTime() > endTimestampExclusive.getTime()) {
          console.log(
            `Referral date is after end date, skipping ${userAddress} (registration tx date: ${timestamp}) for campaign ${protocol}`,
          )
          return null
        }

        const kpi = await calculateKpiHandlers[protocol]({
          address: userAddress,
          // if the referral happened after the start of the period, only calculate KPI from the referral block onwards so that we exclude user activity before the referral
          startTimestamp:
            referralTimestamp.getTime() > startTimestamp.getTime()
              ? referralTimestamp
              : startTimestamp,
          endTimestampExclusive,
        })

        return {
          referrerId,
          userAddress,
          kpi,
        }
      },
    )

    const batchResults = await Promise.all(batchPromises)
    results.push(
      ...batchResults.filter(
        (result): result is NonNullable<typeof result> => result !== null,
      ),
    )

    // Delay to avoid rate limits from DefiLlama
    await new Promise((resolve) => setTimeout(resolve, delayPerBatchInMs))
  }

  return results
}

export async function calculateKpi(args: Awaited<ReturnType<typeof getArgs>>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const endTimestampExclusiveCampaign = new Date(
    args.endTimestampExclusiveCampaign,
  )
  const protocol = args.protocol

  const resultDirectory = new ResultDirectory({
    datadir: args.datadir,
    name: protocol,
    startTimestamp,
    endTimestampExclusive: endTimestampExclusiveCampaign,
  })

  const eligibleUsers = await resultDirectory.readReferrals()

  const allResults = await calculateKpiBatch({
    eligibleUsers,
    batchSize: BATCH_SIZE,
    protocol,
    startTimestamp,
    endTimestampExclusive,
  })

  await resultDirectory.writeKpi(allResults)

  console.log(`Wrote results to ${resultDirectory.kpiFileSuffix}.csv`)
}

async function getArgs() {
  const argv = await yargs
    .option('protocol', {
      alias: 'p',
      description: 'ID of protocol to check against',
      choices: protocols,
      demandOption: true,
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'Start timestamp (inclusive) for KPI calculation (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'End timestamp (exclusive) for KPI calculation (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp-campaign', {
      alias: 'e',
      description:
        'End timestamp (exclusive) for the campaign (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('datadir', {
      description: 'Directory to save data',
      default: 'rewards',
    }).argv

  return {
    datadir: argv['datadir'],
    protocol: argv['protocol'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
    endTimestampExclusiveCampaign: argv['end-timestamp-campaign'],
  }
}

if (require.main === module) {
  getArgs()
    .then(calculateKpi)
    .catch((err) => {
      console.log(err)
      process.exit(1)
    })
}
