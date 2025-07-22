import { Address } from 'viem'
import { Protocol } from '../../../scripts/types'
import { logger } from '../../log'

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
    const latestRewardsFile = rewardsFiles.sort().pop()!
    const response = await fetch(latestRewardsFile.url)
    if (response.ok) {
      const rewardAmounts = (await response.json()) as Array<{
        referrerId: Address
        rewardAmount: string
      }>

      return {
        filename: latestRewardsFile.name,
        rewardAmounts,
      }
    } else {
      logger.warn(
        {
          protocol,
          latestRewardsFile,
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
