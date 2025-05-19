// Returns a folder name in the format of YYYY-MM-DDTHH-MM-SSZ_YYYY-MM-DDTHH-MM-SSZ
export function toPeriodFolderName({
  startTimestamp,
  endTimestampExclusive,
}: {
  startTimestamp: Date
  endTimestampExclusive: Date
}) {
  return `${startTimestamp.toISOString()}_${endTimestampExclusive.toISOString()}`
}
