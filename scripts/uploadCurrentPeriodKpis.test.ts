import { it } from '@jest/globals'
import { Campaign, uploadCurrentPeriodKpis } from './uploadCurrentPeriodKpis'
import { fetchReferrals } from './fetchReferrals'
import { calculateKpi } from './calculateKpi'
import { uploadFilesToGCS } from './utils/uploadFileToCloudStorage'
import { ResultDirectory } from '../src/resultDirectory'
import { main as calculateRewardsCeloPG } from './calculateRewards/celoPG'

// Mock all the dependencies
jest.mock('./fetchReferrals')
jest.mock('./calculateKpi')
jest.mock('./utils/uploadFileToCloudStorage')
jest.mock('./calculateRewards/celoPG')
const mockHandler = jest.fn()
jest.mock('./calculateKpi/protocols', () => ({
  __esModule: true,
  default: {
    'celo-pg': (...args: unknown[]) => mockHandler(...args),
  },
}))

const mockFetchReferrals = jest.mocked(fetchReferrals)
const mockCalculateKpi = jest.mocked(calculateKpi)
const mockUploadFilesToGCS = jest.mocked(uploadFilesToGCS)
const mockCalculateRewardsCeloPG = jest.mocked(calculateRewardsCeloPG)

describe('uploadCurrentPeriodKpis', () => {
  const mockCampaigns: Campaign[] = [
    {
      protocol: 'celo-pg',
      rewardsPeriods: [
        {
          startTimestamp: '2025-05-15T00:00:00Z',
          endTimestampExclusive: '2025-06-01T00:00:00Z',
          rewardPoolAddress: '0xc273fB49C5c291F7C697D0FcEf8ce34E985008F3',
          rewardAmountInWei: '25000000000000000000000',
          calculateRewards: async ({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
          }: {
            resultDirectory: ResultDirectory
            startTimestamp: string
            endTimestampExclusive: string
          }) => {
            await calculateRewardsCeloPG({
              resultDirectory,
              startTimestamp,
              endTimestampExclusive,
              rewardAmount: '25000',
              proportionLinear: 0.8,
            })
          },
        },
        {
          startTimestamp: '2025-06-01T00:00:00Z',
          endTimestampExclusive: '2025-07-01T00:00:00Z',
          rewardPoolAddress: '0xc273fB49C5c291F7C697D0FcEf8ce34E985008F3',
          rewardAmountInWei: '50000000000000000000000',
          calculateRewards: async ({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
          }: {
            resultDirectory: ResultDirectory
            startTimestamp: string
            endTimestampExclusive: string
          }) => {
            await calculateRewardsCeloPG({
              resultDirectory,
              startTimestamp,
              endTimestampExclusive,
              rewardAmount: '50000',
              proportionLinear: 0.8,
            })
          },
        },
        {
          startTimestamp: '2025-07-01T00:00:00Z',
          endTimestampExclusive: '2025-08-01T00:00:00Z',
          rewardPoolAddress: '0xc273fB49C5c291F7C697D0FcEf8ce34E985008F3',
          rewardAmountInWei: '75000000000000000000000',
          calculateRewards: async ({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
          }: {
            resultDirectory: ResultDirectory
            startTimestamp: string
            endTimestampExclusive: string
          }) => {
            await calculateRewardsCeloPG({
              resultDirectory,
              startTimestamp,
              endTimestampExclusive,
              rewardAmount: '75000',
              proportionLinear: 0.8,
            })
          },
        },
      ],
    },
    {
      protocol: 'scout-game-v0',
      rewardsPeriods: [
        {
          startTimestamp: '2025-06-01T00:00:00Z',
          endTimestampExclusive: '2025-07-01T00:00:00Z',
          rewardPoolAddress: '0x6F599b879541d289e344e325f4D9badf8c5bB49E',
          rewardAmountInWei: '10000000000000000000000',
        },
      ],
    },
    {
      protocol: 'celo-transactions',
      rewardsPeriods: [
        {
          startTimestamp: '2025-06-14T00:00:00Z',
          endTimestampExclusive: '2025-06-21T00:00:00Z',
          rewardPoolAddress: '0x6F599b879541d289e344e325f4D9badf8c5bB49E',
          rewardAmountInWei: '10000000000000000000000',
        },
      ],
    },
  ]
  const defaultArgs = {
    dryRun: false,
    calculationTimestamp: '2025-06-15T14:45:00Z',
    redisConnection: 'redis://localhost:6379',
    protocols: 'celo-pg',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('period selection logic', () => {
    it.each([
      {
        inputCalculationTimestamp: '2025-05-20T12:30:00Z',
        expectedCalculationTimestampExclusive: '2025-05-20T12:00:00.000Z', // rounded to the nearest previous hour
        expectedCampaignStartTimestamp: '2025-05-15T00:00:00Z',
        expectedPeriodStartTimestamp: '2025-05-15T00:00:00Z',
        expectedPeriodEndTimestampExclusive: '2025-06-01T00:00:00Z',
        testCase: 'the middle of a campaign',
      },
      {
        inputCalculationTimestamp: '2025-06-01T00:30:00Z',
        expectedCalculationTimestampExclusive: '2025-06-01T00:00:00.000Z', // rounded to the nearest previous hour, end of a period
        expectedCampaignStartTimestamp: '2025-05-15T00:00:00Z',
        expectedPeriodStartTimestamp: '2025-05-15T00:00:00Z',
        expectedPeriodEndTimestampExclusive: '2025-06-01T00:00:00Z',
        testCase: 'a period boundary',
      },
      {
        inputCalculationTimestamp: '2025-08-01T00:30:00Z',
        expectedCalculationTimestampExclusive: '2025-08-01T00:00:00.000Z', // rounded to the nearest previous hour, end of a last period
        expectedCampaignStartTimestamp: '2025-05-15T00:00:00Z',
        expectedPeriodStartTimestamp: '2025-07-01T00:00:00Z',
        expectedPeriodEndTimestampExclusive: '2025-08-01T00:00:00Z',
        testCase: 'the end of the campaign',
      },
    ])(
      'should select the correct start and end timestamps at $testCase',
      async ({
        inputCalculationTimestamp,
        expectedCalculationTimestampExclusive,
        expectedCampaignStartTimestamp,
        expectedPeriodStartTimestamp,
        expectedPeriodEndTimestampExclusive,
      }) => {
        await uploadCurrentPeriodKpis(
          {
            ...defaultArgs,
            calculationTimestamp: inputCalculationTimestamp,
          },
          mockCampaigns,
        )

        // Should call fetchReferrals with the first period's start timestamp and the rounded end timestamp
        expect(mockFetchReferrals).toHaveBeenCalledWith(
          expect.objectContaining({
            protocol: 'celo-pg',
            startTimestamp: expectedCampaignStartTimestamp,
            endTimestampExclusive: expectedCalculationTimestampExclusive,
          }),
        )

        // Should call calculateKpi with the same timestamps
        expect(mockCalculateKpi).toHaveBeenCalledWith(
          expect.objectContaining({
            protocol: 'celo-pg',
            startTimestamp: expectedPeriodStartTimestamp,
            endTimestampExclusive: expectedCalculationTimestampExclusive,
          }),
        )

        // Should call calculateRewardsCeloPG with the same timestamps
        expect(mockCalculateRewardsCeloPG).toHaveBeenCalledWith(
          expect.objectContaining({
            resultDirectory: expect.any(Object),
            startTimestamp: expectedPeriodStartTimestamp,
            endTimestampExclusive: expectedPeriodEndTimestampExclusive, // the end of the period, not the calculation timestamp
          }),
        )
      },
    )
  })

  describe('campaign filtering', () => {
    it('should process all campaigns when no protocols are specified', async () => {
      await uploadCurrentPeriodKpis(
        { ...defaultArgs, protocols: undefined },
        mockCampaigns,
      )

      // Should call fetchReferrals for all active campaigns
      expect(mockFetchReferrals).toHaveBeenCalledTimes(3)
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'celo-pg',
        }),
      )
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'scout-game-v0',
        }),
      )
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'celo-transactions',
        }),
      )
    })

    it('should process only specified protocols when comma-separated list is provided', async () => {
      await uploadCurrentPeriodKpis(
        { ...defaultArgs, protocols: 'celo-pg,scout-game-v0' },
        mockCampaigns,
      )

      // Should call fetchReferrals for both specified protocols
      expect(mockFetchReferrals).toHaveBeenCalledTimes(2)
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'celo-pg',
        }),
      )
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'scout-game-v0',
        }),
      )
    })

    it('should throw error if any provided protocols are not found in the known campaigns', async () => {
      await expect(
        uploadCurrentPeriodKpis(
          { ...defaultArgs, protocols: 'celo-pg,invalid-protocol' },
          mockCampaigns,
        ),
      ).rejects.toThrow('Campaign invalid-protocol not found')
    })
  })

  describe('campaign period validation', () => {
    it('should skip campaigns that are not active', async () => {
      await uploadCurrentPeriodKpis(
        {
          ...defaultArgs,
          calculationTimestamp: '2025-07-10T12:00:00Z', // Timestamp after scout-game-v0 campaign ends
        },
        mockCampaigns,
      )

      // Should only call fetchReferrals for the active celo-pg campaign
      expect(mockFetchReferrals).toHaveBeenCalledTimes(1)
      expect(mockFetchReferrals).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'celo-pg',
        }),
      )
    })
  })

  describe('dry run mode', () => {
    it('should pass dry run flag to uploadFilesToGCS', async () => {
      await uploadCurrentPeriodKpis(
        { ...defaultArgs, dryRun: true },
        mockCampaigns,
      )

      // Should call uploadFilesToGCS with dry run flag set to true
      expect(mockUploadFilesToGCS).toHaveBeenCalledWith(
        expect.any(Array),
        'divvi-campaign-data-production',
        true,
      )
    })
  })
})
