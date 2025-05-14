import calculateRevenueHandlers from './calculateRevenue/protocols'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { readFileSync, writeFileSync } from 'fs'
import yargs from 'yargs'
import { protocols, Protocol } from './types'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_SECONDS = 30 * 60 // 30 minutes

async function main(args: ReturnType<typeof parseArgs>) {
  const inputFile = args['input-file'] ?? `${args['protocol']}-referrals.csv`
  const outputFile = args['output-file'] ?? `${args['protocol']}-revenue.csv`

  const eligibleUsers = parse(readFileSync(inputFile, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
    columns: true,
  })
  const handler = calculateRevenueHandlers[args['protocol'] as Protocol]

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

    const referralDate = new Date(timestamp - REFERRAL_TIME_BUFFER_IN_SECONDS)
    const endTimestamp = new Date(args['end-timestamp'])
    const rewardPeriodStartDate = new Date(args['start-timestamp'])

    // if the referral happened after the start of the period, only calculate revenue from the referral block onwards so that we exclude user activity before the referral
    const startTimestamp =
      referralDate.getTime() > rewardPeriodStartDate.getTime()
        ? referralDate
        : rewardPeriodStartDate

    if (startTimestamp.getTime() > endTimestamp.getTime()) {
      console.log(
        `Referral date is after end date, skipping ${userAddress} (referral date: ${timestamp})`,
      )
      continue
    }

    const revenue = await handler({
      address: userAddress,
      startTimestamp,
      endTimestamp,
    })
    allResults.push({
      referrerId,
      userAddress,
      revenue,
    })
  }

  writeFileSync(outputFile, stringify(allResults, { header: true }), {
    encoding: 'utf-8',
  })

  console.log(`Wrote results to ${outputFile}`)
}

function parseArgs() {
  return yargs
    .option('input-file', {
      alias: 'i',
      description: 'input file path of referrals, newline separated',
      type: 'string',
      demandOption: false,
    })
    .option('output-file', {
      alias: 'o',
      description: 'output file path to write csv results',
      type: 'string',
      demandOption: false,
    })
    .option('protocol', {
      alias: 'p',
      description: 'ID of protocol to check against',
      choices: protocols,
      demandOption: true,
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'timestamp at which to start checking for revenue (new Date() compatible)',
      type: 'number',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'timestamp at which to stop checking for revenue (new Date() compatible)',
      type: 'number',
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
