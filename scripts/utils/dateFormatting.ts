// Returns a folder name in the format of YYYY-MM-DDTHH-MM-SSZ_YYYY-MM-DDTHH-MM-SSZ
export function toPeriodFolderName({
  startTimestamp,
  endTimestamp,
}: {
  startTimestamp: Date
  endTimestamp: Date
}) {
  const formatDate = (date: Date): string =>
    date.toISOString().substring(0, 19).replace(/:/g, '-') + 'Z'

  const safeStart = formatDate(startTimestamp)
  const safeEnd = formatDate(endTimestamp)

  return `${safeStart}_${safeEnd}`
}
