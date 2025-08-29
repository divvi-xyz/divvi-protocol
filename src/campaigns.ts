import { Address } from 'viem'
import { BigNumber } from 'bignumber.js'
import { Protocol, NetworkId } from '../scripts/types'
import { ResultDirectory } from './resultDirectory'
import { main as calculateRewardsCeloPG } from '../scripts/calculateRewards/celoPG'
import { main as calculateRewardSlices } from '../scripts/calculateRewards/slices'
import { main as calculateRewardsScoutGame } from '../scripts/calculateRewards/scoutGameV0'
import { main as calculateRewardsLiskV0 } from '../scripts/calculateRewards/liskV0'
import { main as calculateRewardsBaseV0 } from '../scripts/calculateRewards/baseV0'
import { main as calculateRewardsTetherV0 } from '../scripts/calculateRewards/tetherV0'

export type Campaign = {
  providerAddress: Address
  protocol: Protocol
  rewardsPoolAddress: Address
  networkId: NetworkId
  rewardsPeriods: {
    startTimestamp: string
    endTimestampExclusive: string
    calculateRewards?: (args: {
      resultDirectory: ResultDirectory
      startTimestamp: string
      endTimestampExclusive: string
    }) => Promise<void>
    calculateRewardSlices?: (args: {
      resultDirectory: ResultDirectory
      startTimestamp: string
      endTimestampExclusive: string
    }) => Promise<void>
  }[]
  valoraRewardsPoolAddress: Address | null // reward pool for redistributing valora rewards
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

export const campaigns: Campaign[] = [
  {
    providerAddress: '0x0423189886d7966f0dd7e7d256898daeee625dca',
    protocol: 'celo-pg',
    rewardsPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
    networkId: NetworkId['celo-mainnet'],
    valoraRewardsPoolAddress: '0x6fff207A32ac1392C132913cea80Bae23dDD5f77',
    rewardsPeriods: [
      {
        startTimestamp: '2025-05-15T00:00:00Z',
        endTimestampExclusive: '2025-06-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsCeloPG({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '25000',
            proportionLinear: 0.8,
          })
        },
        calculateRewardSlices: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardSlices({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '100000',
            rewardType: 'builder',
          })
        },
      },
      {
        startTimestamp: '2025-06-01T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsCeloPG({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '50000',
            proportionLinear: 0.1,
          })
        },
        calculateRewardSlices: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardSlices({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '200000',
            rewardType: 'builder',
          })
        },
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsCeloPG({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '75000',
            proportionLinear: 0.1,
          })
        },
        calculateRewardSlices: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardSlices({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            rewardAmount: '300000',
            rewardType: 'builder',
          })
        },
      },
    ],
  },
  {
    providerAddress: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
    protocol: 'scout-game-v0',
    rewardsPoolAddress: '0x6f599b879541d289e344e325f4d9badf8c5bb49e',
    networkId: NetworkId['base-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-03T00:00:00Z',
        endTimestampExclusive: '2025-06-10T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-10T00:00:00Z',
        endTimestampExclusive: '2025-06-17T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-17T00:00:00Z',
        endTimestampExclusive: '2025-06-24T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
      {
        startTimestamp: '2025-06-24T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsScoutGame({
            resultDirectory,
            startTimestamp: new Date(startTimestamp),
            endTimestampExclusive: new Date(endTimestampExclusive),
          })
        },
      },
    ],
  },
  {
    providerAddress: '0x7beb0e14f8d2e6f6678cc30d867787b384b19e20',
    protocol: 'lisk-v0',
    rewardsPoolAddress: '0xbbf7b15c819102b137a96703e63ecf1c3d57cc68',
    networkId: NetworkId['lisk-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-05T00:00:00Z',
        endTimestampExclusive: '2025-07-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsLiskV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            maximumRewardProportion: new BigNumber(0.2),
          })
        },
      },
      {
        startTimestamp: '2025-07-01T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsLiskV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
            maximumRewardProportion: new BigNumber(0.2),
          })
        },
      },
    ],
  },
  {
    providerAddress: '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8',
    protocol: 'celo-transactions',
    rewardsPoolAddress: '0xe2bedafb063e0b7f12607ebcf4636e2690a427a3',
    networkId: NetworkId['celo-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPeriods: [],
  },
  {
    providerAddress: '0xce56ed47c8f2ee8714087c9e48924b1a30bc455c',
    protocol: 'base-v0',
    rewardsPoolAddress: '0xa2a4c1eb286a2efa470d42676081b771bbe9c1c8',
    networkId: NetworkId['base-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPeriods: [
      {
        startTimestamp: '2025-06-30T00:00:00Z',
        endTimestampExclusive: '2025-08-01T00:00:00Z',
        calculateRewards: async ({
          resultDirectory,
          startTimestamp,
          endTimestampExclusive,
        }) => {
          await calculateRewardsBaseV0({
            resultDirectory,
            startTimestamp,
            endTimestampExclusive,
          })
        },
      },
    ],
  },
  {
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
    ],
  },
]
