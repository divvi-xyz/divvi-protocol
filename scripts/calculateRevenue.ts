import calculateRevenueHandlers from './calculateRevenue/protocols'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { readFileSync, writeFileSync } from 'fs'
import yargs from 'yargs'
import { protocols, Protocol } from './types'

async function main(args: ReturnType<typeof parseArgs>) {
  const inputFile = args['input-file'] ?? `${args['protocol']}-referrals.csv`
  const outputFile = args['output-file'] ?? `${args['protocol']}-revenue.csv`

  const eligibleUsers = parse(readFileSync(inputFile, 'utf-8').toString(), {
    skip_empty_lines: true,
    delimiter: ',',
  })
  const handler = calculateRevenueHandlers[args['protocol'] as Protocol]

  const allResults: Array<{
    referrerId: string
    address: string
    revenue: number
  }> = []

  for (let i = 0; i < eligibleUsers.length; i++) {
    const [referrerId, address] = eligibleUsers[i]
    console.log(
      `Calculating revenue for ${address} (${i + 1}/${eligibleUsers.length})`,
    )
    const revenue = await handler({
      address,
      startTimestamp: new Date(args['start-timestamp']),
      endTimestamp: new Date(args['end-timestamp']),
    })
    allResults.push({
      referrerId,
      address,
      revenue,
    })
  }

  writeFileSync(outputFile, stringify(allResults), {
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
