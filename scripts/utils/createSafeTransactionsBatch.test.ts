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
  const mockendTimestampExclusive = new Date('2023-04-01T00:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create directory and write transaction batch JSON to file', () => {
    createAddRewardSafeTransactionJSON({
      filePath: mockFilePath,
      rewardPoolAddress: mockRewardPoolAddress,
      rewards: mockRewards,
      startTimestamp: mockStartTimestamp,
      endTimestampExclusive: mockendTimestampExclusive,
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
      endTimestampExclusive: mockendTimestampExclusive,
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

  describe('with idempotency enabled', () => {
    it('should create transaction with RewardData struct format', () => {
      createAddRewardSafeTransactionJSON({
        filePath: mockFilePath,
        rewardPoolAddress: mockRewardPoolAddress,
        rewards: mockRewards,
        startTimestamp: mockStartTimestamp,
        endTimestampExclusive: mockendTimestampExclusive,
        useIdempotency: true,
      })

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
                {
                  components: [
                    { internalType: 'address', name: 'user', type: 'address' },
                    {
                      internalType: 'uint256',
                      name: 'amount',
                      type: 'uint256',
                    },
                    {
                      internalType: 'bytes32',
                      name: 'idempotencyKey',
                      type: 'bytes32',
                    },
                  ],
                  internalType: 'struct RewardPool.RewardData[]',
                  name: 'rewards',
                  type: 'tuple[]',
                },
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
              rewards:
                '[["0x1111111111111111111111111111111111111111", "1000000000000000000", "0xf0eb88bd965159ac0d4e32b136e3a74e3f1f7b8ee3c461e11a4f14c5727a87c2"], ["0x2222222222222222222222222222222222222222", "2000000000000000000", "0xa7c118fdebde0b6e839c72b2bb9dee394226df53ab452947d2e15297fbb972ef"]]',
              rewardFunctionArgs: '[1677628800, 1680307200]',
            },
          },
        ],
      })
    })

    it('should handle empty rewards array with idempotency', () => {
      createAddRewardSafeTransactionJSON({
        filePath: mockFilePath,
        rewardPoolAddress: mockRewardPoolAddress,
        rewards: [],
        startTimestamp: mockStartTimestamp,
        endTimestampExclusive: mockendTimestampExclusive,
        useIdempotency: true,
      })

      const writtenJSON = JSON.parse(
        (writeFileSync as jest.Mock).mock.calls[0][1],
      )
      expect(writtenJSON.transactions[0].contractInputsValues.rewards).toBe(
        '[]',
      )
    })

    it('should generate different idempotency keys for different periods', () => {
      const firstPeriodStart = new Date('2023-03-01T00:00:00Z')
      const firstPeriodEnd = new Date('2023-04-01T00:00:00Z')
      const secondPeriodStart = new Date('2023-04-01T00:00:00Z')
      const secondPeriodEnd = new Date('2023-05-01T00:00:00Z')

      // Generate transaction for first period
      createAddRewardSafeTransactionJSON({
        filePath: mockFilePath,
        rewardPoolAddress: mockRewardPoolAddress,
        rewards: [mockRewards[0]], // Single reward
        startTimestamp: firstPeriodStart,
        endTimestampExclusive: firstPeriodEnd,
        useIdempotency: true,
      })

      const firstTransaction = JSON.parse(
        (writeFileSync as jest.Mock).mock.calls[0][1],
      )
      const firstRewards =
        firstTransaction.transactions[0].contractInputsValues.rewards

      // Clear the mock calls
      ;(writeFileSync as jest.Mock).mockClear()

      // Generate transaction for second period
      createAddRewardSafeTransactionJSON({
        filePath: mockFilePath,
        rewardPoolAddress: mockRewardPoolAddress,
        rewards: [mockRewards[0]], // Same reward, different period
        startTimestamp: secondPeriodStart,
        endTimestampExclusive: secondPeriodEnd,
        useIdempotency: true,
      })

      const secondTransaction = JSON.parse(
        (writeFileSync as jest.Mock).mock.calls[0][1],
      )
      const secondRewards =
        secondTransaction.transactions[0].contractInputsValues.rewards

      expect(firstRewards).toEqual(
        '[["0x1111111111111111111111111111111111111111", "1000000000000000000", "0xf0eb88bd965159ac0d4e32b136e3a74e3f1f7b8ee3c461e11a4f14c5727a87c2"]]',
      )
      expect(secondRewards).toEqual(
        '[["0x1111111111111111111111111111111111111111", "1000000000000000000", "0xef2e1fcded1ae3b33d51b37f94ead3acd4f57529223bea1c170fc2ca54a5e1d2"]]',
      )
    })
  })
})
