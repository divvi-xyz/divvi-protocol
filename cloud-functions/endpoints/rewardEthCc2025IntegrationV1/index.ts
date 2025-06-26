import { z } from 'zod'
import { loadSharedConfig } from '../../config/loadSharedConfig'
import { createEndpoint } from '../../services/createEndpoint'

const requestSchema = z.object({
  method: z.custom((arg) => arg === 'GET', 'only GET requests are allowed'),
  query: z.object({
    // TODO
  }),
})

export const helloEndpoint = createEndpoint('rewardEthCc2025IntegrationV1', {
  loadConfig: () =>
    loadSharedConfig({
      // add any endpoint-specific config here
    }),
  requestSchema,
  handler: async ({ res, config, parsedRequest: _parsedRequest }) => {
    const { GCLOUD_PROJECT } = config
    res.status(200).send({
      message: 'OK',
      // TODO: figure out what to return here
      data: `hello from ${GCLOUD_PROJECT}`,
    })
  },
})
