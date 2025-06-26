import { z } from 'zod'
import { loadSharedConfig } from '../../config/loadSharedConfig'
import { createEndpoint } from '../../services/createEndpoint'
import { runDivviRewards } from '../../../scripts/calculateRewards/divviIntegrationV1'
import { isHex } from 'viem'

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
      await runDivviRewards({
        privateKey: config.REWARD_POOL_OWNER_PRIVATE_KEY,
        dryRun: true, // TODO: switch to false when ready
        useAllowList: true,
      })

      res.status(200).json({
        message: 'OK',
      })
    },
  },
)
