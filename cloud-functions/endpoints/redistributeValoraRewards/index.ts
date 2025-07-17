import { z } from 'zod'
import { loadSharedConfig } from '../../config/loadSharedConfig'
import { createEndpoint } from '../../services/createEndpoint'
import { hexSchema } from '../../types'
import { GraphQLClient, gql } from 'graphql-request'
import { campaigns, Campaign } from '../../../src/campaigns'
import { Address, isAddressEqual } from 'viem'
import { getViemPublicClient } from '../../../scripts/utils'
import { rewardPoolAbi } from '../../../abis/RewardPool'
import { proposeSafeClaimRewardTx } from './proposeSafeClaimRewardTx'
import { logger } from '../../log'

const requestSchema = z.object({
  method: z.custom((arg) => arg === 'POST', 'only POST requests are allowed'),
  body: z.object({
    // Nothing for now
  }),
})

const loadConfig = () =>
  loadSharedConfig({
    VALORA_DIVVI_IDENTIFIER: hexSchema,
    VALORA_REWARDS_POOL_OWNER_PRIVATE_KEY: hexSchema,
    DIVVI_INDEXER_URL: z.string().url(),
    ALCHEMY_KEY: z.string(),
  })

async function fetchRewardsProviders({
  indexerUrl,
  rewardsConsumer,
}: {
  indexerUrl: string
  rewardsConsumer: Address
}): Promise<Address[]> {
  const client = new GraphQLClient(indexerUrl)
  const query = gql`
    query RewardsAgreement($rewardsConsumer: String!) {
      DivviRegistry_RewardsAgreementRegistered(
        where: { rewardsConsumer: { _ilike: $rewardsConsumer } }
      ) {
        rewardsConsumer
        rewardsProvider
      }
    }
  `
  type RewardsAgreementResponse = {
    DivviRegistry_RewardsAgreementRegistered: Array<{
      rewardsConsumer: string
      rewardsProvider: string
    }>
  }
  const data = await client.request<RewardsAgreementResponse>(query, {
    rewardsConsumer,
  })
  return (data.DivviRegistry_RewardsAgreementRegistered || []).map(
    (item) => item.rewardsProvider as Address,
  )
}

async function processCampaignRewards({
  campaign,
  config,
  rewardsProvider,
}: {
  campaign: Campaign | undefined
  config: ReturnType<typeof loadConfig>
  rewardsProvider: Address
}): Promise<{
  rewardsProvider: Address
  rewardPoolAddress: string | null
  pendingRewards: string | null
  claimRewardsSafeTxUrl: string | null
  error?: string
}> {
  let pendingRewards: string | null = null
  let claimRewardsSafeTxUrl: string | null = null
  let error: string | undefined = undefined
  const rewardPoolAddress = campaign ? campaign.rewardsPoolAddress : null

  if (campaign && campaign.rewardsPoolAddress) {
    try {
      const networkId = campaign.networkId
      const client = getViemPublicClient(networkId)

      const rewards = await client.readContract({
        address: campaign.rewardsPoolAddress,
        abi: rewardPoolAbi,
        functionName: 'pendingRewards',
        args: [config.VALORA_DIVVI_IDENTIFIER],
      })
      pendingRewards = rewards.toString()

      logger.info(
        {
          rewardsProvider,
          rewardPoolAddress,
          pendingRewards,
        },
        `Fetched pending rewards for ${rewardsProvider}`,
      )

      // Propose Safe tx to claim rewards if pendingRewards > 0
      if (rewards > BigInt(0)) {
        try {
          claimRewardsSafeTxUrl = await proposeSafeClaimRewardTx({
            safeAddress: config.VALORA_DIVVI_IDENTIFIER,
            rewardPoolAddress: campaign.rewardsPoolAddress,
            pendingRewards: rewards,
            networkId: campaign.networkId,
            alchemyKey: config.ALCHEMY_KEY,
          })

          logger.info(
            {
              rewardsProvider,
              rewardPoolAddress,
              claimRewardsSafeTxUrl,
            },
            `Proposed Safe transaction to claim rewards for ${rewardsProvider}`,
          )
        } catch (safeError) {
          logger.warn(
            {
              err: safeError,
              rewardsProvider,
              rewardPoolAddress,
            },
            `Failed to propose Safe transaction for ${rewardsProvider}`,
          )
          error = `Failed to propose Safe transaction for ${rewardsProvider}: ${safeError instanceof Error ? safeError.message : String(safeError)}`
          claimRewardsSafeTxUrl = null
        }
      }
    } catch (processError) {
      logger.warn(
        {
          err: processError,
          rewardsProvider,
          rewardPoolAddress,
        },
        `Failed to process rewards for ${rewardsProvider}`,
      )
      error = `Failed to process rewards for ${rewardsProvider}: ${processError instanceof Error ? processError.message : String(processError)}`
      pendingRewards = null
      claimRewardsSafeTxUrl = null
    }
  }

  return {
    rewardsProvider,
    rewardPoolAddress,
    pendingRewards,
    claimRewardsSafeTxUrl,
    ...(error && { error }),
  }
}

export const redistributeValoraRewards = createEndpoint(
  'redistributeValoraRewards',
  {
    loadConfig,
    requestSchema,
    handler: async ({ res, config, parsedRequest: _parsedRequest }) => {
      const providers = await fetchRewardsProviders({
        indexerUrl: config.DIVVI_INDEXER_URL,
        rewardsConsumer: config.VALORA_DIVVI_IDENTIFIER,
      })
      const result = await Promise.all(
        providers.map(async (rewardsProvider) => {
          const campaign = campaigns.find((c) =>
            isAddressEqual(c.providerAddress, rewardsProvider),
          )
          return processCampaignRewards({
            campaign,
            config,
            rewardsProvider,
          })
        }),
      )
      res.status(200).json({ rewards: result })
    },
  },
)
