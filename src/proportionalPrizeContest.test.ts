import { expect } from 'chai'
import BigNumber from 'bignumber.js'
import {
  calculateProportionalPrizeContest,
  calculateSqrtProportionalPrizeContest,
} from './proportionalPrizeContest'

describe('calculateProportionalPrizeContest', () => {
  it('should calculate rewards proportionally based on KPI', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '100' },
      { referrerId: 'ref1', userAddress: 'user2', kpi: '200' },
      { referrerId: 'ref2', userAddress: 'user3', kpi: '300' },
    ]

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    // Total KPI: 600 (100 + 200 + 300)
    // ref1: 300/600 = 50% of rewards = 500
    // ref2: 300/600 = 50% of rewards = 500
    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '500',
        kpi: 300n,
        referralCount: 2,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '500',
        kpi: 300n,
        referralCount: 1,
      },
    ])
  })

  it('should handle zero KPI values', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '0' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '100' },
    ]

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    // Only ref2 should get rewards since ref1 has zero KPI
    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '0',
        kpi: 0n,
        referralCount: 1,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '1000', // All rewards go to ref2
        kpi: 100n,
        referralCount: 1,
      },
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = new BigNumber('1000')
    const kpiData: {
      referrerId: string
      userAddress: string
      kpi: string
    }[] = []

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    expect(result).to.deep.equal([])
  })

  it('should handle all zero KPI values', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '0' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '0' },
    ]

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '0',
        kpi: 0n,
        referralCount: 1,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '0',
        kpi: 0n,
        referralCount: 1,
      },
    ])
  })
})

describe('calculateSqrtProportionalPrizeContest', () => {
  const rewards = new BigNumber('1000')

  it('should calculate rewards proportionally based on KPI raised to power', () => {
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '1' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '8' },
      { referrerId: 'ref2', userAddress: 'user3', kpi: '8' },
    ]

    const result = calculateSqrtProportionalPrizeContest({
      kpiData,
      rewards,
      excludedReferrers: {},
    })

    // ref1: sqrt(1) = 1, ref2: sqrt(8+8) = sqrt(16) = 4
    // Total power: 1 + 4 = 5
    // ref1: 1/5 = 20% of rewards = 200
    // ref2: 4/5 = 80% of rewards = 800
    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '200',
        kpi: 1n,
        referralCount: 1,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '800',
        kpi: 16n,
        referralCount: 2,
      },
    ])
  })

  it('should exclude referrers in the excludedReferrers from receiving rewards', () => {
    const result = calculateSqrtProportionalPrizeContest({
      kpiData: [
        { referrerId: 'ref1', userAddress: 'user1', kpi: '1' },
        { referrerId: 'ref2', userAddress: 'user2', kpi: '8' },
        { referrerId: 'ref2', userAddress: 'user3', kpi: '2' },
        { referrerId: 'ref3', userAddress: 'user4', kpi: '16' },
      ],
      rewards,
      excludedReferrers: {
        ref2: { referrerId: 'ref2', shouldWarn: false },
      },
    })

    // ref1: sqrt(1) = 1, ref2: excluded, ref3: sqrt(16) = 4
    // Total power: 1 + 4 = 5 (ref2 excluded)
    // ref1: 1/5 = 20% of rewards = 200
    // ref2: 0% of rewards = 0 (excluded)
    // ref3: 4/5 = 80% of rewards = 800
    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '200',
        kpi: 1n,
        referralCount: 1,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '0', // no rewards
        kpi: 10n, // the kpi value is preserved
        referralCount: 2,
      },
      {
        referrerId: 'ref3',
        rewardAmount: '800',
        kpi: 16n,
        referralCount: 1,
      },
    ])
  })

  it('should handle all referrers being excluded', () => {
    const result = calculateSqrtProportionalPrizeContest({
      kpiData: [
        { referrerId: 'ref1', userAddress: 'user1', kpi: '1' },
        { referrerId: 'ref2', userAddress: 'user2', kpi: '8' },
        { referrerId: 'ref2', userAddress: 'user3', kpi: '2' },
      ],
      rewards,
      excludedReferrers: {
        ref1: { referrerId: 'ref1', shouldWarn: false },
        ref2: { referrerId: 'ref2', shouldWarn: false },
      },
    })

    // All referrers excluded, total power = 0
    // All should get 0 rewards
    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '0',
        kpi: 1n,
        referralCount: 1,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '0',
        kpi: 10n,
        referralCount: 2,
      },
    ])
  })
})
