import { BigNumber } from 'bignumber.js'
import { calculateRewardsLiskV0 } from './liskV0'
import { parseEther } from 'viem'

describe('calculateRewardsLiskV0', () => {
  const rewardAmountInEther = parseEther('15000').toString()

  it('should calculate rewards proportionally based on KPI', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        kpi: '100',
      },
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser2',
        kpi: '200',
      },
      {
        referrerId: '0xreferrer2',
        userAddress: '0xuser3',
        kpi: '700',
      },
    ]

    const rewards = calculateRewardsLiskV0({
      kpiData,
      excludedReferrers: {},
      maximumRewardAmount: new BigNumber(rewardAmountInEther),
    })

    expect(rewards).toEqual([
      expect.objectContaining({
        referrerId: '0xreferrer2',
        rewardAmount: new BigNumber(rewardAmountInEther)
          .times(0.7)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }),
      expect.objectContaining({
        referrerId: '0xreferrer1',
        rewardAmount: new BigNumber(rewardAmountInEther)
          .times(0.3)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }),
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = calculateRewardsLiskV0({
      kpiData: [],
      excludedReferrers: {},
      maximumRewardAmount: new BigNumber(rewardAmountInEther),
    })

    expect(rewards).toHaveLength(0)
  })

  it('should exclude referrers in excludedReferrers from receiving rewards', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        kpi: '100',
      },
      {
        referrerId: '0xreferrer2',
        userAddress: '0xuser2',
        kpi: '200',
      },
    ]

    const rewards = calculateRewardsLiskV0({
      kpiData,
      excludedReferrers: {
        '0xreferrer1': { referrerId: '0xreferrer1' },
      },
      maximumRewardAmount: new BigNumber(rewardAmountInEther),
    })

    expect(rewards).toEqual([
      expect.objectContaining({
        referrerId: '0xreferrer2',
        rewardAmount: rewardAmountInEther,
      }),
      expect.objectContaining({
        referrerId: '0xreferrer1',
        rewardAmount: '0',
        kpi: 100n,
      }),
    ])
  })

  it('should not exceed the maximum reward amount', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        kpi: '100',
      },
      {
        referrerId: '0xreferrer2',
        userAddress: '0xuser2',
        kpi: '100',
      },
    ]

    const maximumRewardAmount = BigNumber(rewardAmountInEther).times(0.2)

    const rewards = calculateRewardsLiskV0({
      kpiData,
      excludedReferrers: {},
      maximumRewardAmount,
    })

    expect(rewards).toEqual([
      expect.objectContaining({
        referrerId: '0xreferrer1',
        rewardAmount: maximumRewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      }),
      expect.objectContaining({
        referrerId: '0xreferrer2',
        rewardAmount: maximumRewardAmount.toFixed(0, BigNumber.ROUND_DOWN),
      }),
    ])
  })
})
