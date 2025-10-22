import { NetworkId } from '../scripts/types'
import { main as calculateRewardsCeloPGS1 } from '../scripts/calculateRewards/celoPGS1'
import { main as calculateRewardsTetherV0 } from '../scripts/calculateRewards/tetherV0'
import { toPeriodFolderName } from '../scripts/utils/dateFormatting'
import { Campaign } from './types'
import { pastCampaigns } from './pastCampaings'
import {
  calculateStageV0,
  calculateStageV1,
  calculateStageV2,
  calculateStageV3,
} from './celoPGRewards'
import { google } from 'googleapis'
import { isAddress } from 'viem'

export const STORAGE_BUCKET_NAME = 'divvi-campaign-data-production'
export const DATADIR = 'kpi'

function getKpiFileUrl(
  campaignName: string,
  startTimestamp: string,
  endTimestampExclusive: string,
) {
  const periodFolderName = toPeriodFolderName({
    startTimestamp: new Date(startTimestamp),
    endTimestampExclusive: new Date(endTimestampExclusive),
  })
  return `https://storage.googleapis.com/${STORAGE_BUCKET_NAME}/${DATADIR}/${campaignName}/${periodFolderName}/kpi.json`
}

function excludeRecord(addresses: string[]) {
  return addresses
    .map((address) => address.toLowerCase())
    .reduce(
      (acc, address) => {
        acc[address] = {
          referrerId: address,
          shouldWarn: false,
        }
        return acc
      },
      {} as Record<string, { referrerId: string; shouldWarn: boolean }>,
    )
}

/**
 * Fetches excluded builders from Google Sheets for a given campaign provider address
 *
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_JSON: Base64 encoded Google Service Account JSON
 * - CAMPAIGN_SETTINGS_GOOGLE_SHEET_ID: Google Sheets ID containing campaign settings
 *
 * The Google Sheet should have the following format:
 * - Column A: Campaign provider address (lowercase)
 * - Column B: Comma-separated list of excluded builder addresses
 */
async function getExcludedBuildersFromGoogleSheet(
  providerAddress: string,
): Promise<string[]> {
  try {
    // Get Google Sheets credentials from environment variables
    const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    const campaignSettingsSheetId =
      process.env.CAMPAIGN_SETTINGS_GOOGLE_SHEET_ID

    if (!googleServiceAccountJson || !campaignSettingsSheetId) {
      console.warn(
        'Google Sheets credentials not configured, skipping excluded builders fetch',
      )
      return []
    }

    // Decode the base64 encoded Google Service Account
    const base64Decoded = Buffer.from(
      googleServiceAccountJson,
      'base64',
    ).toString('utf8')
    const credentials = JSON.parse(base64Decoded)

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const range = 'Sheet1!A:B'

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: campaignSettingsSheetId,
      range,
    })

    const values = response.data.values || []

    // Find the row for this provider address
    const campaignRow = values.find(
      (row) => row[0]?.toLowerCase() === providerAddress.toLowerCase(),
    )

    if (!campaignRow || !campaignRow[1]) {
      return []
    }

    // Parse the comma-separated addresses
    const excludedBuilders = campaignRow[1]
      .split(',')
      .map((addr: string) => addr.trim().toLowerCase())
      .filter((addr: string) => addr.length > 0 && isAddress(addr))

    return excludedBuilders
  } catch (error) {
    console.error('Error fetching excluded builders from Google Sheet:', error)
    return []
  }
}

/**
 * Merges hardcoded excluded referrers with Google Sheet excluded builders
 */
async function getMergedExcludedReferrers(
  providerAddress: string,
  hardcodedExcludedReferrers: Record<
    string,
    { referrerId: string; shouldWarn: boolean }
  >,
): Promise<Record<string, { referrerId: string; shouldWarn: boolean }>> {
  const googleSheetExcludedBuilders =
    await getExcludedBuildersFromGoogleSheet(providerAddress)

  // Convert Google Sheet addresses to the same format as hardcoded excluded referrers
  const googleSheetExcludedReferrers = excludeRecord(
    googleSheetExcludedBuilders,
  )

  // Merge the two objects, with Google Sheet entries taking precedence
  return {
    ...hardcodedExcludedReferrers,
    ...googleSheetExcludedReferrers,
  }
}

