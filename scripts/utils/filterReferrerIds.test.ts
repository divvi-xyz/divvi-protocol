import { KpiRow } from '../../src/resultDirectory'
import {
  filterExcludedReferrerIds,
  filterIncludedReferrerIds,
} from './filterReferrerIds'

describe('filterExcludedReferrerIds', () => {
  const data = [
    { referrerId: '0x123', value: 1 },
    { referrerId: '0x456', value: 2 },
    { referrerId: '0x789', value: 3 },
  ]

  it('returns all data if no excludeList is passed in', () => {
    const result = filterExcludedReferrerIds({
      data,
      excludeList: [],
      failOnExclude: false,
    })
    expect(result).toEqual(data)
  })

  it('returns all data if referrerId is not in excludeList', () => {
    const result = filterExcludedReferrerIds({
      data,
      excludeList: ['0xabc', '0xdef'],
      failOnExclude: false,
    })
    expect(result).toEqual(data)
  })

  it('filters out data if referrerId is in excludeList', () => {
    const result = filterExcludedReferrerIds({
      data,
      excludeList: ['0x456', '0xabc'],
      failOnExclude: false,
    })
    expect(result).toEqual([
      { referrerId: '0x123', value: 1 },
      { referrerId: '0x789', value: 3 },
    ])
  })

  it('throws if referrerId is in excludeList and failOnExclude is true', () => {
    expect(() =>
      filterExcludedReferrerIds({
        data,
        excludeList: ['0x456', '0xabc'],
        failOnExclude: true,
      }),
    ).toThrow(/is in the exclude list/)
  })

  it('logs a warning if referrerId is in excludeList and failOnExclude is false', () => {
    const warnSpy = jest.spyOn(console, 'warn')
    filterExcludedReferrerIds({
      data,
      excludeList: ['0x456', '0xabc'],
      failOnExclude: false,
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('is in the exclude list'),
    )
    warnSpy.mockRestore()
  })
})

describe('filterIncludedReferrerIds', () => {
  const mockKpiData: KpiRow[] = [
    {
      referrerId: '0x1234567890123456789012345678901234567890',
      userAddress: '0xuser1',
      kpi: '100',
    },
    {
      referrerId: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      userAddress: '0xuser2',
      kpi: '200',
    },
    {
      referrerId: '0x9876543210987654321098765432109876543210',
      userAddress: '0xuser3',
      kpi: '300',
    },
  ]

  it('should return all data when no allowList is provided', () => {
    const result = filterIncludedReferrerIds({
      data: mockKpiData,
    })

    expect(result).toEqual(mockKpiData)
  })

  it('should return empty array when allowList is empty', () => {
    const result = filterIncludedReferrerIds({
      data: mockKpiData,
      allowList: [],
    })

    expect(result).toEqual([])
  })

  it('should return empty array when no referrerIds match the allowList', () => {
    const result = filterIncludedReferrerIds({
      data: mockKpiData,
      allowList: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ],
    })

    expect(result).toEqual([])
  })

  it('should return empty array when data array is empty', () => {
    const result = filterIncludedReferrerIds({
      data: [],
      allowList: ['0x1234567890123456789012345678901234567890'],
    })

    expect(result).toEqual([])
  })

  it('should case insensitive filter data to only include referrerIds in the allowList', () => {
    const mixedCaseData: KpiRow[] = [
      {
        referrerId: '0xAbCdEf1234567890abcdef1234567890abcdef12',
        userAddress: '0xuser1',
        kpi: '100',
      },
      {
        referrerId: '0x1234567890abcdef1234567890abcdef12345678',
        userAddress: '0xuser2',
        kpi: '200',
      },
    ]

    const allowList = [
      '0xabcdef1234567890abcdef1234567890abcdef12',
      '0x1234567890ABCDEF1234567890ABCDEF12345678',
    ]

    const result = filterIncludedReferrerIds({
      data: mixedCaseData,
      allowList,
    })

    expect(result).toEqual(mixedCaseData)
  })
})
