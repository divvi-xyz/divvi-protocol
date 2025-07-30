import { writeFileSync, mkdirSync } from 'fs'
import yargs from 'yargs'
import { protocolFilters } from './protocolFilters'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'
import { NetworkId, Protocol, protocols, ReferralEvent } from './types'
import { stringify } from 'csv-stringify/sync'
import { toPeriodFolderName } from './utils/dateFormatting'
import { dirname, join } from 'path'
import { closeRedisClient, getRedisClient } from '../src/redis'
import { findQualifyingNetworkReferral } from './findQualifyingReferral/qualifyingNetworkReferral'
import { RedisClientType } from '@redis/client'

// @ts-expect-error unused pending optimization
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const protocolToQualifyingReferralFinder: Partial<
  Record<
    Protocol,
    ({
      users,
      startTimestamp,
      endTimestampExclusive,
      redis,
    }: {
      users: Set<string>
      startTimestamp: Date
      endTimestampExclusive: Date
      redis?: RedisClientType
    }) => Promise<ReferralEvent[]>
  >
> = {
  'base-v0': (args) =>
    findQualifyingNetworkReferral({
      ...args,
      networkId: NetworkId['base-mainnet'],
    }),
  'mantle-v0': (args) =>
    findQualifyingNetworkReferral({
      ...args,
      networkId: NetworkId['mantle-mainnet'],
    }),
  morph: (args) =>
    findQualifyingNetworkReferral({
      ...args,
      networkId: NetworkId['morph-mainnet'],
    }),
}

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
    .option('redis-connection', {
      type: 'string',
      description:
        'redis connection string, to run locally use redis://127.0.0.1:6379',
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

  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const referralEvents = await fetchReferralEvents(
    args.protocol,
    undefined,
    args.useStaging,
    endTimestampExclusive,
    redis,
  )
  const uniqueEvents = removeDuplicates(referralEvents)
  let qualifyingEvents = uniqueEvents
  // TODO: we'll enable this after optimizing the hypersync query
  const findQualifyingReferrals = null // protocolToQualifyingReferralFinder[args.protocol]
  if (findQualifyingReferrals) {
    const qualifyingReferralEvents = await findQualifyingReferrals({
      users: new Set(uniqueEvents.map((event) => event.userAddress)),
      startTimestamp,
      endTimestampExclusive,
      redis,
    })
    qualifyingEvents = qualifyingReferralEvents
  }

  const filteredEvents = await args.protocolFilter(qualifyingEvents)
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
