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
      },
      {
        referrerId: 'ref2',
        rewardAmount: '500',
        kpi: 300n,
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
        referrerId: 'ref2',
        rewardAmount: '1000', // All rewards go to ref2
        kpi: 100n,
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

    expect(result).to.deep.equal([])
  })
})

describe('calculateSqrtProportionalPrizeContest', () => {
  it('should calculate rewards proportionally based on KPI raised to power', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', kpi: '1' },
      { referrerId: 'ref2', userAddress: 'user2', kpi: '8' },
      { referrerId: 'ref2', userAddress: 'user3', kpi: '8' },
    ]

    const result = calculateSqrtProportionalPrizeContest({
      kpiData,
      rewards,
    })

    expect(result).to.deep.equal([
      {
        referrerId: 'ref1',
        rewardAmount: '200',
        kpi: 1n,
      },
      {
        referrerId: 'ref2',
        rewardAmount: '800',
        kpi: 16n,
      },
    ])
  })
})
