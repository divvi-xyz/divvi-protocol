import calculateKpiHandlers, { calculateKpiBatchHandlers } from './calculateKpi/protocols'
import yargs from 'yargs'
import { KpiResults, Protocol, protocols } from './types'
import { ResultDirectory } from '../src/resultDirectory'
import { RedisClientType } from '@redis/client'
import { closeRedisClient, getRedisClient } from '../src/redis'

// Buffer to account for time it takes for a referral to be registered, since the referral transaction is made first and the referral registration happens on a schedule
const REFERRAL_TIME_BUFFER_IN_MS = 30 * 60 * 1000 // 30 minutes
// Calculate KPIs for end users in batches to speed things up
const PARALLEL_BATCH_SIZE = 20
const HYPERSYNC_BATCH_SIZE = 100

interface ReferralData {
  referrerId: string
  userAddress: string
  timestamp: string
}

// for testing
export const _calculateKpiBatch = calculateKpiBatch

async function calculateKpiBatch({
  eligibleUsers,
  batchSize,
  startTimestamp,
  endTimestampExclusive,
  protocol,
  redis,
}: {
  eligibleUsers: ReferralData[]
  batchSize: number
  startTimestamp: Date
  endTimestampExclusive: Date
  protocol: Protocol
  redis?: RedisClientType
}): Promise<KpiResults> {
  const results: KpiResults = []

  // Check if this protocol has a batch handler
  const batchHandler = calculateKpiBatchHandlers[protocol]

  if (batchHandler) {
    // Use the protocol-specific batch handler
    console.log(`Using batch handler for protocol ${protocol}`)

    // Filter out users whose referral timestamp is after the end date
    const filteredUsers = eligibleUsers.filter(({ timestamp }) => {
      const referralTimestamp = new Date(
        Date.parse(timestamp) - REFERRAL_TIME_BUFFER_IN_MS,
      )
      if (referralTimestamp.getTime() >= endTimestampExclusive.getTime()) {
        console.log(
          `Referral date is at or after end date (exclusive), skipping user (registration tx date: ${timestamp}) for campaign ${protocol}`,
        )
        return false
      }
      return true
    })

    // Extract unique user addresses while maintaining order and relationships
    const uniqueUserMap = new Map<string, { timestamp: string; referrerId: string }>()
    
    // Build a map of unique users with their data, keeping the first occurrence
    filteredUsers.forEach((user) => {
      if (!uniqueUserMap.has(user.userAddress)) {
        uniqueUserMap.set(user.userAddress, {
          timestamp: user.timestamp,
          referrerId: user.referrerId
        })
      }
    })
    
    const userAddresses = Array.from(uniqueUserMap.keys())
    const referralTimestamps = Array.from(uniqueUserMap.values()).map(userData => new Date(userData.timestamp))
    const referrerIds = Array.from(uniqueUserMap.values()).map(userData => userData.referrerId)

    // Process in batches similar to qualifyingNetworkReferral.ts
    const requestsPerBatch = batchSize // number of parallel requests
    const usersPerRequest = HYPERSYNC_BATCH_SIZE // number of users per hypersync request

    for (
      let i = 0;
      i < userAddresses.length;
      i += requestsPerBatch * usersPerRequest
    ) {
      // Create all batches with their corresponding data upfront
      const batches = Array.from({ length: requestsPerBatch }, (_, j) => {
        const startIndex = i + j * usersPerRequest
        const endIndex = Math.min(startIndex + usersPerRequest, userAddresses.length)
        
        return {
          users: userAddresses.slice(startIndex, endIndex),
          referralTimestamps: referralTimestamps.slice(startIndex, endIndex),
          referrerIds: referrerIds.slice(startIndex, endIndex),
          startIndex
        }
      }).filter(batch => batch.users.length > 0)

      console.log(
        `Processing user batch ${Math.floor(i / (requestsPerBatch * usersPerRequest)) + 1} of ${Math.ceil(userAddresses.length / (requestsPerBatch * usersPerRequest))} for campaign ${protocol}`,
      )

      const batchResults = await Promise.all(
        batches.map(batch =>
          batchHandler({
            users: batch.users,
            referralTimestamps: batch.referralTimestamps,
            referrerIds: batch.referrerIds,
            startTimestamp,
            endTimestampExclusive,
            redis,
            index: batch.startIndex,
          })
        )
      )

      results.push(...batchResults.flat())
    }
  } else {
    // Fall back to the original per-user processing
    console.log(`Using per-user processing for protocol ${protocol}`)

    for (let i = 0; i < eligibleUsers.length; i += batchSize) {
      const batch = eligibleUsers.slice(i, i + batchSize)
      const startTs = Date.now()

      const batchPromises = batch.map(
        async ({ referrerId, userAddress, timestamp }) => {
          const referralTimestamp = new Date(
            Date.parse(timestamp) - REFERRAL_TIME_BUFFER_IN_MS,
          )

          if (referralTimestamp.getTime() >= endTimestampExclusive.getTime()) {
            console.log(
              `Referral date is at or after end date (exclusive), skipping ${userAddress} (registration tx date: ${timestamp}) for campaign ${protocol}`,
            )
            return null
          }

          const calculatedKpi = await calculateKpiHandlers[protocol]({
            address: userAddress,
            // if the referral happened after the start of the period, only calculate KPI from the referral block onwards so that we exclude user activity before the referral
            startTimestamp:
              referralTimestamp.getTime() > startTimestamp.getTime()
                ? referralTimestamp
                : startTimestamp,
            endTimestampExclusive,
            redis,
            referrerId,
          })

          return Array.isArray(calculatedKpi)
            ? calculatedKpi
            : [{ ...calculatedKpi, userAddress, referrerId }]
        },
      )

      const batchResults = (await Promise.all(batchPromises)).flat()
      results.push(
        ...batchResults.filter(
          (result): result is NonNullable<typeof result> => result !== null,
        ),
      )

      console.log(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(eligibleUsers.length / batchSize)} for campaign ${protocol} in ${Date.now() - startTs}ms`,
      )
    }
  }
  return results
}

export async function calculateKpi(args: Awaited<ReturnType<typeof getArgs>>) {
  const startTimestamp = new Date(args.startTimestamp)
  const endTimestampExclusive = new Date(args.endTimestampExclusive)
  const protocol = args.protocol
  const resultDirectory = args.resultDirectory

  const eligibleUsers = await resultDirectory.readReferrals()

  const redis = args.redisConnection
    ? await getRedisClient(args.redisConnection)
    : undefined

  const allResults = await calculateKpiBatch({
    eligibleUsers,
    batchSize: PARALLEL_BATCH_SIZE,
    protocol,
    startTimestamp,
    endTimestampExclusive,
    redis,
  })

  await resultDirectory.writeKpi(allResults)

  console.log(`Wrote results to ${resultDirectory.kpiFileSuffix}.csv`)

  await closeRedisClient()
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
        'Start timestamp (inclusive) for KPI calculation (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'End timestamp (exclusive) for KPI calculation (new Date() compatible epoch milliseconds or string)',
      type: 'string',
      demandOption: true,
    })
    .option('datadir', {
      description: 'Directory to save data',
      default: 'rewards',
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
    protocol: argv['protocol'],
    startTimestamp: argv['start-timestamp'],
    endTimestampExclusive: argv['end-timestamp'],
    redisConnection: argv['redis-connection'],
  }
}

if (require.main === module) {
  getArgs()
    .then(calculateKpi)
    .catch((err) => {
      console.log(err)
      process.exit(1)
    })
}
