import calculateRevenueHandlers from './calculateRevenue/protocols'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import yargs from 'yargs'
import { protocols } from './types'
import { toPeriodFolderName } from './utils/dateFormatting'
import { dirname, join } from 'path'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_MS = 30 * 60 * 1000 // 30 minutes

export async function calculateRevenue(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const protocol = args.protocol

  const folderPath = join(
    args.datadir,
    protocol,
    toPeriodFolderName({
      startTimestamp,
      endTimestampExclusive,
    }),
  )

  const inputFile = join(folderPath, 'referrals.csv')
  const outputFile = join(folderPath, 'revenue.csv')

  const eligibleUsers = parse(readFileSync(inputFile, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  })
  const handler = calculateRevenueHandlers[protocol]

  const allResults: Array<{
    referrerId: string
    userAddress: string
    revenue: number
  }> = []

  for (let i = 0; i < eligibleUsers.length; i++) {
    const { referrerId, userAddress, timestamp } = eligibleUsers[i]
    console.log(
      `Calculating revenue for ${userAddress} (${i + 1}/${eligibleUsers.length})`,
    )

    const referralTimestamp = new Date(
      Date.parse(timestamp) - REFERRAL_TIME_BUFFER_IN_MS,
    )

    if (referralTimestamp.getTime() > endTimestampExclusive.getTime()) {
      // this shouldn't happen if we only fetch and pass in referrals up to endTimestampExclusive
      console.log(
        `Referral date is after end date, skipping ${userAddress} (registration tx date: ${timestamp})`,
      )
      continue
    }

    const revenue = await handler({
      address: userAddress,
      // if the referral happened after the start of the period, only calculate revenue from the referral block onwards so that we exclude user activity before the referral
      startTimestamp:
        referralTimestamp.getTime() > startTimestamp.getTime()
          ? referralTimestamp
          : startTimestamp,
      endTimestampExclusive,
    })
    allResults.push({
      referrerId,
      userAddress,
      revenue,
    })
  }

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
        'Start timestamp (inclusive) for revenue calculation (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'End timestamp (exclusive) for revenue calculation (new Date() compatible epoch milliseconds or string)',
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
  }
}

if (require.main === module) {
  getArgs()
    .then(calculateRevenue)
    .catch((err) => {
      console.log(err)
      process.exit(1)
    })
}
