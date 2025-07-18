import request from 'supertest'
import { GraphQLClient } from 'graphql-request'
import { getViemPublicClient } from '../../../scripts/utils'
import { proposeSafeClaimRewardTx } from './proposeSafeClaimRewardTx'
import { redistributeValoraRewards } from './index'
import { getTestServer } from '../../../test/helpers'
import { NetworkId } from '../../../scripts/types'
import { distributeRewards } from './distributeRewards'
import { listGCSFiles } from '../../../scripts/utils/uploadFileToCloudStorage'
import { getLatestRewards } from './getLatestRewards'
import { campaigns } from '../../../src/campaigns'
import { Address } from 'viem'

// Mock external dependencies
jest.mock('graphql-request', () => ({
  GraphQLClient: jest.fn(),
  gql: jest.fn().mockImplementation((query) => query),
}))
jest.mock('../../../scripts/utils')
jest.mock('./proposeSafeClaimRewardTx')
jest.mock('./distributeRewards')
jest.mock('../../../scripts/utils/uploadFileToCloudStorage')
jest.mock('./getLatestRewards')

const mockGraphQLClient = jest.mocked(GraphQLClient)
const mockGetViemPublicClient = jest.mocked(getViemPublicClient)
const mockProposeSafeClaimRewardTx = jest.mocked(proposeSafeClaimRewardTx)
const mockDistributeRewards = jest.mocked(distributeRewards)
const mockListGCSFiles = jest.mocked(listGCSFiles)
const mockGetLatestRewards = jest.mocked(getLatestRewards)

const valoraDivviIdentifier =
  '0x1234567890123456789012345678901234567890' as Address

// Mock environment variables
process.env.VALORA_DIVVI_IDENTIFIER = valoraDivviIdentifier
process.env.VALORA_REWARDS_POOL_OWNER_PRIVATE_KEY =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
process.env.DIVVI_INDEXER_URL = 'https://test-indexer.example.com'
process.env.ALCHEMY_KEY = 'test-alchemy-key'
process.env.GCLOUD_PROJECT = 'divvi-staging'
process.env.GCS_BUCKET = 'divvi-staging-bucket'

const latestRewards = {
  filename:
    'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
  rewardAmounts: [
    {
      referrerId: valoraDivviIdentifier,
      rewardAmount: '1000000',
    },
    {
      referrerId: '0x1234567890123456789012345678901234567891' as Address,
      rewardAmount: '2000000',
    },
  ],
}

const mockGcsFiles = [
  {
    name: 'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
    url: 'https://storage.googleapis.com/divvi-staging/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
  },
]