const excludedReferrersFromTetherV0 = [
  excludeRecord([
    '0x45Cb8FbAf94CF87236c39c791a210c9605E18F06',
    '0x19B324e287E9aBC4706a4Cd09d08d5281d481c42',
    '0x747Cee5Bf7cCfD94371ee91BB8C9275Cd18A4f7e',
    '0x4AEacDA4b6Df4d6c98EDddf1f1F2F4d7Ed81268d',
    '0x48E8583049a03D10D621c8Bb907942ab83Cf25B0',
    '0xdA404bFDA2a5dCDa88FD2aa9B9e0C32a677bc8eB',
    '0xd59B83De618561c8FF4E98fC29a1b96ABcBFB18a',
  ]),
]

const excludedReferrersFromCeloPGS1 = [
  excludeRecord([
    '0x37b5a29b9532940414bbc59c616696daba16169c',
    '0xe70ffe8d559207261a17834c58786bfd53cd8642',
    '0x4ea48e01f1314db0925653e30617b254d1cf5366',
    '0x10265305e8b7ce057d70875f0fd44f2ee48456cb',
    '0xd59b83de618561c8ff4e98fc29a1b96abcbfb18a',
  ]),
  excludeRecord([
    '0x37b5a29b9532940414bbc59c616696daba16169c', // FunBear
    '0xe70ffe8d559207261a17834c58786bfd53cd8642', // Doeg
    '0xba7a463cf9f68046311616bb4c787923828f0644', // Premio
    '0x3207d4728c32391405c7122e59ccb115a4af31ea', // HealFi
    '0x10265305e8b7ce057d70875f0fd44f2ee48456cb', // Spinit
    '0xd7c271d20c9e323336bfc843aeb8dec23b346352', // Learna
    '0x53eaf4cd171842d8144e45211308e5d90b4b0088', // Sovseas
    '0x2298947e6c1d6c282c258b3e5f8989670a8e346f', // Dezenmart
    '0xda404bfda2a5dcda88fd2aa9b9e0c32a677bc8eb', // Contriboost
  ]),
  excludeRecord([
    '0x37b5a29b9532940414bbc59c616696daba16169c', // FunBear
    '0xe70ffe8d559207261a17834c58786bfd53cd8642', // Doeg
    '0xba7a463cf9f68046311616bb4c787923828f0644', // Premio
    '0x3207d4728c32391405c7122e59ccb115a4af31ea', // HealFi
    '0x10265305e8b7ce057d70875f0fd44f2ee48456cb', // Spinit
    '0xd7c271d20c9e323336bfc843aeb8dec23b346352', // Learna
    '0x2298947e6c1d6c282c258b3e5f8989670a8e346f', // Dezenmart
    '0xda404bfda2a5dcda88fd2aa9b9e0c32a677bc8eb', // Contriboost
  ]),
]

const tetherV0Campaign: Campaign = {
  providerAddress: '0xe451b7Cd488aD2Bf6bfdECD7702a2967329cC1D0',
  protocol: 'tether-v0',
  rewardsPoolAddress: '0xb575210cdf52b18000ae24be4981e9abc7716f98',
  networkId: NetworkId['ethereum-mainnet'],
  valoraRewardsPoolAddress: null,
  rewardsPeriods: [
    {
      startTimestamp: '2025-07-28T00:00:00Z',
      endTimestampExclusive: '2025-08-30T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          tetherV0Campaign.providerAddress,
          excludedReferrersFromTetherV0[0],
        )
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '5000000000', // 5000 USDT
          excludedReferrers: mergedExcludedReferrers,
        })
      },
    },
    {
      startTimestamp: '2025-08-30T00:00:00Z',
      endTimestampExclusive: '2025-09-30T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          tetherV0Campaign.providerAddress,
          {},
        )
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '10000000000', // 10000 USDT
          excludedReferrers: mergedExcludedReferrers,
        })
      },
    },
    {
      startTimestamp: '2025-09-30T00:00:00Z',
      endTimestampExclusive: '2025-10-31T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          tetherV0Campaign.providerAddress,
          {},
        )
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '15000000000', // 15000 USDT
          excludedReferrers: mergedExcludedReferrers,
        })
      },
    },
    {
      startTimestamp: '2025-10-31T00:00:00Z',
      endTimestampExclusive: '2025-12-01T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          tetherV0Campaign.providerAddress,
          {},
        )
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '15000000000', // 15000 USDT
          excludedReferrers: mergedExcludedReferrers,
        })
      },
    },
  ],
}

