import { z } from 'zod'
import { loadSharedConfig } from '../../config/loadSharedConfig'
import { createEndpoint } from '../../services/createEndpoint'
import { runDivviRewards } from '../../../scripts/calculateRewards/divviIntegrationV1'
import { isHex } from 'viem'
import { logger } from '../../log'

// The Cloud Function is run by GCP cloud scheduler every minute.
// But internally, we run the rewards calculation every 15 seconds.
// so updates are more frequent than the scheduler.
const EXECUTION_TIME_LIMIT_MS = 55_000 // 55 seconds to leave buffer
const EXECUTION_INTERVAL_MS = 15_000 // 15 seconds
const EXECUTION_BUFFER_MS = 5_000 // 5 seconds

const hexSchema = z.string().refine(
  (val) => isHex(val),
  (val) => ({
    message: `Invalid hex string ${val}`,
  }),
)

const requestSchema = z.object({
  method: z.custom((arg) => arg === 'POST', 'only POST requests are allowed'),
  query: z.object({
    // Nothing for now
  }),
})

export const rewardDivviEthCc2025IntegrationV1Endpoint = createEndpoint(
  'rewardDivviEthCc2025IntegrationV1',
  {
    loadConfig: () =>
      loadSharedConfig({
        REWARD_POOL_OWNER_PRIVATE_KEY: hexSchema,
      }),
    requestSchema,
    handler: async ({ res, config, parsedRequest: _parsedRequest }) => {
      const startTime = Date.now()

      let executionCount = 0
      const errors: Array<any> = []

      logger.info('Starting periodic rewards execution...')

      while (Date.now() - startTime < EXECUTION_TIME_LIMIT_MS) {
        const attemptStartTime = Date.now()
        executionCount++

        try {
          logger.info(`Executing rewards run #${executionCount}`)

          await runDivviRewards({
            privateKey: config.REWARD_POOL_OWNER_PRIVATE_KEY,
            dryRun: false,
            useAllowList: true,
          })

          logger.info(`Successfully completed rewards run #${executionCount}`)
        } catch (err) {
          logger.error({ err }, `Error in rewards run #${executionCount}`)
          errors.push(err)
        }

        const now = Date.now()
        const executionDuration = now - attemptStartTime
        const remainingTime = EXECUTION_TIME_LIMIT_MS - (now - startTime)

        // If we don't have enough time for another full cycle, break
        if (remainingTime < EXECUTION_INTERVAL_MS + EXECUTION_BUFFER_MS) {
          // 5s buffer for execution time
          logger.info(
            `Stopping execution loop - insufficient time remaining: ${remainingTime}ms`,
          )
          break
        }

        // Calculate sleep time (interval minus execution time)
        const sleepTime = Math.max(0, EXECUTION_INTERVAL_MS - executionDuration)

        if (sleepTime > 0) {
          logger.info(`Sleeping for ${sleepTime}ms before next execution`)
          await new Promise((resolve) => setTimeout(resolve, sleepTime))
        }
      }

      const totalDuration = Date.now() - startTime
      logger.info(
        `Completed ${executionCount} executions in ${totalDuration}ms`,
      )

      // If all attempts failed, return 500
      if (errors.length === executionCount && executionCount > 0) {
        throw new Error('All execution attempts failed')
      }

      if (errors.length > 0) {
        logger.warn(
          `${errors.length} out of ${executionCount} executions failed`,
        )
      }

      // At least some successful
      res.status(200).json({
        message: 'OK',
      })
    },
  },
)
