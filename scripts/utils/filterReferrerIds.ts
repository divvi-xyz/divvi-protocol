export function filterExcludedReferrerIds<T extends { referrerId: string }>({
  data,
  excludeList,
}: {
  data: T[]
  excludeList: { referrerId: string }[]
}) {
  const excludeSet = new Set(excludeList.map(({ referrerId }) => referrerId))
  const excludedRows = new Map<string, number>()

  const filteredData = data.filter(({ referrerId }) => {
    const isExcluded = excludeSet.has(referrerId.toLowerCase())

    if (isExcluded) {
      excludedRows.set(referrerId, (excludedRows.get(referrerId) ?? 0) + 1)
    }

    return !isExcluded
  })

  for (const [referrerId, count] of excludedRows.entries()) {
    console.warn(
      `ReferrerId ${referrerId} with ${count} referred users is in the exclude list, their campaign kpi's will be ignored.`,
    )
  }

  return filteredData
}

export function filterIncludedReferrerIds<T extends { referrerId: string }>({
  data,
  allowList,
}: {
  data: T[]
  allowList?: string[]
}) {
  // If no allowList is provided, return all data
  if (!allowList) {
    return data
  }

  const allowSet = new Set(allowList.map((id) => id.toLowerCase()))

  const filteredData = data.filter(({ referrerId }) => {
    return allowSet.has(referrerId.toLowerCase())
  })

  return filteredData
}
