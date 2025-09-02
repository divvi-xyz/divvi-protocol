import { BigNumber } from 'bignumber.js'
import { calculateRewards } from './celoPGRewards'
import { KpiRow } from './resultDirectory'

describe('calculateRewards', () => {
  it('should calculate sqrt-based rewards, aggregate KPIs, and determine all 5 stages', () => {
    // Helper function to create multiple users for a referrer
    function createUsers(
      referrerId: string,
      count: number,
      gasPerUser: string,
    ): KpiRow[] {
      return Array.from({ length: count }, (_, i) => ({
        referrerId,
        userAddress: `0xuser${referrerId}_${i}`,
        kpi: gasPerUser,
      }))
    }

    const kpiData: KpiRow[] = [
      // Stage 0: < 100 wallets
      ...createUsers('0xstage0', 50, '500000000'), // 50 wallets, 0.5B gas each = 25B total

      // Stage 1: >= 100 wallets && >= 1B gas
      ...createUsers('0xstage1', 150, '10000000'), // 150 wallets, 0.01B gas each = 1.5B total

      // Stage 2: >= 2500 wallets && >= 10B gas
      ...createUsers('0xstage2', 3_000, '5000000'), // 3000 wallets, 0.005B gas each = 15B total

      // Stage 3: >= 10000 wallets && >= 50B gas
      ...createUsers('0xstage3', 12_000, '5000000'), // 12000 wallets, 0.005B gas each = 60B total

      // Stage 4: >= 1000000 wallets && >= 100B gas
      ...createUsers('0xstage4', 1_100_000, '100000'), // 1.1M wallets, 0.0001B gas each = 110B total
    ]

    const result = calculateRewards({
      kpiData,
      rewards: new BigNumber('1000000'),
      excludedReferrers: {},
    })

    // Verify sqrt-based calculation, KPI aggregation, and all 5 stages
    expect(result).toStrictEqual([
      {
        referrerId: '0xstage0',
        kpi: 25_000_000_000n,
        referralCount: 50,
        uniqueWallets: 50,
        gasUsage: 25_000_000_000n, // 25B
        stage: 0,
        rewardAmount: '176480',
      },
      {
        referrerId: '0xstage1',
        kpi: 1_500_000_000n,
        referralCount: 150,
        uniqueWallets: 150,
        gasUsage: 1_500_000_000n, // 1.5B
        stage: 1,
        rewardAmount: '43228',
      },
      {
        referrerId: '0xstage2',
        kpi: 15_000_000_000n,
        referralCount: 3000,
        uniqueWallets: 3_000,
        gasUsage: 15_000_000_000n, // 15B
        stage: 2,
        rewardAmount: '136701',
      },
      {
        referrerId: '0xstage3',
        kpi: 60_000_000_000n,
        referralCount: 12_000,
        uniqueWallets: 12_000,
        gasUsage: 60_000_000_000n, // 60B
        stage: 3,
        rewardAmount: '273402',
      },
      {
        referrerId: '0xstage4',
        kpi: 110_000_000_000n,
        referralCount: 1_100_000,
        uniqueWallets: 1_100_000,
        gasUsage: 110_000_000_000n, // 110B
        stage: 4,
        rewardAmount: '370188',
      },
    ])
  })

  it('should exclude referrers and redistribute rewards to non-excluded ones', () => {
    const kpiData: KpiRow[] = [
      {
        referrerId: '0xReferrer1', // Mixed case
        userAddress: '0xuser1',
        kpi: '100',
      },
      {
        referrerId: '0xreferrer2',
        userAddress: '0xuser2',
        kpi: '400',
      },
    ]

    const result = calculateRewards({
      kpiData,
      rewards: new BigNumber('30000'),
      excludedReferrers: {
        '0xreferrer1': { referrerId: '0xreferrer1' }, // Lowercase in exclude list
      },
    })

    // referrer1 excluded, only referrer2 gets rewards
    expect(result).toStrictEqual([
      {
        referrerId: '0xReferrer1',
        kpi: 100n,
        referralCount: 1,
        uniqueWallets: 1,
        gasUsage: 100n,
        stage: 0,
        rewardAmount: '0', // Excluded
      },
      {
        referrerId: '0xreferrer2',
        kpi: 400n,
        referralCount: 1,
        uniqueWallets: 1,
        gasUsage: 400n,
        stage: 0,
        rewardAmount: '30000', // Gets all rewards
      },
    ])
  })

  it('should handle empty KPI data', () => {
    expect(
      calculateRewards({
        kpiData: [],
        rewards: new BigNumber('1000'),
        excludedReferrers: {},
      }),
    ).toStrictEqual([])
  })

  it('should handle single referrer getting all rewards', () => {
    expect(
      calculateRewards({
        kpiData: [{ referrerId: '0xref1', userAddress: '0xuser1', kpi: '100' }],
        rewards: new BigNumber('1000'),
        excludedReferrers: {},
      }),
    ).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 100n,
        referralCount: 1,
        uniqueWallets: 1,
        gasUsage: 100n,
        stage: 0,
        rewardAmount: '1000',
      },
    ])
  })

  it('should handle zero rewards', () => {
    expect(
      calculateRewards({
        kpiData: [{ referrerId: '0xref1', userAddress: '0xuser1', kpi: '100' }],
        rewards: new BigNumber('0'),
        excludedReferrers: {},
      }),
    ).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 100n,
        referralCount: 1,
        uniqueWallets: 1,
        gasUsage: 100n,
        stage: 0,
        rewardAmount: '0',
      },
    ])
  })
})
