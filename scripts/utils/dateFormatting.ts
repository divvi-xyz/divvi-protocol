// Returns a folder name in the format of YYYY-MM-DDTHH-MM-SSZ_YYYY-MM-DDTHH-MM-SSZ
export function toPeriodFolderName({
  startTimestamp,
  endTimestamp,
}: {
  startTimestamp: Date
  endTimestamp: Date
}) {
  return `${startTimestamp.toISOString()}_${endTimestamp.toISOString()}`
}
