import { writeFileSync, readFileSync } from 'fs'
import yargs from 'yargs'
import { protocolFilters } from './protocolFilters'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'
import { Protocol, protocols } from './types'
import { stringify } from 'csv-stringify/sync'
import { Address } from 'viem'
import { parse } from 'csv-parse/sync'

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('protocol', {
      description: 'protocol that the referrals are for',
      demandOption: true,
      choices: protocols,
    })
    .option('output-file', {
      alias: 'o',
      description: 'output file',
      type: 'string',
    })
    .option('use-staging', {
      description: 'use staging registry contract',
      type: 'boolean',
      default: false,
    })
    .option('allowlist-file', {
      alias: 'a',
      description: 'allowlist file',
      type: 'string',
    }).argv

  return {
    protocol: argv['protocol'] as Protocol,
    protocolFilter: protocolFilters[argv['protocol'] as Protocol],
    output: argv['output-file'] ?? `${argv['protocol']}-referrals.csv`,
    useStaging: argv['use-staging'],
    allowlist: argv['allowlist-file'],
  }
}

async function main() {
  const args = await getArgs()

  const referralEvents = await fetchReferralEvents(
    args.protocol,
    undefined,
    args.useStaging,
  )
  const uniqueEvents = removeDuplicates(referralEvents)
  const allowList = args.allowlist
    ? (parse(readFileSync(args.allowlist, 'utf-8').toString(), {
        skip_empty_lines: true,
        delimiter: ',',
        columns: true,
      }) as Address[])
    : undefined

  const filteredEvents = await args.protocolFilter(uniqueEvents, allowList)
  const outputEvents = filteredEvents.map((event) => ({
    referrerId: event.referrerId,
    userAddress: event.userAddress,
    timestamp: event.timestamp,
  }))
  writeFileSync(args.output, stringify(outputEvents, { header: true }), {
    encoding: 'utf-8',
  })
  console.log(`Wrote results to ${args.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
