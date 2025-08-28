import { redistributeValoraRewards } from './redistributeValoraRewards'
import { campaigns } from '../../src/campaigns'
import { NetworkId } from '../types'
import { getViemPublicClient } from '../utils'
import { getLatestRewards } from './getLatestRewards'
import { proposeSafeAddRewardsTx } from './proposeSafeAddRewardsTx'
import { proposeSafeClaimOrDepositRewardTx } from './proposeSafeClaimOrDepositRewardTx'
import { waitForSafeTxExecuted } from './waitForSafeTxExecuted'
import { listGCSFiles } from '../utils/uploadFileToCloudStorage'

// Mock all external dependencies
jest.mock('../utils', () => ({
  getViemPublicClient: jest.fn(),
}))

jest.mock('./getLatestRewards', () => ({
  getLatestRewards: jest.fn(),
}))

jest.mock('./proposeSafeAddRewardsTx', () => ({
  proposeSafeAddRewardsTx: jest.fn(),
}))

jest.mock('./proposeSafeClaimOrDepositRewardTx', () => ({
  proposeSafeClaimOrDepositRewardTx: jest.fn(),
}))

jest.mock('./waitForSafeTxExecuted', () => ({
  waitForSafeTxExecuted: jest.fn(),
}))

jest.mock('../utils/uploadFileToCloudStorage', () => ({
  listGCSFiles: jest.fn(),
}))

// Mock process.exitCode
const mockExitCode = { value: 0 }
Object.defineProperty(process, 'exitCode', {
  get: () => mockExitCode.value,
  set: (value) => {
    mockExitCode.value = value
  },
})

