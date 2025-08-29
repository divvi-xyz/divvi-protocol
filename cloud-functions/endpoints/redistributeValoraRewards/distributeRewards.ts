import {
  Address,
  createWalletClient,
  Hex,
  http,
  keccak256,
  toBytes,
} from 'viem'
import { Campaign } from '../../../src/campaigns'
import { privateKeyToAccount } from 'viem/accounts'
import { NETWORK_ID_TO_VIEM_CHAIN } from '../../../scripts/utils/networks'
import {
  getViemPublicClient,
  NETWORK_ID_TO_ALCHEMY_RPC_URL,
} from '../../../scripts/utils'
import { logger } from '../../log'

const IDEMPOTENT_REWARD_POOL_ABI = [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'user',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'idempotencyKey',
            type: 'bytes32',
          },
        ],
        internalType: 'struct IdempotentRewardPool.RewardData[]',
        name: 'rewards',
        type: 'tuple[]',
      },
      {
        internalType: 'uint256[]',
        name: 'rewardFunctionArgs',
        type: 'uint256[]',
      },
    ],
    name: 'addRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export async function distributeRewards({
  campaign,
  rewardAmounts,
  valoraDivviIdentifier,
  valoraRewards,
  valoraRewardsPoolOwnerPrivateKey,
  alchemyKey,
  rewardsFilename,
  dryRun,
}: {
  campaign: Campaign
  rewardAmounts: Array<{
    referrerId: Address
    rewardAmount: string
  }>
  valoraDivviIdentifier: string
  valoraRewards: bigint
  valoraRewardsPoolOwnerPrivateKey: Hex
  alchemyKey: string
  rewardsFilename: string
  dryRun: boolean
}) {
  if (!campaign.valoraRewardsPoolAddress) {
    throw new Error('Valora rewards pool address is not set')
  }

  const nonValoraReferrersWithRewards = rewardAmounts.filter(
    (reward) =>
      reward.referrerId.toLowerCase() !== valoraDivviIdentifier.toLowerCase() &&
      BigInt(reward.rewardAmount) > 0,
  )

  if (nonValoraReferrersWithRewards.length === 0) {
    throw new Error('No non-valora referrers with rewards')
  }

  const rewardAmount =
    valoraRewards / BigInt(nonValoraReferrersWithRewards.length)

  const account = privateKeyToAccount(valoraRewardsPoolOwnerPrivateKey)

  const walletClient = createWalletClient({
    account,
    chain: NETWORK_ID_TO_VIEM_CHAIN[campaign.networkId],
    transport: http(NETWORK_ID_TO_ALCHEMY_RPC_URL[campaign.networkId], {
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${alchemyKey}`,
        },
      },
    }),
  })

  const publicClient = getViemPublicClient(campaign.networkId)

  const { request } = await publicClient.simulateContract({
    account,
    address: campaign.valoraRewardsPoolAddress,
    abi: IDEMPOTENT_REWARD_POOL_ABI,
    functionName: 'addRewards',
    args: [
      nonValoraReferrersWithRewards.map((referrer) => ({
        user: referrer.referrerId,
        amount: rewardAmount,
        // use the rewards filename as the idempotency key to avoid adding double rewards
        idempotencyKey: keccak256(
          toBytes(`${rewardsFilename}-${referrer.referrerId}`),
        ),
      })),
      [],
    ],
  })

  logger.info(
    {
      campaign,
      request,
    },
    'Simulated distribute rewards transaction',
  )

  if (!dryRun) {
    const txHash = await walletClient.writeContract(request)

    logger.info(
      {
        campaign,
        txHash,
      },
      `Created distribute rewards transaction`,
    )

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })

    logger.info(
      {
        campaign,
        txHash,
        status: receipt.status,
      },
      `Distribute rewards transaction confirmed`,
    )

    if (receipt.status !== 'success') {
      throw new Error(`Distribute Transaction failed: ${receipt.status}`)
    }

    return txHash
  }

  return null
}
