import { expect } from 'chai'
import BigNumber from 'bignumber.js'
import { calculateProportionalPrizeContest } from './proportionalPrizeContest'

describe('calculateProportionalPrizeContest', () => {
  it('should calculate rewards proportionally based on KPI', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', revenue: '100' },
      { referrerId: 'ref1', userAddress: 'user2', revenue: '200' },
      { referrerId: 'ref2', userAddress: 'user3', revenue: '300' },
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
        kpi: BigInt(300),
        rewardAmount: '500',
      },
      {
        referrerId: 'ref2',
        kpi: BigInt(300),
        rewardAmount: '500',
      },
    ])
  })

  it('should handle zero KPI values', () => {
    const rewards = new BigNumber('1000')
    const kpiData = [
      { referrerId: 'ref1', userAddress: 'user1', revenue: '0' },
      { referrerId: 'ref2', userAddress: 'user2', revenue: '100' },
    ]

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    // Only ref2 should get rewards since ref1 has zero KPI
    expect(result).to.deep.equal([
      {
        referrerId: 'ref2',
        kpi: BigInt(100),
        rewardAmount: '1000', // All rewards go to ref2
      },
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = new BigNumber('1000')
    const kpiData: {
      referrerId: string
      userAddress: string
      revenue: string
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
      { referrerId: 'ref1', userAddress: 'user1', revenue: '0' },
      { referrerId: 'ref2', userAddress: 'user2', revenue: '0' },
    ]

    const result = calculateProportionalPrizeContest({
      kpiData,
      rewards,
    })

    expect(result).to.deep.equal([])
  })
})
