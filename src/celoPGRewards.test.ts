import { BigNumber } from 'bignumber.js'
import { calculateRewards } from './celoPGRewards'
import { KpiRow } from './resultDirectory'

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

describe('calculateRewards', () => {
  it('should calculate sqrt-based rewards, aggregate KPIs, and determine all 5 stages', () => {
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
        sqrtOnlyReward: '0', // Stage 0 gets no rewards at all
        baseReward: '0', // Stage 0 gets no rewards at all
        stageBonus: '0', // Stage 0 gets no bonus
        rewardAmount: '0', // Stage 0 gets no rewards at all
      },
      {
        referrerId: '0xstage1',
        kpi: 1_500_000_000n,
        referralCount: 150,
        uniqueWallets: 150,
        gasUsage: 1_500_000_000n, // 1.5B
        stage: 1,
        sqrtOnlyReward: '52492',
        baseReward: '39369',
        stageBonus: '25000', // Stage 1 gets bonus
        rewardAmount: '64369',
      },
      {
        referrerId: '0xstage2',
        kpi: 15_000_000_000n,
        referralCount: 3000,
        uniqueWallets: 3_000,
        gasUsage: 15_000_000_000n, // 15B
        stage: 2,
        sqrtOnlyReward: '165996',
        baseReward: '124497',
        stageBonus: '50000', // Stage 2 gets higher bonus
        rewardAmount: '174497',
      },
      {
        referrerId: '0xstage3',
        kpi: 60_000_000_000n,
        referralCount: 12_000,
        uniqueWallets: 12_000,
        gasUsage: 60_000_000_000n, // 60B
        stage: 3,
        sqrtOnlyReward: '331992',
        baseReward: '248994',
        stageBonus: '75000', // Stage 3 gets even higher bonus
        rewardAmount: '323994',
      },
      {
        referrerId: '0xstage4',
        kpi: 110_000_000_000n,
        referralCount: 1_100_000,
        uniqueWallets: 1_100_000,
        gasUsage: 110_000_000_000n, // 110B
        stage: 4,
        sqrtOnlyReward: '449519',
        baseReward: '337139',
        stageBonus: '100000', // Stage 4 gets highest bonus
        rewardAmount: '437139',
      },
    ])
  })

  it('should exclude referrers and redistribute rewards to non-excluded ones', () => {
    const kpiData: KpiRow[] = [
      // Excluded referrer
      ...createUsers('0xReferrer1', 50, '100'), // Mixed case, 50 wallets, low gas

      // Non-excluded referrer - stage 1 (>= 100 wallets && >= 500M gas)
      ...createUsers('0xreferrer2', 150, '5000000'), // 150 wallets, 750M total gas
    ]

    const result = calculateRewards({
      kpiData,
      rewards: new BigNumber('30000'),
      excludedReferrers: {
        '0xreferrer1': { referrerId: '0xreferrer1' }, // Lowercase in exclude list
      },
    })

    // referrer1 excluded, referrer2 reaches stage 1 and gets all rewards
    expect(result).toStrictEqual([
      {
        referrerId: '0xReferrer1',
        kpi: 5_000n, // 50 * 100
        referralCount: 50,
        uniqueWallets: 50,
        gasUsage: 5_000n,
        stage: 0,
        sqrtOnlyReward: '0', // Excluded from all calculations
        baseReward: '0', // Excluded
        stageBonus: '0', // Excluded
        rewardAmount: '0', // Excluded
      },
      {
        referrerId: '0xreferrer2',
        kpi: 750_000_000n, // 150 * 5M
        referralCount: 150,
        uniqueWallets: 150,
        gasUsage: 750_000_000n,
        stage: 1,
        sqrtOnlyReward: '30000', // Gets all rewards since it's the only qualified referrer
        baseReward: '22500', // 75% of pool (25% goes to stage bonus)
        stageBonus: '7500', // 25% of pool (stage 1 gets full stage bonus since only qualified referrer)
        rewardAmount: '30000', // Total: 22500 + 7500
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
        kpiData: createUsers('0xref1', 100, '10000000'), // 100 wallets, 1B total gas = stage 1
        rewards: new BigNumber('1000'),
        excludedReferrers: {},
      }),
    ).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 1_000_000_000n, // 100 * 10M
        referralCount: 100,
        uniqueWallets: 100,
        gasUsage: 1_000_000_000n,
        stage: 1,
        sqrtOnlyReward: '1000', // Gets all rewards since it's the only referrer
        baseReward: '750', // 75% of pool (25% goes to stage bonus)
        stageBonus: '250', // 25% of pool (gets full stage bonus since only referrer)
        rewardAmount: '1000', // Total: 750 + 250
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
        sqrtOnlyReward: '0', // Zero rewards = zero for all fields
        baseReward: '0',
        stageBonus: '0',
        rewardAmount: '0',
      },
    ])
  })
})
