import { readFileSync, copyFileSync } from 'fs'
import yargs from 'yargs'
import { protocolFilters } from './protocolFilters'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'
import { Protocol, protocols } from './types'
import { Address } from 'viem'
import { parse } from 'csv-parse/sync'
import { closeRedisClient, getRedisClient } from '../src/redis'
import { ResultDirectory } from '../src/resultDirectory'

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
    .option('redis-connection', {
      type: 'string',
      description:
        'redis connection string, to run locally use redis://127.0.0.1:6379',
    }).argv

  const resultDirectory = new ResultDirectory({
    datadir: argv['datadir'],
    name: argv['protocol'],
    startTimestamp: new Date(argv['start-timestamp']),
    endTimestampExclusive: new Date(argv['end-timestamp']),
  })

  return {
    resultDirectory,
    protocol: argv['protocol'] as Protocol,
    protocolFilter: protocolFilters[argv['protocol'] as Protocol],
    useStaging: argv['use-staging'],
    builderAllowList: argv['builder-allowlist-file'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
    redisConnection: argv['redis-connection'],
  }
}

export async function fetchReferrals(
  args: Awaited<ReturnType<typeof getArgs>>,
) {
  const redis = args.redisConnection
    ? await getRedisClient(args.redisConnection)
    : undefined
  const resultDirectory = args.resultDirectory
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const referralEvents = await fetchReferralEvents(
    args.protocol,
    undefined,
    args.useStaging,
    endTimestampExclusive,
    redis,
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

  const filteredEvents = await args.protocolFilter(uniqueEvents, { allowList })
  const outputEvents = filteredEvents.map((event) => ({
    referrerId: event.referrerId,
    userAddress: event.userAddress,
    timestamp: new Date(event.timestamp * 1000).toISOString(),
  }))

  await resultDirectory.writeReferrals(outputEvents)
  console.log(`Wrote results to ${resultDirectory.referralsFileSuffix}.csv`)

  if (args.builderAllowList) {
    copyFileSync(
      args.builderAllowList,
      resultDirectory.builderAllowlistFilePath,
    )
    console.log(
      `Copied builder allowlist to ${resultDirectory.builderAllowlistFilePath}`,
    )
  }

  await closeRedisClient()
}

if (require.main === module) {
  getArgs()
    .then(fetchReferrals)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
