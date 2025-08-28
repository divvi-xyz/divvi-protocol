import { Address } from 'viem'
import { Protocol } from '../../scripts/types'

export async function getLatestRewards({
  gcsFiles,
  protocol,
}: {
  gcsFiles: { name: string; url: string }[]
  protocol: Protocol
}) {
  const protocolName = protocol
  const rewardsFiles = gcsFiles.filter(
    (file) =>
      file.name.includes(`kpi/${protocolName}/`) &&
      file.name.endsWith('/rewards.json'),
  )

  if (rewardsFiles.length > 0) {
    // Parse date ranges from filenames and find the most recent where end date is <= current date
    const now = new Date()
    const currentDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ) // Start of current day

    const validRewardsFiles = rewardsFiles
      .map((file) => {
        // Extract date range from filename like "2025-07-28T00:00:00.000Z_2025-08-30T00:00:00.000Z/rewards.json"
        const dateRangeMatch = file.name.match(
          /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\/rewards\.json$/,
        )

        if (!dateRangeMatch) {
          console.warn(`Could not parse date range from filename: ${file.name}`)
          return null
        }

        const startDate = new Date(dateRangeMatch[1])
        const endDate = new Date(dateRangeMatch[2])

        return {
          file,
          startDate,
          endDate,
          filename: file.name,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => item.endDate <= currentDate) // Only include files where end date is <= current date

    if (validRewardsFiles.length === 0) {
      throw new Error(
        `No valid rewards files found for ${protocol} where end date is at or before current date`,
      )
    }

    // Sort by end date descending and take the most recent
    const latestRewardsFile = validRewardsFiles.sort(
      (a, b) => b.endDate.getTime() - a.endDate.getTime(),
    )[0]

    const response = await fetch(latestRewardsFile.file.url)
    if (response.ok) {
      const rewardAmounts = (await response.json()) as Array<{
        referrerId: Address
        rewardAmount: string
      }>

      return {
        filename: latestRewardsFile.filename,
        rewardAmounts,
      }
    } else {
      console.warn(
        {
          protocol,
          latestRewardsFile: latestRewardsFile.filename,
          status: response.status,
          text: await response.text(),
        },
        'Failed to fetch rewards file',
      )
      throw new Error(`Failed to fetch rewards file`)
    }
  }

  throw new Error(`No rewards file found for ${protocol}`)
}
