import calculateRevenueHandlers from './calculateRevenue/protocols'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import yargs from 'yargs'
import { protocols } from './types'
import { toPeriodFolderName } from './utils/dateFormatting'
import { dirname } from 'path'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_MS = 30 * 60 * 1000 // 30 minutes

async function main(args: ReturnType<typeof parseArgs>) {
  const startTimestamp = new Date(args['start-timestamp'])
  const endTimestampExclusive = new Date(args['end-timestamp'])
  const protocol = args.protocol

  const folderPath = `rewards/${protocol}/${toPeriodFolderName({
    startTimestamp,
    endTimestampExclusive,
  })}`
  const inputFile = `${folderPath}/referrals.csv`
  const outputFile = `${folderPath}/revenue.csv`

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

    const referralTimestamp =
      new Date(timestamp).getTime() - REFERRAL_TIME_BUFFER_IN_MS
    if (referralTimestamp > endTimestampExclusive.getTime()) {
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
        referralTimestamp > startTimestamp.getTime()
          ? new Date(referralTimestamp)
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

function parseArgs() {
  return yargs
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
    .strict()
    .parseSync()
}

if (require.main === module) {
  main(parseArgs())
    .then(() => {
      process.exit(0)
    })
    .catch((err) => {
      console.log(err)
      process.exit(1)
    })
}
