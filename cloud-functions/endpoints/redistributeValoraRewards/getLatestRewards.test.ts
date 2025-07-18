import { Address } from 'viem'
import { Protocol } from '../../../scripts/types'
import { getLatestRewards } from './getLatestRewards'
import nock, { restore, cleanAll } from 'nock'

describe('getLatestRewards', () => {
  const mockGcsFiles = [
    {
      name: 'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
      url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
    },
    {
      name: 'kpi/base-v0/2025-02-01T00:00:00.000Z_2025-03-01T00:00:00.000Z/rewards.json',
      url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-02-01T00:00:00.000Z_2025-03-01T00:00:00.000Z/rewards.json',
    },
    {
      name: 'kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
      url: 'https://storage.googleapis.com/bucket/kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
    },
    {
      name: 'kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
      url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
    },
    {
      name: 'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/kpi.json',
      url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/kpi.json',
    },
  ]

  const mockRewardAmounts = [
    {
      referrerId: '0x1111111111111111111111111111111111111111' as Address,
      rewardAmount: '1000000',
    },
    {
      referrerId: '0x2222222222222222222222222222222222222222' as Address,
      rewardAmount: '2000000',
    },
    {
      referrerId: '0x3333333333333333333333333333333333333333' as Address,
      rewardAmount: '3000000',
    },
  ]

  beforeEach(() => {
    cleanAll()
  })

  afterAll(() => {
    restore()
  })

  describe('success cases', () => {
    it('should return the latest rewards file for a protocol', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getLatestRewards({
        gcsFiles: mockGcsFiles,
        protocol: 'base-v0' as Protocol,
      })

      expect(result).toEqual({
        filename:
          'kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
        rewardAmounts: mockRewardAmounts,
      })
    })

    it('should filter files correctly by protocol', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getLatestRewards({
        gcsFiles: mockGcsFiles,
        protocol: 'celo-pg' as Protocol,
      })

      expect(result).toEqual({
        filename:
          'kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        rewardAmounts: mockRewardAmounts,
      })
    })

    it('should handle single rewards file for a protocol', async () => {
      const singleFileGcsFiles = [
        {
          name: 'kpi/scout-game-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
          url: 'https://storage.googleapis.com/bucket/kpi/scout-game-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        },
      ]

      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/scout-game-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getLatestRewards({
        gcsFiles: singleFileGcsFiles,
        protocol: 'scout-game-v0' as Protocol,
      })

      expect(result).toEqual({
        filename:
          'kpi/scout-game-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        rewardAmounts: mockRewardAmounts,
      })
    })

    it('should ignore non-rewards.json files', async () => {
      const mixedFiles = [
        {
          name: 'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/kpi.json',
          url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/kpi.json',
        },
        {
          name: 'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
          url: 'https://storage.googleapis.com/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        },
      ]

      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getLatestRewards({
        gcsFiles: mixedFiles,
        protocol: 'base-v0' as Protocol,
      })

      expect(result).toEqual({
        filename:
          'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        rewardAmounts: mockRewardAmounts,
      })
    })
  })

  describe('error cases', () => {
    it('should throw error when no rewards file found for protocol', async () => {
      await expect(
        getLatestRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'non-existent-protocol' as Protocol,
        }),
      ).rejects.toThrow('No rewards file found for non-existent-protocol')
    })

    it('should throw error when no GCS files provided', async () => {
      await expect(
        getLatestRewards({
          gcsFiles: [],
          protocol: 'base-v0' as Protocol,
        }),
      ).rejects.toThrow('No rewards file found for base-v0')
    })

    it('should throw error when fetch fails with non-ok response', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
        )
        .reply(404, 'File not found')

      await expect(
        getLatestRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
        }),
      ).rejects.toThrow('Failed to fetch rewards file')
    })

    it('should throw error when fetch throws an exception', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
        )
        .replyWithError('Network error')

      await expect(
        getLatestRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
        }),
      ).rejects.toThrow('Network error')
    })

    it('should throw error when JSON parsing fails', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-03-01T00:00:00.000Z_2025-04-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, 'Invalid JSON')

      await expect(
        getLatestRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
        }),
      ).rejects.toThrow('Unexpected token')
    })
  })
})
