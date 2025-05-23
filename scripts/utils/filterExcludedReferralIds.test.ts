import filterExcludedReferrerIds from './filterExcludedReferralIds'

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