describe('redistributeValoraRewards', () => {
  let mockClient: jest.Mocked<GraphQLClient>
  let mockViemClient: { readContract: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock GraphQL client
    mockClient = {
      request: jest.fn(),
    } as unknown as jest.Mocked<GraphQLClient>
    mockGraphQLClient.mockImplementation(() => mockClient)

    // Mock Viem client
    mockViemClient = {
      readContract: jest.fn(),
    }
    mockGetViemPublicClient.mockReturnValue(
      mockViemClient as unknown as ReturnType<typeof getViemPublicClient>,
    )

    mockListGCSFiles.mockResolvedValue(mockGcsFiles)
    mockGetLatestRewards.mockResolvedValue(latestRewards)
    mockProposeSafeClaimRewardTx.mockResolvedValue(
      'https://app.safe.global/transactions/tx?safe=celo:0x1234567890123456789012345678901234567890&id=0xabc123',
    )
    mockDistributeRewards.mockResolvedValue(
      '0xabcdef1234567890123456789012345678901234567890123456789012345678',
    )
  })

  describe('POST /', () => {
    it('should return 200 with rewards data when successful', async () => {
      // Mock GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
          },
        ],
      })

      // Mock pending rewards
      mockViemClient.readContract
        .mockResolvedValueOnce(BigInt(1000000)) // First provider has rewards
        .mockResolvedValueOnce(BigInt(0)) // Second provider has no rewards

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: '1000000',
            claimRewardsSafeTxUrl:
              'https://app.safe.global/transactions/tx?safe=celo:0x1234567890123456789012345678901234567890&id=0xabc123',
            distributeRewardsTxHash:
              '0xabcdef1234567890123456789012345678901234567890123456789012345678',
          },
          {
            rewardsProvider: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
            rewardPoolAddress: '0x6f599b879541d289e344e325f4d9badf8c5bb49e',
            pendingRewards: '0',
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
          },
        ],
      })

      // Verify GraphQL query was called
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('RewardsAgreement')]),
        {
          rewardsConsumer: valoraDivviIdentifier,
        },
      )

      // Verify getLatestRewards was called
      expect(mockGetLatestRewards).toHaveBeenCalledTimes(1)
      expect(mockGetLatestRewards).toHaveBeenCalledWith({
        gcsFiles: mockGcsFiles,
        protocol: 'celo-pg',
      })

      // Verify Safe transaction was proposed for provider with rewards
      expect(mockProposeSafeClaimRewardTx).toHaveBeenCalledTimes(1)
      expect(mockProposeSafeClaimRewardTx).toHaveBeenCalledWith({
        safeAddress: valoraDivviIdentifier,
        rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
        pendingRewards: BigInt(1000000),
        networkId: NetworkId['celo-mainnet'],
        alchemyKey: 'test-alchemy-key',
      })

      // Verify rewards were distributed
      expect(mockDistributeRewards).toHaveBeenCalledTimes(1)
      expect(mockDistributeRewards).toHaveBeenCalledWith({
        campaign: campaigns[0],
        rewardAmounts: latestRewards.rewardAmounts,
        valoraDivviIdentifier,
        valoraRewards: BigInt(1000000),
        valoraRewardsPoolOwnerPrivateKey:
          '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        alchemyKey: 'test-alchemy-key',
        rewardsFilename: latestRewards.filename,
      })
    })

    it('should handle providers not found in campaigns', async () => {
      // Mock GraphQL response with unknown provider
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x9999999999999999999999999999999999999999', // Unknown provider
          },
        ],
      })

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x9999999999999999999999999999999999999999',
            rewardPoolAddress: null,
            pendingRewards: null,
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
          },
        ],
      })

      // Verify no Safe transaction was proposed and no rewards were distributed
      expect(mockProposeSafeClaimRewardTx).not.toHaveBeenCalled()
      expect(mockDistributeRewards).not.toHaveBeenCalled()
    })

    it('should handle empty rewards providers list', async () => {
      // Mock empty GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [],
      })

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [],
      })

      // Verify no Safe transaction was proposed
      expect(mockProposeSafeClaimRewardTx).not.toHaveBeenCalled()
    })

    it('should handle errors when reading pending rewards', async () => {
      // Mock GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
        ],
      })

      // Mock error when reading pending rewards
      mockViemClient.readContract.mockRejectedValue(
        new Error('Contract read failed'),
      )

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: null,
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
            error:
              'Failed to process rewards for 0x0423189886d7966f0dd7e7d256898daeee625dca: Contract read failed',
          },
        ],
      })

      // Verify no Safe transaction was proposed
      expect(mockProposeSafeClaimRewardTx).not.toHaveBeenCalled()
    })

    it('should handle errors when rewards mismatch from GCS file', async () => {
      // Mock GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
        ],
      })

      // Mock pending rewards
      mockViemClient.readContract.mockResolvedValue(BigInt(500000)) // does not match the rewards in the GCS file

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: '500000',
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
            error:
              'Failed to process rewards for 0x0423189886d7966f0dd7e7d256898daeee625dca: Rewards mismatch: 1000000 !== 500000',
          },
        ],
      })
    })

    it('should handle errors when proposing Safe transaction', async () => {
      // Mock GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
        ],
      })

      // Mock pending rewards
      mockViemClient.readContract.mockResolvedValue(BigInt(1000000))

      // Mock error when proposing Safe transaction
      mockProposeSafeClaimRewardTx.mockRejectedValue(
        new Error('Safe transaction failed'),
      )

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: '1000000',
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
            error:
              'Failed to process rewards for 0x0423189886d7966f0dd7e7d256898daeee625dca: Safe transaction failed',
          },
        ],
      })

      // Verify Safe transaction was attempted
      expect(mockProposeSafeClaimRewardTx).toHaveBeenCalledWith({
        safeAddress: valoraDivviIdentifier,
        rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
        pendingRewards: BigInt(1000000),
        networkId: NetworkId['celo-mainnet'],
        alchemyKey: 'test-alchemy-key',
      })
    })

    it('should handle errors when distributing rewards', async () => {
      // Mock GraphQL response
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
        ],
      })

      // Mock pending rewards
      mockViemClient.readContract.mockResolvedValue(BigInt(1000000))

      // Mock error when distributing rewards
      mockDistributeRewards.mockRejectedValue(
        new Error('Distribute rewards failed'),
      )

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: '1000000',
            claimRewardsSafeTxUrl:
              'https://app.safe.global/transactions/tx?safe=celo:0x1234567890123456789012345678901234567890&id=0xabc123',
            distributeRewardsTxHash: null,
            error:
              'Failed to process rewards for 0x0423189886d7966f0dd7e7d256898daeee625dca: Distribute rewards failed',
          },
        ],
      })

      // Verify Safe transaction was attempted
      expect(mockProposeSafeClaimRewardTx).toHaveBeenCalledWith({
        safeAddress: valoraDivviIdentifier,
        rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
        pendingRewards: BigInt(1000000),
        networkId: NetworkId['celo-mainnet'],
        alchemyKey: 'test-alchemy-key',
      })
    })

    it('should handle mixed success and failure scenarios', async () => {
      // Mock GraphQL response with multiple providers
      mockClient.request.mockResolvedValue({
        DivviRegistry_RewardsAgreementRegistered: [
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
          },
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
          },
          {
            rewardsConsumer: valoraDivviIdentifier,
            rewardsProvider: '0x9999999999999999999999999999999999999999', // Unknown provider
          },
        ],
      })

      // Mock mixed results
      mockViemClient.readContract
        .mockResolvedValueOnce(BigInt(1000000)) // First provider has rewards
        .mockRejectedValueOnce(new Error('Contract read failed')) // Second provider fails
      mockGetLatestRewards.mockResolvedValue(latestRewards)

      // Mock Safe transaction proposal
      mockProposeSafeClaimRewardTx.mockResolvedValue(
        'https://app.safe.global/transactions/tx?safe=celo:0x1234567890123456789012345678901234567890&id=0xabc123',
      )

      const server = getTestServer(redistributeValoraRewards)
      const response = await request(server).post('/').expect(200)

      expect(response.body).toEqual({
        rewards: [
          {
            rewardsProvider: '0x0423189886d7966f0dd7e7d256898daeee625dca',
            rewardPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
            pendingRewards: '1000000',
            claimRewardsSafeTxUrl:
              'https://app.safe.global/transactions/tx?safe=celo:0x1234567890123456789012345678901234567890&id=0xabc123',
            distributeRewardsTxHash:
              '0xabcdef1234567890123456789012345678901234567890123456789012345678',
          },
          {
            rewardsProvider: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
            rewardPoolAddress: '0x6f599b879541d289e344e325f4d9badf8c5bb49e',
            pendingRewards: null,
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
            error:
              'Failed to process rewards for 0xc95876688026be9d6fa7a7c33328bd013effa2bb: Contract read failed',
          },
          {
            rewardsProvider: '0x9999999999999999999999999999999999999999',
            rewardPoolAddress: null,
            pendingRewards: null,
            claimRewardsSafeTxUrl: null,
            distributeRewardsTxHash: null,
          },
        ],
      })
    })

    it('should reject non-POST requests', async () => {
      const server = getTestServer(redistributeValoraRewards)

      // Test GET request
      await request(server).get('/').expect(400)

      // Test PUT request
      await request(server).put('/').expect(400)

      // Test DELETE request
      await request(server).delete('/').expect(400)
    })

    it('should handle GraphQL client errors', async () => {
      // Mock GraphQL client error
      mockClient.request.mockRejectedValue(
        new Error('GraphQL connection failed'),
      )

      const server = getTestServer(redistributeValoraRewards)

      // The endpoint should handle this gracefully and return an error response
      // Since the error is thrown in the handler, it should result in a 500 status
      await request(server).post('/').expect(500)
    })
  })
})
