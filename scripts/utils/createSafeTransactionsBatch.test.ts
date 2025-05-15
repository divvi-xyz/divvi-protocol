import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { createAddRewardSafeTransactionJSON } from './createSafeTransactionsBatch'

// Mock fs and path modules
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}))

jest.mock('path', () => ({
  dirname: jest.fn().mockReturnValue('test-directory'),
}))

describe('createAddRewardSafeTransactionJSON', () => {
  const mockFilePath = 'test-transactions.json'
  const mockRewardPoolAddress = '0x1234567890123456789012345678901234567890'
  const mockRewards = [
    {
      referrerId: '0x1111111111111111111111111111111111111111',
      rewardAmount: '1000000000000000000', // 1 ETH in wei
    },
    {
      referrerId: '0x2222222222222222222222222222222222222222',
      rewardAmount: '2000000000000000000', // 2 ETH in wei
    },
  ]
  const mockStartTimestamp = new Date('2023-03-01T00:00:00Z')
  const mockEndTimestamp = new Date('2023-04-01T00:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create directory and write transaction batch JSON to file', () => {
    createAddRewardSafeTransactionJSON({
      filePath: mockFilePath,
      rewardPoolAddress: mockRewardPoolAddress,
      rewards: mockRewards,
      startTimestamp: mockStartTimestamp,
      endTimestamp: mockEndTimestamp,
    })

    // Verify directory creation
    expect(dirname).toHaveBeenCalledWith(mockFilePath)
    expect(mkdirSync).toHaveBeenCalledWith('test-directory', {
      recursive: true,
    })

    // Verify writeFileSync was called with correct arguments
    expect(writeFileSync).toHaveBeenCalledTimes(1)
    expect(writeFileSync).toHaveBeenCalledWith(
      mockFilePath,
      expect.any(String),
      { encoding: 'utf-8' },
    )

    // Parse the JSON string that was written to verify its structure
    const transactionJSON = JSON.parse(
      (writeFileSync as jest.Mock).mock.calls[0][1],
    )
    expect(transactionJSON).toEqual({
      meta: {},
      transactions: [
        {
          to: '0x1234567890123456789012345678901234567890',
          value: '0',
          data: null,
          contractMethod: {
            inputs: [
              { internalType: 'address[]', name: 'users', type: 'address[]' },
              { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
              {
                internalType: 'uint256[]',
                name: 'rewardFunctionArgs',
                type: 'uint256[]',
              },
            ],
            name: 'addRewards',
            payable: false,
          },
          contractInputsValues: {
            users:
              '[0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222]',
            amounts: '[1000000000000000000, 2000000000000000000]',
            rewardFunctionArgs: '[1677628800, 1680307200]',
          },
        },
      ],
    })
  })

  it('should handle empty rewards array', () => {
    createAddRewardSafeTransactionJSON({
      filePath: mockFilePath,
      rewardPoolAddress: mockRewardPoolAddress,
      rewards: [],
      startTimestamp: mockStartTimestamp,
      endTimestamp: mockEndTimestamp,
    })

    // Verify directory creation
    expect(dirname).toHaveBeenCalledWith(mockFilePath)
    expect(mkdirSync).toHaveBeenCalledWith('test-directory', {
      recursive: true,
    })

    const writtenJSON = JSON.parse(
      (writeFileSync as jest.Mock).mock.calls[0][1],
    )
    expect(writtenJSON.transactions[0].contractInputsValues.users).toBe('[]')
    expect(writtenJSON.transactions[0].contractInputsValues.amounts).toBe('[]')
  })
})
