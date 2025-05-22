import calculateKpiHandlers from './calculateKpi/protocols'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import yargs from 'yargs'
import { Protocol, protocols } from './types'
import { toPeriodFolderName } from './utils/dateFormatting'
import { dirname, join } from 'path'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_MS = 30 * 60 * 1000 // 30 minutes
// Calculate KPIs for end users in batches to speed things up
const BATCH_SIZE = 20

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
  handler,
  startTimestamp,
  endTimestampExclusive,
  protocol,
}: {
  eligibleUsers: ReferralData[]
  batchSize: number
  handler: (params: {
    address: string
    startTimestamp: Date
    endTimestampExclusive: Date
  }) => Promise<number>
  startTimestamp: Date
  endTimestampExclusive: Date
  protocol: Protocol
}): Promise<KpiResult[]> {
  const results: KpiResult[] = []

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
            `Referral date is after end date, skipping ${userAddress} (registration tx date: ${timestamp})`,
          )
          return null
        }

        const kpi = await handler({
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

    // for every 10 batches, add a 1 minute delay to avoid rate limits from DefiLlama
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 60 * 1000))
    }
  }

  return results
}

export async function calculateKpi(args: Awaited<ReturnType<typeof getArgs>>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const protocol = args.protocol

  const inputFile = join(args.outputDir, 'referrals.csv')
  const outputFile = join(args.outputDir, 'kpi.csv')

  const eligibleUsers: ReferralData[] = parse(
    readFileSync(inputFile, 'utf-8').toString(),
    {
      skip_empty_lines: true,
      delimiter: ',',
      columns: true,
    },
  )
  const handler = calculateKpiHandlers[protocol]

  const allResults = await calculateKpiBatch({
    eligibleUsers,
    batchSize: BATCH_SIZE,
    handler,
    startTimestamp,
    endTimestampExclusive,
    protocol,
  })

  // Create directory if it doesn't exist
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, stringify(allResults, { header: true }), {
    encoding: 'utf-8',
  })

  console.log(`Wrote results to ${outputFile}`)
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
    .option('datadir', {
      description: 'Directory to save data',
      default: 'rewards',
    }).argv

  const outputDir = join(
    argv['datadir'],
    argv['protocol'],
    toPeriodFolderName({
      startTimestamp: new Date(argv['start-timestamp']),
      endTimestampExclusive: new Date(argv['end-timestamp']),
    }),
  )

  return {
    outputDir,
    protocol: argv['protocol'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
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
