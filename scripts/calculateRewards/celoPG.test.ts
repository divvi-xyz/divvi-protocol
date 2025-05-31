import BigNumber from 'bignumber.js'
import { calculateRewardsCeloPG } from './celoPG'
import { parseEther } from 'viem'

describe('calculateRewardsCeloPG', () => {
  const rewardAmount = '10000'
  const rewardAmountInEther = parseEther(rewardAmount).toString()

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

    const rewards = calculateRewardsCeloPG({
      kpiData,
      rewardAmount,
      proportionLinear: 1,
    })

    expect(rewards).toEqual([
      expect.objectContaining({
        referrerId: '0xreferrer1',
        rewardAmount: new BigNumber(rewardAmountInEther)
          .times(0.3)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }),
      expect.objectContaining({
        referrerId: '0xreferrer2',
        rewardAmount: new BigNumber(rewardAmountInEther)
          .times(0.7)
          .toFixed(0, BigNumber.ROUND_DOWN),
      }),
    ])
  })

  it('should handle empty KPI data', () => {
    const rewards = calculateRewardsCeloPG({
      kpiData: [],
      rewardAmount,
      proportionLinear: 1,
    })

    expect(rewards).toHaveLength(0)
  })

  it('should handle single referrer case', () => {
    const kpiData = [
      {
        referrerId: '0xreferrer1',
        userAddress: '0xuser1',
        kpi: '100',
      },
    ]

    const rewards = calculateRewardsCeloPG({
      kpiData,
      rewardAmount,
      proportionLinear: 1,
    })

    expect(rewards).toEqual([
      expect.objectContaining({
        referrerId: '0xreferrer1',
        rewardAmount: new BigNumber(rewardAmountInEther).toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      }),
    ])
  })
})
