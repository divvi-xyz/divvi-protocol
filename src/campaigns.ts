import { NetworkId } from '../scripts/types'
import { main as calculateRewardsCeloPGS1 } from '../scripts/calculateRewards/celoPGS1'
import { main as calculateRewardsTetherV0 } from '../scripts/calculateRewards/tetherV0'
import { toPeriodFolderName } from '../scripts/utils/dateFormatting'
import { Campaign } from './types'
import { pastCampaigns } from './pastCampaings'
import { calculateStageV0, calculateStageV1 } from './celoPGRewards'

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

const excludedReferrersFromTetherV0 = [
  [
    '0x45Cb8FbAf94CF87236c39c791a210c9605E18F06',
    '0x19B324e287E9aBC4706a4Cd09d08d5281d481c42',
    '0x747Cee5Bf7cCfD94371ee91BB8C9275Cd18A4f7e',
    '0x4AEacDA4b6Df4d6c98EDddf1f1F2F4d7Ed81268d',
    '0x48E8583049a03D10D621c8Bb907942ab83Cf25B0',
    '0xdA404bFDA2a5dCDa88FD2aa9B9e0C32a677bc8eB',
    '0xd59B83De618561c8FF4E98fC29a1b96ABcBFB18a',
  ]
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
    ),
]

const excludedReferrersFromCeloPGS1 = [
  [
    '0x37b5a29b9532940414bbc59c616696daba16169c',
    '0xe70ffe8d559207261a17834c58786bfd53cd8642',
    '0x4ea48e01f1314db0925653e30617b254d1cf5366',
    '0x10265305e8b7ce057d70875f0fd44f2ee48456cb',
    '0xd59b83de618561c8ff4e98fc29a1b96abcbfb18a',
  ]
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
    ),
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
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '5000000000', // 5000 USDT
          excludedReferrers: excludedReferrersFromTetherV0[0],
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
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '10000000000', // 10000 USDT
          excludedReferrers: {},
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
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '15000000000', // 15000 USDT
          excludedReferrers: {},
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
        await calculateRewardsTetherV0({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '15000000000', // 15000 USDT
          excludedReferrers: {},
        })
      },
    },
  ],
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: excludedReferrersFromCeloPGS1[0],
          previousKpiFiles: [],
          stageFunction: calculateStageV0,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [
            getKpiFileUrl(
              'celo-pg-s1',
              '2025-08-26T00:00:00Z',
              '2025-09-09T00:00:00Z',
            ),
          ],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
        await calculateRewardsCeloPGS1({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
          // TODO: reward both CELO and OP
          rewardAmount: '25000',
          excludedReferrers: {},
          previousKpiFiles: [],
          stageFunction: calculateStageV1,
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
