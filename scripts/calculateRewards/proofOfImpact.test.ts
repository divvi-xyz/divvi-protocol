import {
  calculateRewardsProofOfImpact,
  _rewardsPerMillisecond,
} from './proofOfImpact'
import BigNumber from 'bignumber.js'

describe('calculateRewardsProofOfImpact', () => {
  const startTimestamp = new Date('2025-05-08')
  const endTimestampExclusive = new Date('2025-05-15')
  const expectedTotalRewardsForPeriod = _rewardsPerMillisecond.times(
    new BigNumber(endTimestampExclusive.getTime()).minus(
      startTimestamp.getTime(),
    ),
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
      endTimestampExclusive,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(300),
        rewardAmount: expectedTotalRewardsForPeriod
          .times(0.3)
          .toFixed(0, BigNumber.ROUND_DOWN),
      },
      {
        referrerId: '0xreferrer2',
        kpi: BigInt(700),
        rewardAmount: expectedTotalRewardsForPeriod
          .times(0.7)
          .toFixed(0, BigNumber.ROUND_DOWN),
      },
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = calculateRewardsProofOfImpact({
      kpiData: [],
      startTimestamp,
      endTimestampExclusive,
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
      endTimestampExclusive,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(100),
        rewardAmount: expectedTotalRewardsForPeriod.toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      },
    ])
  })
})
