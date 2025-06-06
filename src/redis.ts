import { RedisClientType } from '@redis/client'
import { createClient } from 'redis'

let initRedisPromise: Promise<RedisClientType> | null = null
let redisClientInstance: RedisClientType | null = null

async function initRedis(url: string) {
  const redisClient: RedisClientType = createClient({ url })

  // Save the client instance for later shutdown
  redisClientInstance = redisClient

  redisClient.on('error', (err) => {
    throw err
  })

  await redisClient.connect()

  return redisClient
}

export async function getRedisClient(redisUrl: string) {
  initRedisPromise =
    initRedisPromise ||
    initRedis(redisUrl).catch((e) => {
      // Reset the promise so the next call will try again
      initRedisPromise = null
      throw e
    })

  return initRedisPromise
}

export async function closeRedisClient() {
  if (redisClientInstance) {
    await redisClientInstance.quit()
    redisClientInstance = null
    initRedisPromise = null
  }
}