describe('redistributeValoraRewards', () => {
  const mockViemClient = {
    readContract: jest.fn(),
  }

  const mockGcsFiles = [
    {
      name: 'kpi/celo-pg/2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      url: 'https://example.com/rewards.json',
    },
  ]

  const mockRewardAmounts = [
    {
      referrerId: '0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad' as `0x${string}`,
      rewardAmount: '1000000000000000000',
    }, // VALORA_DIVVI_IDENTIFIER
    {
      referrerId: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      rewardAmount: '500000000000000000',
    },
    {
      referrerId: '0x0987654321098765432109876543210987654321' as `0x${string}`,
      rewardAmount: '300000000000000000',
    },
  ]

  const mockSafeTxResponse = {
    safeTxUrl: 'https://safe.example.com/tx/123',
    safeTxHash:
      '0x1234567890123456789012345678901234567890123456789012345678901234',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockExitCode.value = 0

    // Setup environment variables
    process.env.BUCKET_NAME = 'test-bucket'
    process.env.ALCHEMY_KEY = 'test-alchemy-key'
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should throw error when campaign is not found', async () => {
    const args = {
      protocol: 'non-existent-protocol',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Campaign not found for protocol non-existent-protocol',
    )
  })

  it('should throw error when campaign has no valoraRewardsPoolAddress', async () => {
    const args = {
      protocol: 'scout-game-v0',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Valora rewards pool address not found for campaign scout-game-v0',
    )
  })

  it('should complete successfully when there are pending rewards', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    // Mock proposeSafeClaimOrDepositRewardTx for claiming
    jest
      .mocked(proposeSafeClaimOrDepositRewardTx)
      .mockResolvedValueOnce(mockSafeTxResponse) // First call for claiming
      .mockResolvedValueOnce(mockSafeTxResponse) // Second call for depositing

    // Mock proposeSafeAddRewardsTx
    jest.mocked(proposeSafeAddRewardsTx).mockResolvedValue(mockSafeTxResponse)

    // Mock waitForSafeTxExecuted
    jest.mocked(waitForSafeTxExecuted).mockResolvedValue(undefined)

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    // Spy on console.log to verify output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await redistributeValoraRewards(args)

    // Verify contract call
    expect(mockViemClient.readContract).toHaveBeenCalledWith({
      address: campaigns.find((c) => c.protocol === 'celo-pg')!
        .rewardsPoolAddress,
      abi: expect.any(Object),
      functionName: 'pendingRewards',
      args: ['0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad'],
    })

    // Verify getLatestRewards was called
    expect(getLatestRewards).toHaveBeenCalledWith({
      gcsFiles: mockGcsFiles,
      protocol: 'celo-pg',
    })

    // Verify claim transaction was proposed
    expect(proposeSafeClaimOrDepositRewardTx).toHaveBeenNthCalledWith(1, {
      safeAddress: '0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad',
      rewardPoolAddress: campaigns.find((c) => c.protocol === 'celo-pg')!
        .rewardsPoolAddress,
      rewardAmount: BigInt('1000000000000000000'),
      isClaiming: true,
      networkId: NetworkId['celo-mainnet'],
      alchemyKey: 'test-alchemy-key',
      dryRun: false,
    })

    // Verify deposit transaction was proposed
    expect(proposeSafeClaimOrDepositRewardTx).toHaveBeenNthCalledWith(2, {
      safeAddress: '0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad',
      rewardPoolAddress: campaigns.find((c) => c.protocol === 'celo-pg')!
        .valoraRewardsPoolAddress,
      rewardAmount: BigInt('1000000000000000000'),
      isClaiming: false,
      networkId: NetworkId['celo-mainnet'],
      alchemyKey: 'test-alchemy-key',
      dryRun: false,
    })

    // Verify add rewards transaction was proposed
    expect(proposeSafeAddRewardsTx).toHaveBeenCalledWith({
      safeAddress: '0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4',
      rewardPoolAddress: campaigns.find((c) => c.protocol === 'celo-pg')!
        .valoraRewardsPoolAddress,
      rewardAmounts: mockRewardAmounts,
      valoraRewards: BigInt('1000000000000000000'),
      networkId: NetworkId['celo-mainnet'],
      alchemyKey: 'test-alchemy-key',
      dryRun: false,
      excludeReferrerIds: ['0x9eCfE3dDFAf1BB9B55f56b84471406893c5E29ad'],
      rewardsFilename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
    })

    // Verify all transactions were waited for
    expect(waitForSafeTxExecuted).toHaveBeenCalledTimes(3)

    // Verify success message
    expect(consoleSpy).toHaveBeenCalledWith(
      '\n\nRewards successfully redistributed for celo-pg!',
    )

    consoleSpy.mockRestore()
  })

  it('should handle dry run mode correctly', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    // Mock proposeSafeClaimOrDepositRewardTx
    jest
      .mocked(proposeSafeClaimOrDepositRewardTx)
      .mockResolvedValueOnce(mockSafeTxResponse)
      .mockResolvedValueOnce(mockSafeTxResponse)

    // Mock proposeSafeAddRewardsTx
    jest.mocked(proposeSafeAddRewardsTx).mockResolvedValue(mockSafeTxResponse)

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: true,
    }

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await redistributeValoraRewards(args)

    // Verify transactions were proposed but not waited for
    expect(proposeSafeClaimOrDepositRewardTx).toHaveBeenCalledTimes(2)
    expect(proposeSafeAddRewardsTx).toHaveBeenCalledTimes(1)
    expect(waitForSafeTxExecuted).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should throw error when rewards mismatch between contract and GCS', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('2000000000000000000')) // Different amount

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Rewards mismatch: 1000000000000000000 !== 2000000000000000000',
    )
  })

  it('should do nothing when there are no pending rewards', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return no pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt(0))

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await redistributeValoraRewards(args)

    // Verify only the initial log message was printed
    expect(consoleSpy).toHaveBeenCalledWith(
      'Fetched pending rewards for celo-pg: 0',
    )

    // Verify no other operations were performed
    expect(listGCSFiles).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should handle case when VALORA_DIVVI_IDENTIFIER is not found in reward amounts', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards with no VALORA_DIVVI_IDENTIFIER
    const rewardAmountsWithoutValora = [
      {
        referrerId:
          '0x1234567890123456789012345678901234567890' as `0x${string}`,
        rewardAmount: '500000000000000000',
      },
      {
        referrerId:
          '0x0987654321098765432109876543210987654321' as `0x${string}`,
        rewardAmount: '300000000000000000',
      },
    ]

    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: rewardAmountsWithoutValora,
    })

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    // This should throw an error because valoraRewardsFromGcs will be null
    // but the contract returns 1000000000000000000
    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Rewards mismatch: null !== 1000000000000000000',
    )
  })

  it('should handle errors from proposeSafeClaimOrDepositRewardTx', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    // Mock proposeSafeClaimOrDepositRewardTx to throw error
    jest
      .mocked(proposeSafeClaimOrDepositRewardTx)
      .mockRejectedValue(new Error('Safe transaction creation failed'))

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Safe transaction creation failed',
    )
  })

  it('should handle errors from waitForSafeTxExecuted', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    // Mock proposeSafeClaimOrDepositRewardTx
    jest
      .mocked(proposeSafeClaimOrDepositRewardTx)
      .mockResolvedValueOnce(mockSafeTxResponse)
      .mockResolvedValueOnce(mockSafeTxResponse)

    // Mock proposeSafeAddRewardsTx
    jest.mocked(proposeSafeAddRewardsTx).mockResolvedValue(mockSafeTxResponse)

    // Mock waitForSafeTxExecuted to throw error on first call
    jest
      .mocked(waitForSafeTxExecuted)
      .mockRejectedValueOnce(new Error('Transaction execution timeout'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Transaction execution timeout',
    )
  })

  it('should handle errors from proposeSafeAddRewardsTx', async () => {
    // Mock getViemPublicClient
    jest.mocked(getViemPublicClient).mockReturnValue(mockViemClient as any)

    // Mock contract call to return pending rewards
    mockViemClient.readContract.mockResolvedValue(BigInt('1000000000000000000'))

    // Mock listGCSFiles
    jest.mocked(listGCSFiles).mockResolvedValue(mockGcsFiles)

    // Mock getLatestRewards
    jest.mocked(getLatestRewards).mockResolvedValue({
      filename:
        '2025-07-01T00:00:00.000Z_2025-08-01T00:00:00.000Z/rewards.json',
      rewardAmounts: mockRewardAmounts,
    })

    // Mock proposeSafeClaimOrDepositRewardTx
    jest
      .mocked(proposeSafeClaimOrDepositRewardTx)
      .mockResolvedValueOnce(mockSafeTxResponse)
      .mockResolvedValueOnce(mockSafeTxResponse)

    // Mock waitForSafeTxExecuted
    jest.mocked(waitForSafeTxExecuted).mockResolvedValue(undefined)

    // Mock proposeSafeAddRewardsTx to throw error
    jest
      .mocked(proposeSafeAddRewardsTx)
      .mockRejectedValue(new Error('Add rewards transaction creation failed'))

    const args = {
      protocol: 'celo-pg',
      startTimestamp: '2025-07-01T00:00:00.000Z',
      endTimestampExclusive: '2025-08-01T00:00:00.000Z',
      dryRun: false,
    }

    await expect(redistributeValoraRewards(args)).rejects.toThrow(
      'Add rewards transaction creation failed',
    )
  })
})
