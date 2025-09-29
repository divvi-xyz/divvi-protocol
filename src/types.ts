import { Address } from 'viem'
import { Protocol, NetworkId } from '../scripts/types'
import { ResultDirectory } from './resultDirectory'

type CampaignBase = {
  providerAddress: Address
  protocol: Protocol
  rewardsPoolAddress: Address
  networkId: NetworkId
  valoraRewardsPoolAddress: Address | null
}

type CalculateRewardsArgs = (args: {
  resultDirectory: ResultDirectory
  startTimestamp: string
  endTimestampExclusive: string
}) => Promise<void>

type RewardPeriodWithKpi = {
  startTimestamp: string
  endTimestampExclusive: string
  rewardAmount: string
  calculateRewards?: never
  calculateRewardSlices?: CalculateRewardsArgs
}

type RewardPeriodWithoutKpi = {
  startTimestamp: string
  endTimestampExclusive: string
  rewardAmount?: never
  calculateRewards?: CalculateRewardsArgs
  calculateRewardSlices?: CalculateRewardsArgs
}

export type Campaign = CampaignBase &
  (
    | {
        useRewardPoolWithKpi: true
        rewardsPeriods: RewardPeriodWithKpi[]
      }
    | {
        useRewardPoolWithKpi?: false
        rewardsPeriods: RewardPeriodWithoutKpi[]
      }
  )