function celoPGS1PreviousKpiFiles(index: number) {
  return celoPGS1Campaign.rewardsPeriods.slice(0, index).map((period) => {
    return getKpiFileUrl(
      'celo-pg-s1',
      period.startTimestamp,
      period.endTimestampExclusive,
    )
  })
}

const celoPGS1Campaign: Campaign = {
  protocol: 'celo-pg-s1',
  providerAddress: '0xd452036ca4552c51706e77eD2b2Bf0f3c1E24E7A',
  // TODO: support both CELO and OP reward pools
  rewardsPoolAddress: '0xb14e0d244746FE8Ad6dA763B44f43669fab620f5',
  networkId: NetworkId['celo-mainnet'],
  valoraRewardsPoolAddress: null,
  rewardsPeriods: [
    {
      startTimestamp: '2025-08-26T00:00:00Z',
      endTimestampExclusive: '2025-09-09T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const index = 0
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[0],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: celoPGS1PreviousKpiFiles(index),
          stageFunction: calculateStageV0,
          qualityUserScoreBonusRatio: 0.0,
        })
      },
    },
    {
      startTimestamp: '2025-09-09T00:00:00Z',
      endTimestampExclusive: '2025-09-23T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const index = 1
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[1],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: celoPGS1PreviousKpiFiles(index),
          stageFunction: calculateStageV1,
          qualityUserScoreBonusRatio: 0.0,
        })
      },
    },
    {
      startTimestamp: '2025-09-23T00:00:00Z',
      endTimestampExclusive: '2025-10-07T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const index = 2
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: celoPGS1PreviousKpiFiles(index),
          stageFunction: calculateStageV2,
          qualityUserScoreBonusRatio: 0.0,
        })
      },
    },
    {
      startTimestamp: '2025-10-07T00:00:00Z',
      endTimestampExclusive: '2025-10-21T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: [],
          stageFunction: calculateStageV3,
          qualityUserScoreBonusRatio: 0.2,
        })
      },
    },
    {
      startTimestamp: '2025-10-21T00:00:00Z',
      endTimestampExclusive: '2025-11-04T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: [],
          stageFunction: calculateStageV3,
          qualityUserScoreBonusRatio: 0.2,
        })
      },
    },
    {
      startTimestamp: '2025-11-04T00:00:00Z',
      endTimestampExclusive: '2025-11-18T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: [],
          stageFunction: calculateStageV3,
          qualityUserScoreBonusRatio: 0.2,
        })
      },
    },
    {
      startTimestamp: '2025-11-18T00:00:00Z',
      endTimestampExclusive: '2025-12-02T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: [],
          stageFunction: calculateStageV3,
          qualityUserScoreBonusRatio: 0.2,
        })
      },
    },
    {
      startTimestamp: '2025-12-02T00:00:00Z',
      endTimestampExclusive: '2025-12-16T00:00:00Z',
      calculateRewards: async ({
        resultDirectory,
        startTimestamp,
        endTimestampExclusive,
      }) => {
        const mergedExcludedReferrers = await getMergedExcludedReferrers(
          celoPGS1Campaign.providerAddress,
          excludedReferrersFromCeloPGS1[2],
        )
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: mergedExcludedReferrers,
          previousKpiFiles: [],
          stageFunction: calculateStageV3,
          qualityUserScoreBonusRatio: 0.2,
        })
      },
    },
  ],
}

export const campaigns: Campaign[] = [
  ...pastCampaigns,
  tetherV0Campaign,
  celoPGS1Campaign,
]
