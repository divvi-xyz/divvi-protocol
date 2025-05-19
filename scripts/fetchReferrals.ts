import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'fs'
import yargs from 'yargs'
import { protocolFilters } from './protocolFilters'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'
import { Protocol, protocols } from './types'
import { stringify } from 'csv-stringify/sync'
import { Address } from 'viem'
import { parse } from 'csv-parse/sync'
import { toPeriodFolderName } from './utils/dateFormatting'
import { dirname, join } from 'path'

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('protocol', {
      description: 'protocol that the referrals are for',
      demandOption: true,
      choices: protocols,
    })
    .option('datadir', {
      description: 'Directory to save data',
      default: 'rewards',
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'Start timestamp (inclusive) (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'End timestamp (exclusive) (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('use-staging', {
      description: 'use staging registry contract',
      type: 'boolean',
      default: false,
    })
    .option('builder-allowlist-file', {
      alias: 'a',
      description: 'a csv file of allowlisted builders ',
      type: 'string',
    }).argv

  return {
    datadir: argv['datadir'],
    protocol: argv['protocol'] as Protocol,
    protocolFilter: protocolFilters[argv['protocol'] as Protocol],
    output: argv['output-file'] ?? `${argv['protocol']}-referrals.csv`,
    useStaging: argv['use-staging'],
    builderAllowList: argv['builder-allowlist-file'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
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
  const builderAllowList = args.builderAllowList
    ? parse(readFileSync(args.builderAllowList, 'utf-8').toString(), {
        skip_empty_lines: true,
        columns: true,
      }).map(({ referrerId }: { referrerId: Address }) => referrerId)
    : undefined

  const filteredEvents = await args.protocolFilter(
    uniqueEvents,
    builderAllowList,
  )
  const outputEvents = filteredEvents.map((event) => ({
    referrerId: event.referrerId,
    userAddress: event.userAddress,
    timestamp: event.timestamp,
  }))

  const outputDir = join(
    args.datadir,
    args.protocol,
    toPeriodFolderName({
      startTimestamp: new Date(args.startTimestamp),
      endTimestampExclusive: new Date(args.endTimestampExclusive),
    }),
  )
  const outputFile = `${outputDir}/referrals.csv`

  // Create directory if it doesn't exist
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, stringify(outputEvents, { header: true }), {
    encoding: 'utf-8',
  })
  console.log(`Wrote results to ${outputFile}`)

  if (args.builderAllowList) {
    const allowListOutputFile = `${outputDir}/builder-allowlist.csv`
    copyFileSync(args.builderAllowList, allowListOutputFile)
    console.log(`Copied builder allowlist to ${allowListOutputFile}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
