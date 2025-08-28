import { Address } from 'viem'
import { Protocol } from '../types'
import { getRewards } from './getRewards'
import nock, { restore, cleanAll } from 'nock'

describe('getRewards', () => {
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
    it('should return the expected rewards file for a protocol', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getRewards({
        gcsFiles: mockGcsFiles,
        protocol: 'base-v0' as Protocol,
        startTimestamp: '2025-01-01T00:00:00.000Z',
        endTimestampExclusive: '2025-02-01T00:00:00.000Z',
      })

      expect(result).toEqual({
        filename:
          'kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        rewardAmounts: mockRewardAmounts,
      })
    })

    it('should filter files correctly by protocol and period', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getRewards({
        gcsFiles: mockGcsFiles,
        protocol: 'celo-pg' as Protocol,
        startTimestamp: '2025-01-01T00:00:00.000Z',
        endTimestampExclusive: '2025-02-01T00:00:00.000Z',
      })

      expect(result).toEqual({
        filename:
          'kpi/celo-pg/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
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

      nock('https://storage.googleapis.com/bucket')
        .get(
          '/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, mockRewardAmounts)

      const result = await getRewards({
        gcsFiles: mixedFiles,
        protocol: 'base-v0' as Protocol,
        startTimestamp: '2025-01-01T00:00:00.000Z',
        endTimestampExclusive: '2025-02-01T00:00:00.000Z',
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
        getRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'non-existent-protocol' as Protocol,
          startTimestamp: '2025-01-01T00:00:00.000Z',
          endTimestampExclusive: '2025-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        'No rewards file found for non-existent-protocol for period 2025-01-01T00:00:00.000Z to 2025-02-01T00:00:00.000Z',
      )
    })

    it('should throw error when no GCS files provided', async () => {
      await expect(
        getRewards({
          gcsFiles: [],
          protocol: 'base-v0' as Protocol,
          startTimestamp: '2025-01-01T00:00:00.000Z',
          endTimestampExclusive: '2025-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        'No rewards file found for base-v0 for period 2025-01-01T00:00:00.000Z to 2025-02-01T00:00:00.000Z',
      )
    })

    it('should throw error when fetch fails with non-ok response', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(404, 'File not found')

      await expect(
        getRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
          startTimestamp: '2025-01-01T00:00:00.000Z',
          endTimestampExclusive: '2025-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        'No rewards file found for base-v0 for period 2025-01-01T00:00:00.000Z to 2025-02-01T00:00:00.000Z',
      )
    })

    it('should throw error when fetch throws an exception', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .replyWithError('Network error')

      await expect(
        getRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
          startTimestamp: '2025-01-01T00:00:00.000Z',
          endTimestampExclusive: '2025-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('Network error')
    })

    it('should throw error when JSON parsing fails', async () => {
      nock('https://storage.googleapis.com')
        .get(
          '/bucket/kpi/base-v0/2025-01-01T00:00:00.000Z_2025-02-01T00:00:00.000Z/rewards.json',
        )
        .reply(200, 'Invalid JSON')

      await expect(
        getRewards({
          gcsFiles: mockGcsFiles,
          protocol: 'base-v0' as Protocol,
          startTimestamp: '2025-01-01T00:00:00.000Z',
          endTimestampExclusive: '2025-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('Unexpected token')
    })
  })
})
