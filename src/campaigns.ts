import { Address } from 'viem'
import { Protocol, NetworkId } from '../scripts/types'
import { ResultDirectory } from './resultDirectory'
import { main as calculateRewardsCeloPG } from '../scripts/calculateRewards/celoPG'
import { main as calculateRewardSlices } from '../scripts/calculateRewards/slices'
import { main as calculateRewardsLiskV0 } from '../scripts/calculateRewards/liskV0'
import { calculateSqrtProportionalRewards } from '../scripts/calculateRewards/sqrtProportionalRewards'
import BigNumber from 'bignumber.js'
import { main as calculateRewardsScoutGame } from '../scripts/calculateRewards/scoutGameV0'

export type Campaign = {
  providerAddress: Address
  protocol: Protocol
  rewardsPoolAddress: Address
  networkId: NetworkId
  valoraRewardsPoolAddress: Address | null // reward pool for redistributing valora rewards
  rewardsPeriods: {
    startTimestamp: string
    endTimestampExclusive: string
    rewardAmountInWei: string
    calculateRewards?: (args: {
      resultDirectory: ResultDirectory
      startTimestamp: string
      endTimestampExclusive: string
      rewardPoolAddress: string
      rewardAmountInWei: string
    }) => Promise<void>
    calculateRewardSlices?: (args: {
      resultDirectory: ResultDirectory
      startTimestamp: string
      endTimestampExclusive: string
    }) => Promise<void>
  }[]
}

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
        rewardAmountInWei: '25000000000000000000000',
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
        rewardAmountInWei: '50000000000000000000000',
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
        rewardAmountInWei: '75000000000000000000000',
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
        rewardAmountInWei: '0', // done in reward handler
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
        rewardAmountInWei: '0', // done in reward handler
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
        rewardAmountInWei: '0', // done in reward handler
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
        rewardAmountInWei: '0', // done in reward handler
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
        rewardAmountInWei: '15000000000000000000000',
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
        rewardAmountInWei: '15000000000000000000000',
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
    rewardsPeriods: [], // past campaign
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
        rewardAmountInWei: '1000000000',
        calculateRewards: calculateSqrtProportionalRewards,
      },
    ],
  },
  {
    protocol: 'mantle-v0',
    providerAddress: '0xf0A028C70ba0339efe93Ea2E0bE346eCbCd5c487',
    networkId: NetworkId['mantle-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPoolAddress: '0xb5dB5E98B41bF6081Da271eaC95C70d46D5B5Ed2',
    rewardsPeriods: [
      {
        startTimestamp: '2025-08-01T00:00:00Z',
        endTimestampExclusive: '2025-08-30T00:00:00Z',
        rewardAmountInWei: '0', // TODO: add reward amount per distribution ($2.5k in $MNT) once funded
        calculateRewards: calculateSqrtProportionalRewards,
      },
      {
        startTimestamp: '2025-08-30T00:00:00Z',
        endTimestampExclusive: '2025-09-30T00:00:00Z',
        rewardAmountInWei: '0', // TODO: add reward amount per distribution ($2.5k in $MNT) once funded
        calculateRewards: calculateSqrtProportionalRewards,
      },
    ],
  },
  {
    protocol: 'morph',
    rewardsPoolAddress: '0x0000000000000000000000000000000000000000', // on Morph mainnet (TODO: fill this in after ENG-527 is done)
    providerAddress: '0x0', // TODO: fill this in
    networkId: NetworkId['morph-mainnet'],
    valoraRewardsPoolAddress: null,
    rewardsPeriods: [
      {
        startTimestamp: '2025-08-01T00:00:00Z',
        endTimestampExclusive: '2025-08-30T00:00:00Z',
        rewardAmountInWei: '0', // TODO: add reward amount per distribution ($15k in $MNT) once funded
        calculateRewards: calculateSqrtProportionalRewards,
      },
      {
        startTimestamp: '2025-08-30T00:00:00Z',
        endTimestampExclusive: '2025-09-30T00:00:00Z',
        rewardAmountInWei: '0', // TODO: add reward amount per distribution ($15k in $MNT) once funded
        calculateRewards: calculateSqrtProportionalRewards,
      },
    ],
  },
]
