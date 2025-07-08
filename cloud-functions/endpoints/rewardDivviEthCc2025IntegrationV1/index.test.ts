import request from 'supertest'

import { rewardDivviEthCc2025IntegrationV1Endpoint } from './index'
import { getTestServer } from '../../../test/helpers'
import { runDivviRewards } from '../../../scripts/calculateRewards/divviIntegrationV1'

jest.mock('../../../scripts/calculateRewards/divviIntegrationV1')

process.env.GCLOUD_PROJECT = 'divvi-staging'
process.env.REWARD_POOL_OWNER_PRIVATE_KEY = '0x123'

const mockRunDivviRewards = jest.mocked(runDivviRewards)

describe(rewardDivviEthCc2025IntegrationV1Endpoint.name, () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRunDivviRewards.mockResolvedValue(undefined)

    let currentTime = 1000000000000

    // Note: we don't use jest fake timers, because it was interfering
    // with the Cloud Functions framework and causing the tests to get stuck
    jest.spyOn(Date, 'now').mockImplementation(() => {
      currentTime += 1
      return currentTime
    })

    // Mock setTimeout to execute immediately, advancing time
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback: any, ms?: number) => {
        currentTime += ms ?? 0
        callback()
        return 123 as any
      })
  })

  it('returns 200 when successful', async () => {
    const server = getTestServer(rewardDivviEthCc2025IntegrationV1Endpoint)
    const response = await request(server).post('/').expect(200)

    expect(response.body).toEqual({
      message: 'OK',
    })

    expect(mockRunDivviRewards).toHaveBeenCalledTimes(4)
    expect(mockRunDivviRewards).toHaveBeenCalledWith({
      privateKey: '0x123',
      dryRun: false,
      useAllowList: true,
    })
  })

  it('returns 500 when all executions fail', async () => {
    mockRunDivviRewards.mockRejectedValue(new Error('Test error'))

    const server = getTestServer(rewardDivviEthCc2025IntegrationV1Endpoint)
    const response = await request(server).post('/').expect(500)

    expect(response.body).toEqual({
      message: 'Unexpected error',
    })

    expect(mockRunDivviRewards).toHaveBeenCalledTimes(4)
  })

  it('returns 200 when some executions fail', async () => {
    mockRunDivviRewards
      .mockResolvedValueOnce(undefined) // First succeeds
      .mockRejectedValueOnce(new Error('Second execution failed')) // Second fails
      .mockResolvedValueOnce(undefined) // Third succeeds
      .mockResolvedValueOnce(undefined) // Fourth succeeds

    const server = getTestServer(rewardDivviEthCc2025IntegrationV1Endpoint)
    const response = await request(server).post('/').expect(200)

    expect(response.body).toEqual({
      message: 'OK',
    })
  })
})
