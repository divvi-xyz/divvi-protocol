import BigNumber from 'bignumber.js'
import { calculateRewardsCeloPG } from './celoPG'

describe('calculateRewardsCeloPG', () => {
  const rewardAmount = '10000'

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

    const rewards = calculateRewardsCeloPG({
      kpiData,
      rewardAmount,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(300),
        rewardAmount: new BigNumber(rewardAmount)
          .times(0.3)
          .toFixed(0, BigNumber.ROUND_DOWN),
      },
      {
        referrerId: '0xreferrer2',
        kpi: BigInt(700),
        rewardAmount: new BigNumber(rewardAmount)
          .times(0.7)
          .toFixed(0, BigNumber.ROUND_DOWN),
      },
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = calculateRewardsCeloPG({
      kpiData: [],
      rewardAmount,
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

    const rewards = calculateRewardsCeloPG({
      kpiData,
      rewardAmount,
    })

    expect(rewards).toEqual([
      {
        referrerId: '0xreferrer1',
        kpi: BigInt(100),
        rewardAmount: new BigNumber(rewardAmount).toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      },
    ])
  })
})
