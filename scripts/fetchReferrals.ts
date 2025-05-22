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
    })
    .option('excludelist-files', {
      description:
        'Comma-separated list of CSV files with excluded addresses (e.g., file1.csv,file2.csv)',
      type: 'array',
      default: [],
      coerce: (arg: string[]) => {
        return arg
          .flatMap((s) => s.split(',').map((item) => item.trim()))
          .filter(Boolean)
      },
    })
    .option('fail-on-exclude', {
      description:
        'Fail if any of the excluded addresses are found in the referral events',
      type: 'boolean',
      default: false,
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
    protocol: argv['protocol'] as Protocol,
    protocolFilter: protocolFilters[argv['protocol'] as Protocol],
    outputDir,
    useStaging: argv['use-staging'],
    builderAllowList: argv['builder-allowlist-file'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
    excludeListFiles: argv['excludelist-files'],
    failOnExclude: argv['fail-on-exclude'],
  }
}

export async function fetchReferrals(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const referralEvents = await fetchReferralEvents(
    args.protocol,
    undefined,
    args.useStaging,
    endTimestampExclusive,
  )
  const uniqueEvents = removeDuplicates(referralEvents)
  const allowList = args.builderAllowList
    ? (parse(readFileSync(args.builderAllowList, 'utf-8').toString(), {
        skip_empty_lines: true,
        columns: true,
      }).map(
        ({ referrerId }: { referrerId: Address }) => referrerId,
      ) as Address[])
    : undefined

  const excludeList = args.excludeListFiles
    ? (args.excludeListFiles.flatMap((file) =>
        parse(readFileSync(file, 'utf-8').toString(), {
          skip_empty_lines: true,
          columns: true,
        }).map(({ referrerId }: { referrerId: Address }) => referrerId),
      ) as Address[])
    : undefined

  const filteredEvents = await args.protocolFilter(uniqueEvents, {
    allowList,
    excludeList,
    failOnExclude: args.failOnExclude,
  })
  const outputEvents = filteredEvents.map((event) => ({
    referrerId: event.referrerId,
    userAddress: event.userAddress,
    timestamp: new Date(event.timestamp * 1000).toISOString(),
  }))

  const outputFile = join(args.outputDir, 'referrals.csv')

  // Create directory if it doesn't exist
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, stringify(outputEvents, { header: true }), {
    encoding: 'utf-8',
  })
  console.log(`Wrote results to ${outputFile}`)

  if (args.builderAllowList) {
    const allowListOutputFile = join(args.outputDir, 'builder-allowlist.csv')
    copyFileSync(args.builderAllowList, allowListOutputFile)
    console.log(`Copied builder allowlist to ${allowListOutputFile}`)
  }

  for (const file of args.excludeListFiles) {
    const excludeListOutputFile = join(args.outputDir, `exclude-${file}`)
    copyFileSync(file, excludeListOutputFile)
    console.log(`Copied exclude list file ${file} to ${excludeListOutputFile}`)
  }
}

if (require.main === module) {
  getArgs()
    .then(fetchReferrals)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
