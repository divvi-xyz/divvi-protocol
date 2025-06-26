import { rewardDivviEthCc2025IntegrationV1Endpoint } from './index'
import request from 'supertest'
import { getTestServer } from '../../../test/helpers'
import { runDivviRewards } from '../../../scripts/calculateRewards/divviIntegrationV1'

jest.mock('../../../scripts/calculateRewards/divviIntegrationV1')

process.env.GCLOUD_PROJECT = 'divvi-staging'
process.env.REWARD_POOL_OWNER_PRIVATE_KEY = '0x123'

describe(rewardDivviEthCc2025IntegrationV1Endpoint.name, () => {
  it('returns 200', async () => {
    const server = getTestServer(rewardDivviEthCc2025IntegrationV1Endpoint)
    await request(server).post('/').expect(200).expect({
      message: 'OK',
    })

    expect(runDivviRewards).toHaveBeenCalledWith({
      privateKey: '0x123',
      dryRun: true,
      useAllowList: true,
    })
  })
})
