import { Address } from 'viem'
import { Protocol } from '../types'
import { toPeriodFolderName } from '../utils/dateFormatting'

export async function getRewards({
  gcsFiles,
  protocol,
  startTimestamp,
  endTimestampExclusive,
}: {
  gcsFiles: { name: string; url: string }[]
  protocol: Protocol
  startTimestamp: string
  endTimestampExclusive: string
}) {
  const protocolName = protocol
  const rewardsFiles = gcsFiles.filter((file) =>
    file.name.endsWith(
      `kpi/${protocolName}/${toPeriodFolderName({ startTimestamp: new Date(startTimestamp), endTimestampExclusive: new Date(endTimestampExclusive) })}/rewards.json`,
    ),
  )
  if (rewardsFiles.length === 1) {
    const rewardsFile = rewardsFiles[0]

    const response = await fetch(rewardsFile.url)
    if (response.ok) {
      const rewardAmounts = (await response.json()) as Array<{
        referrerId: Address
        rewardAmount: string
      }>

      return {
        filename: rewardsFile.name,
        rewardAmounts,
      }
    }
  } else if (rewardsFiles.length > 1) {
    throw new Error(
      `Multiple rewards files found for ${protocol} for period ${startTimestamp} to ${endTimestampExclusive}`,
    )
  }
  throw new Error(
    `No rewards file found for ${protocol} for period ${startTimestamp} to ${endTimestampExclusive}`,
  )
}
