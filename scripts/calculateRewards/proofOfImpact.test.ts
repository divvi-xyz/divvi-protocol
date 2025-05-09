import {
  calculateRewardsProofOfImpact,
  _rewardsPerMillisecond,
} from './proofOfImpact'
import BigNumber from 'bignumber.js'

describe('calculateRewardsProofOfImpact', () => {
  const startTimestamp = '1746687600000' // May 8 2025 12:00:00 AM UTC
  const endTimestamp = '1747267200000' // May 15 2025 12:00:00 AM UTC
  const expectedTotalRewardsForPeriod = _rewardsPerMillisecond.times(
    new BigNumber(endTimestamp).minus(startTimestamp),
  )

  it('should calculate rewards proportionally based on revenue', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        revenue: '100',
      },
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser2',
        revenue: '200',
      },
      {
        referrerId: '0xreferrer2',
        userAddress: '0xuser3',
        revenue: '700',
      },
    ]

    const rewards = calculateRewardsProofOfImpact({
      kpiData,
      startTimestamp,
      endTimestamp,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(300),
        reward: expectedTotalRewardsForPeriod.times(0.3).toString(),
      },
      {
        referrerId: '0xreferrer2',
        kpi: BigInt(700),
        reward: expectedTotalRewardsForPeriod.times(0.7).toString(),
      },
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = calculateRewardsProofOfImpact({
      kpiData: [],
      startTimestamp,
      endTimestamp,
    })

    expect(rewards).toHaveLength(0)
  })

  it('should handle single referrer case', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        revenue: '100',
      },
    ]

    const rewards = calculateRewardsProofOfImpact({
      kpiData,
      startTimestamp,
      endTimestamp,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(100),
        reward: expectedTotalRewardsForPeriod.toString(),
      },
    ])
  })
})
