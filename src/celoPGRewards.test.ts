import { BigNumber } from 'bignumber.js'
import { calculateRewards, calculateStageV0 } from './celoPGRewards'
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
      previousStageData: [],
      stageFunction: calculateStageV0,
    })

    // Verify sqrt-based calculation, KPI aggregation, and all 5 stages
    expect(result).toStrictEqual([
      {
        referrerId: '0xstage0',
        kpi: 25_000_000_000n,
        referralCount: 50,
        uniqueWallets: 50,
        uniqueWalletsForStageCalculation: 50,
        gasUsage: 25_000_000_000n, // 25B
        gasUsageForStageCalculation: 25_000_000_000n,
        stage: 0,
        qualityUserScore: 0,
        sqrtOnlyReward: '0', // Stage 0 gets no rewards at all
        baseReward: '0', // Stage 0 gets no rewards at all
        stageBonus: '0', // Stage 0 gets no bonus
        qualityUserScoreBonus: '0', // Stage 0 gets no quality bonus
        rewardAmount: '0', // Stage 0 gets no rewards at all
        isExcluded: false,
      },
      {
        referrerId: '0xstage1',
        kpi: 1_500_000_000n,
        referralCount: 150,
        uniqueWallets: 150,
        uniqueWalletsForStageCalculation: 150,
        gasUsage: 1_500_000_000n, // 1.5B
        gasUsageForStageCalculation: 1_500_000_000n,
        stage: 1,
        qualityUserScore: 0,
        sqrtOnlyReward: '52492',
        baseReward: '28870', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '25000', // Stage 1 gets bonus
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '53870',
        isExcluded: false,
      },
      {
        referrerId: '0xstage2',
        kpi: 15_000_000_000n,
        referralCount: 3000,
        uniqueWallets: 3_000,
        uniqueWalletsForStageCalculation: 3_000,
        gasUsage: 15_000_000_000n, // 15B
        gasUsageForStageCalculation: 15_000_000_000n,
        stage: 2,
        qualityUserScore: 0,
        sqrtOnlyReward: '165996',
        baseReward: '91297', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '50000', // Stage 2 gets higher bonus
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '141297',
        isExcluded: false,
      },
      {
        referrerId: '0xstage3',
        kpi: 60_000_000_000n,
        referralCount: 12_000,
        uniqueWallets: 12_000,
        uniqueWalletsForStageCalculation: 12_000,
        gasUsage: 60_000_000_000n, // 60B
        gasUsageForStageCalculation: 60_000_000_000n,
        stage: 3,
        qualityUserScore: 0,
        sqrtOnlyReward: '331992',
        baseReward: '182595', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '75000', // Stage 3 gets even higher bonus
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '257595',
        isExcluded: false,
      },
      {
        referrerId: '0xstage4',
        kpi: 110_000_000_000n,
        referralCount: 1_100_000,
        uniqueWallets: 1_100_000,
        uniqueWalletsForStageCalculation: 1_100_000,
        gasUsage: 110_000_000_000n, // 110B
        gasUsageForStageCalculation: 110_000_000_000n,
        stage: 4,
        qualityUserScore: 0,
        sqrtOnlyReward: '449519',
        baseReward: '247235', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '100000', // Stage 4 gets highest bonus
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '347235',
        isExcluded: false,
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
      previousStageData: [],
      stageFunction: calculateStageV0,
    })

    // referrer1 excluded, referrer2 reaches stage 1 and gets all rewards
    expect(result).toStrictEqual([
      {
        referrerId: '0xReferrer1',
        kpi: 5_000n, // 50 * 100
        referralCount: 50,
        uniqueWallets: 50,
        uniqueWalletsForStageCalculation: 50,
        gasUsage: 5_000n,
        gasUsageForStageCalculation: 5_000n,
        stage: 0,
        qualityUserScore: 0,
        sqrtOnlyReward: '0', // Excluded from all calculations
        baseReward: '0', // Excluded
        stageBonus: '0', // Excluded
        qualityUserScoreBonus: '0', // Excluded
        rewardAmount: '0', // Excluded
        isExcluded: true,
      },
      {
        referrerId: '0xreferrer2',
        kpi: 750_000_000n, // 150 * 5M
        referralCount: 150,
        uniqueWallets: 150,
        uniqueWalletsForStageCalculation: 150,
        gasUsage: 750_000_000n,
        gasUsageForStageCalculation: 750_000_000n,
        stage: 1,
        qualityUserScore: 0,
        sqrtOnlyReward: '30000', // Gets all rewards since it's the only qualified referrer
        baseReward: '16500', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '7500', // 25% of pool (stage 1 gets full stage bonus since only qualified referrer)
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '24000', // Total: 16500 + 7500 + 0
        isExcluded: false,
      },
    ])
  })

  it('should handle empty KPI data', () => {
    expect(
      calculateRewards({
        kpiData: [],
        rewards: new BigNumber('1000'),
        excludedReferrers: {},
        previousStageData: [],
        stageFunction: calculateStageV0,
      }),
    ).toStrictEqual([])
  })

  it('should handle single referrer getting all rewards', () => {
    expect(
      calculateRewards({
        kpiData: createUsers('0xref1', 100, '10000000'), // 100 wallets, 1B total gas = stage 1
        rewards: new BigNumber('1000'),
        excludedReferrers: {},
        previousStageData: [],
        stageFunction: calculateStageV0,
      }),
    ).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 1_000_000_000n, // 100 * 10M
        referralCount: 100,
        uniqueWallets: 100,
        uniqueWalletsForStageCalculation: 100,
        gasUsage: 1_000_000_000n,
        gasUsageForStageCalculation: 1_000_000_000n,
        stage: 1,
        qualityUserScore: 0,
        sqrtOnlyReward: '1000', // Gets all rewards since it's the only referrer
        baseReward: '550', // 55% of pool (with 25% stage + 20% quality)
        stageBonus: '250', // 25% of pool (gets full stage bonus since only referrer)
        qualityUserScoreBonus: '0', // No quality score provided
        rewardAmount: '800', // Total: 550 + 250 + 0
        isExcluded: false,
      },
    ])
  })

  it('should handle zero rewards', () => {
    expect(
      calculateRewards({
        kpiData: [{ referrerId: '0xref1', userAddress: '0xuser1', kpi: '100' }],
        rewards: new BigNumber('0'),
        excludedReferrers: {},
        previousStageData: [],
        stageFunction: calculateStageV0,
      }),
    ).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 100n,
        referralCount: 1,
        uniqueWallets: 1,
        uniqueWalletsForStageCalculation: 1,
        gasUsage: 100n,
        gasUsageForStageCalculation: 100n,
        stage: 0,
        qualityUserScore: 0,
        sqrtOnlyReward: '0', // Zero rewards = zero for all fields
        baseReward: '0',
        stageBonus: '0',
        qualityUserScoreBonus: '0',
        rewardAmount: '0',
        isExcluded: false,
      },
    ])
  })

  it('should distribute quality user score bonus proportionally', () => {
    const kpiData: KpiRow[] = [
      // Two stage 1 referrers with different quality scores
      ...createUsers('0xref1', 100, '10000000'), // 100 wallets, 1B total gas = stage 1
      ...createUsers('0xref2', 150, '10000000'), // 150 wallets, 1.5B total gas = stage 1
    ]

    const qualityUserScores = {
      '0xref1': 100, // Quality score of 100
      '0xref2': 200, // Quality score of 200 (2x of ref1)
    }

    const result = calculateRewards({
      kpiData,
      rewards: new BigNumber('30000'),
      excludedReferrers: {},
      previousStageData: [],
      stageFunction: calculateStageV0,
      qualityUserScores,
    })

    // ref1 has quality score 100, ref2 has quality score 200
    // Quality bonus pool = 6000 (20% of 30000)
    // ref1 gets 1999 (100/300 * 6000, rounded down), ref2 gets 4000 (200/300 * 6000)
    expect(result).toStrictEqual([
      {
        referrerId: '0xref1',
        kpi: 1_000_000_000n,
        referralCount: 100,
        uniqueWallets: 100,
        uniqueWalletsForStageCalculation: 100,
        gasUsage: 1_000_000_000n,
        gasUsageForStageCalculation: 1_000_000_000n,
        stage: 1,
        qualityUserScore: 100,
        sqrtOnlyReward: '13484', // sqrt proportion of total
        baseReward: '7416', // 55% of pool distributed by sqrt
        stageBonus: '3750', // 25% of pool, split equally since both stage 1
        qualityUserScoreBonus: '1999', // 20% of pool, 100/300 proportion (rounded down)
        rewardAmount: '13166',
        isExcluded: false,
      },
      {
        referrerId: '0xref2',
        kpi: 1_500_000_000n,
        referralCount: 150,
        uniqueWallets: 150,
        uniqueWalletsForStageCalculation: 150,
        gasUsage: 1_500_000_000n,
        gasUsageForStageCalculation: 1_500_000_000n,
        stage: 1,
        qualityUserScore: 200,
        sqrtOnlyReward: '16515', // sqrt proportion of total
        baseReward: '9083', // 55% of pool distributed by sqrt
        stageBonus: '3750', // 25% of pool, split equally since both stage 1
        qualityUserScoreBonus: '4000', // 20% of pool, 200/300 proportion
        rewardAmount: '16833',
        isExcluded: false,
      },
    ])
  })

  it('should not give quality bonus to stage 0 referrers', () => {
    const kpiData: KpiRow[] = [
      ...createUsers('0xstage0', 50, '100'), // Stage 0 referrer
      ...createUsers('0xstage1', 100, '10000000'), // Stage 1 referrer
    ]

    const qualityUserScores = {
      '0xstage0': 100, // Has quality score but stage 0
      '0xstage1': 200, // Stage 1 with quality score
    }

    const result = calculateRewards({
      kpiData,
      rewards: new BigNumber('10000'),
      excludedReferrers: {},
      previousStageData: [],
      stageFunction: calculateStageV0,
      qualityUserScores,
    })

    // Stage 0 should get no rewards including quality bonus
    // Stage 1 should get all quality bonus
    expect(result[0].stage).toBe(0)
    expect(result[0].qualityUserScoreBonus).toBe('0')
    expect(result[0].rewardAmount).toBe('0')
    expect(result[1].stage).toBe(1)
    expect(result[1].qualityUserScoreBonus).toBe('2000') // Gets full 20% = 2000
  })
})
