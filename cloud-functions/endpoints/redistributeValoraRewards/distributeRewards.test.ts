import { Address, Hex, createWalletClient, keccak256, toBytes } from 'viem'
import { NetworkId } from '../../../scripts/types'
import { Campaign } from '../../../src/campaigns'
import { distributeRewards } from './distributeRewards'
import { getViemPublicClient } from '../../../scripts/utils'

// Mock viem modules
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createWalletClient: jest.fn(),
}))

jest.mock('../../../scripts/utils', () => ({
  ...jest.requireActual('../../../scripts/utils'),
  getViemPublicClient: jest.fn(),
}))

describe('distributeRewards', () => {
  const mockWalletClient = {
    writeContract: jest.fn(),
  }

  const mockPublicClient = {
    simulateContract: jest.fn(),
    waitForTransactionReceipt: jest.fn(),
  }

  const campaign: Campaign = {
    providerAddress: '0x0423189886d7966f0dd7e7d256898daeee625dca',
    protocol: 'base-v0',
    rewardsPoolAddress: '0xa2a4c1eb286a2efa470d42676081b771bbe9c1c8',
    networkId: NetworkId['base-mainnet'],
    valoraRewardsPoolAddress: '0xf4fB5Ff2baf6B33dbd92659a88c6EE927B2C88A0',
    rewardsPeriods: [],
  }

  const valoraDivviIdentifier = '0xVALORA123456789012345678901234567890123456'
  const valoraRewards = BigInt(5000000)
  const valoraRewardsPoolOwnerPrivateKey =
    '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex
  const alchemyKey = 'test-alchemy-key'
  const rewardsFilename =
    'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json'

  const mockRewardAmounts: Array<{
    referrerId: Address
    rewardAmount: string
  }> = [
    {
      referrerId: '0x1111111111111111111111111111111111111111',
      rewardAmount: '1000000',
    },
    {
      referrerId: '0x2222222222222222222222222222222222222222',
      rewardAmount: '2000000',
    },
    {
      referrerId: '0x3333333333333333333333333333333333333333',
      rewardAmount: '0',
    },
    {
      referrerId: valoraDivviIdentifier,
      rewardAmount: valoraRewards.toString(),
    },
  ]

  const referrer1IdempotencyKey = keccak256(
    toBytes(`${rewardsFilename}-0x1111111111111111111111111111111111111111`),
  )
  const referrer2IdempotencyKey = keccak256(
    toBytes(`${rewardsFilename}-0x2222222222222222222222222222222222222222`),
  )

  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(createWalletClient)
      .mockReturnValue(
        mockWalletClient as unknown as ReturnType<typeof createWalletClient>,
      )

    jest
      .mocked(getViemPublicClient)
      .mockReturnValue(
        mockPublicClient as unknown as ReturnType<typeof getViemPublicClient>,
      )

    mockPublicClient.simulateContract.mockResolvedValue({
      request: 'mockRequest',
    })
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
    })
  })

  describe('success cases', () => {
    it('should successfully distribute rewards', async () => {
      const expectedTxHash =
        '0xabcdef1234567890123456789012345678901234567890123456789012345678' as Hex
      mockWalletClient.writeContract.mockResolvedValue(expectedTxHash)

      const result = await distributeRewards({
        campaign,
        rewardAmounts: mockRewardAmounts,
        valoraDivviIdentifier,
        valoraRewards,
        valoraRewardsPoolOwnerPrivateKey,
        alchemyKey,
        rewardsFilename,
        dryRun: false,
      })

      expect(result).toBe(expectedTxHash)
      expect(mockPublicClient.simulateContract).toHaveBeenCalledWith({
        account: expect.any(Object),
        address: campaign.valoraRewardsPoolAddress,
        abi: expect.any(Object),
        functionName: 'addRewards',
        args: [
          [
            {
              user: '0x1111111111111111111111111111111111111111',
              amount: BigInt(2500000), // 5000000 / 2 (only 2 non-Valora referrers with rewards > 0)
              idempotencyKey: referrer1IdempotencyKey,
            },
            {
              user: '0x2222222222222222222222222222222222222222',
              amount: BigInt(2500000),
              idempotencyKey: referrer2IdempotencyKey,
            },
          ],
          [],
        ],
      })
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith('mockRequest')
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: expectedTxHash,
      })
    })

    it('should simulate and return null when in dry run mode', async () => {
      const result = await distributeRewards({
        campaign,
        rewardAmounts: mockRewardAmounts,
        valoraDivviIdentifier,
        valoraRewards,
        valoraRewardsPoolOwnerPrivateKey,
        alchemyKey,
        rewardsFilename,
        dryRun: true,
      })

      expect(result).toBe(null)
      expect(mockPublicClient.simulateContract).toHaveBeenCalledWith({
        account: expect.any(Object),
        address: campaign.valoraRewardsPoolAddress,
        abi: expect.any(Object),
        functionName: 'addRewards',
        args: [
          [
            {
              user: '0x1111111111111111111111111111111111111111',
              amount: BigInt(2500000), // 5000000 / 2 (only 2 non-Valora referrers with rewards > 0)
              idempotencyKey: referrer1IdempotencyKey,
            },
            {
              user: '0x2222222222222222222222222222222222222222',
              amount: BigInt(2500000),
              idempotencyKey: referrer2IdempotencyKey,
            },
          ],
          [],
        ],
      })
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled()
      expect(mockPublicClient.waitForTransactionReceipt).not.toHaveBeenCalled()
    })

    it('should handle single non-Valora referrer with rewards', async () => {
      const singleRewardAmounts: Array<{
        referrerId: Address
        rewardAmount: string
      }> = [
        {
          referrerId: '0x1111111111111111111111111111111111111111',
          rewardAmount: '1000000',
        },
        {
          referrerId: valoraDivviIdentifier,
          rewardAmount: valoraRewards.toString(),
        },
      ]

      const expectedTxHash =
        '0xabcdef1234567890123456789012345678901234567890123456789012345678' as Hex
      mockWalletClient.writeContract.mockResolvedValue(expectedTxHash)

      const result = await distributeRewards({
        campaign,
        rewardAmounts: singleRewardAmounts,
        valoraDivviIdentifier,
        valoraRewards,
        valoraRewardsPoolOwnerPrivateKey,
        alchemyKey,
        rewardsFilename,
        dryRun: false,
      })

      expect(result).toBe(expectedTxHash)
      expect(mockPublicClient.simulateContract).toHaveBeenCalledWith({
        account: expect.any(Object),
        address: campaign.valoraRewardsPoolAddress,
        abi: expect.any(Array),
        functionName: 'addRewards',
        args: [
          [
            {
              user: '0x1111111111111111111111111111111111111111',
              amount: BigInt(5000000), // Full amount to single referrer
              idempotencyKey: referrer1IdempotencyKey,
            },
          ],
          [],
        ],
      })
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith('mockRequest')
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: expectedTxHash,
      })
    })
  })

  describe('error cases', () => {
    it('should throw error when valoraRewardsPoolAddress is not set', async () => {
      const campaignWithoutValoraPool = {
        ...campaign,
        valoraRewardsPoolAddress: null,
      }

      await expect(
        distributeRewards({
          campaign: campaignWithoutValoraPool,
          rewardAmounts: mockRewardAmounts,
          valoraDivviIdentifier,
          valoraRewards,
          valoraRewardsPoolOwnerPrivateKey,
          alchemyKey,
          rewardsFilename,
          dryRun: false,
        }),
      ).rejects.toThrow('Valora rewards pool address is not set')
    })

    it('should throw error when writeContract fails', async () => {
      const writeContractError = new Error('Transaction failed')
      mockWalletClient.writeContract.mockRejectedValue(writeContractError)

      await expect(
        distributeRewards({
          campaign,
          rewardAmounts: mockRewardAmounts,
          valoraDivviIdentifier,
          valoraRewards,
          valoraRewardsPoolOwnerPrivateKey,
          alchemyKey,
          rewardsFilename,
          dryRun: false,
        }),
      ).rejects.toThrow('Transaction failed')
    })

    it('should throw error when no non-Valora referrers with rewards', async () => {
      const rewardAmountsOnlyValora: Array<{
        referrerId: Address
        rewardAmount: string
      }> = [
        {
          referrerId: valoraDivviIdentifier,
          rewardAmount: valoraRewards.toString(),
        },
        {
          referrerId: '0x1111111111111111111111111111111111111111',
          rewardAmount: '0',
        },
      ]

      const expectedTxHash =
        '0xabcdef1234567890123456789012345678901234567890123456789012345678' as Hex
      mockWalletClient.writeContract.mockResolvedValue(expectedTxHash)

      await expect(
        distributeRewards({
          campaign,
          rewardAmounts: rewardAmountsOnlyValora,
          valoraDivviIdentifier,
          valoraRewards,
          valoraRewardsPoolOwnerPrivateKey,
          alchemyKey,
          rewardsFilename,
          dryRun: false,
        }),
      ).rejects.toThrow('No non-valora referrers with rewards')
    })

    it('should throw error when transaction is not successful', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: 'reverted',
      })

      await expect(
        distributeRewards({
          campaign,
          rewardAmounts: mockRewardAmounts,
          valoraDivviIdentifier,
          valoraRewards,
          valoraRewardsPoolOwnerPrivateKey,
          alchemyKey,
          rewardsFilename,
          dryRun: false,
        }),
      ).rejects.toThrow('Distribute Transaction failed: reverted')
    })
  })
})
