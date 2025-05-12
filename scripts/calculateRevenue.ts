import calculateRevenueHandlers from './calculateRevenue/protocols'
import { stringify } from 'csv-stringify/sync'
import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { protocols } from './types'
import { fetchUniqueReferralEvents } from './utils/referrals'
import { protocolFilters } from './protocolFilters'

async function main(args: ReturnType<typeof parseArgs>) {
  const outputFile = args['output-file'] ?? `${args['protocol']}-revenue.csv`

  const uniqueReferralEvents = await fetchUniqueReferralEvents(
    args.protocol,
    undefined,
    args.useStaging,
  )

  const filteredEvents =
    await protocolFilters[args.protocol](uniqueReferralEvents)

  const outputEvents = filteredEvents.map((event) => ({
    referrerId: event.referrerId,
    userAddress: event.userAddress,
    timestamp: event.timestamp,
  }))

  const handler = calculateRevenueHandlers[args.protocol]

  const allResults: Array<{
    referrerId: string
    userAddress: string
    revenue: number
  }> = []

  for (let i = 0; i < outputEvents.length; i++) {
    const { referrerId, userAddress } = outputEvents[i]
    console.log(
      `Calculating revenue for ${userAddress} (${i + 1}/${outputEvents.length})`,
    )
    const revenue = await handler({
      address: userAddress,
      startTimestamp: new Date(args['start-timestamp']),
      endTimestamp: new Date(args['end-timestamp']),
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
    .option('use-staging', {
      description: 'use staging registry contract',
      type: 'boolean',
      default: false,
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
