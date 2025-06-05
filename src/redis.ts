import { RedisClientType } from '@redis/client'
import { createClient } from 'redis'

let initRedisPromise: Promise<RedisClientType> | null = null

async function initRedis({ host, port }: { host: string; port: number }) {
  const redisClient: RedisClientType = createClient({
    socket: {
      host,
      port,
    },
  })
  redisClient.on('error', (err) => {
    throw err
  })

  await redisClient.connect()

  return redisClient
}

export async function getRedisClient(redisConfig: {
  host: string
  port: number
}) {
  initRedisPromise =
    initRedisPromise ||
    initRedis(redisConfig).catch((e) => {
      // Reset the promise so the next call will try again
      initRedisPromise = null
      throw e
    })

  return initRedisPromise
}
