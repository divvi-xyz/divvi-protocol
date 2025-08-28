import {
  Address,
  encodeFunctionData,
  getAddress,
  keccak256,
  toBytes,
} from 'viem'
import { rewardPoolAbi } from '../../abis/RewardPool'
import { NetworkId } from '../types'
import Safe from '@safe-global/protocol-kit'
import { OperationType } from '@safe-global/types-kit'
import { NETWORK_ID_TO_ALCHEMY_RPC_URL } from '../utils'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'
import { getSafeOwners } from './getSafeOwners'

/**
 * Propose a Safe transaction to add rewards to the Valora redistribution reward pool.
 * @param safeAddress The Safe (Valora Medium Security Safe) address
 * @param rewardPoolAddress The RewardPool contract address (Valora redistribution reward pool)
 * @param rewardAmounts The rewards distributed for the given campaign
 * @param valoraRewards The amount of valora rewards to add (as string or bigint)
 * @param excludeReferrerIds The referrer ids to exclude from the rewards
 * @param rewardsFilename The filename of the rewards file (used as idempotency key)
 * @param networkId The NetworkId for the Safe Transaction Service
 * @param alchemyKey The Alchemy API key
 * @param dryRun Whether to dry run the transaction
 */
export async function proposeSafeAddRewardsTx({
  safeAddress: rawSafeAddress,
  rewardPoolAddress: rawRewardPoolAddress,
  rewardAmounts,
  valoraRewards,
  excludeReferrerIds,
  rewardsFilename,
  networkId,
  alchemyKey,
  dryRun,
}: {
  safeAddress: Address
  rewardPoolAddress: string
  rewardAmounts: Array<{
    referrerId: Address
    rewardAmount: string
  }>
  valoraRewards: bigint
  excludeReferrerIds: Address[]
  rewardsFilename: string
  networkId: NetworkId
  alchemyKey: string
  dryRun: boolean
}) {
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]
  const alchemyRpcUrl = NETWORK_ID_TO_ALCHEMY_RPC_URL[networkId]
  const safeAddress = getAddress(rawSafeAddress)
  const rewardPoolAddress = getAddress(rawRewardPoolAddress)

  if (!safeConfig) {
    throw new Error(`No Safe config found for networkId: ${networkId}`)
  }

  if (!alchemyRpcUrl) {
    throw new Error(`No Alchemy RPC URL found for networkId: ${networkId}`)
  }

  const protocolKit = await Safe.init({
    provider: `${alchemyRpcUrl}${alchemyKey}`,
    safeAddress,
  })

  const nonValoraReferrersWithRewards = rewardAmounts.filter(
    (reward) =>
      !excludeReferrerIds.includes(reward.referrerId) &&
      BigInt(reward.rewardAmount) > 0,
  )

  if (nonValoraReferrersWithRewards.length === 0) {
    throw new Error('No non-valora referrers with rewards')
  }

  const rewardAmount =
    valoraRewards / BigInt(nonValoraReferrersWithRewards.length)

  // 1. Encode calldata for claimReward or deposit
  const data = encodeFunctionData({
    abi: rewardPoolAbi,
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

  const safeTransactionData = {
    to: rewardPoolAddress,
    value: '0',
    data,
    operation: OperationType.Call,
  }
  // 2. Prepare Safe transaction data
  const safeTx = await protocolKit.createTransaction({
    transactions: [safeTransactionData],
  })

  const safeTxHash = await protocolKit.getTransactionHash(safeTx)

  console.info(
    {
      safeTxHash,
      safeAddress,
      networkId,
      safeTx,
      rewardPoolAddress,
      rewardAmounts,
      valoraRewards,
    },
    `Created Safe Add Rewards Tx`,
  )

  // 3. Propose transaction to Safe Transaction Service
  if (!dryRun) {
    const response = await fetch(
      `${safeConfig.apiUrl}/v2/safes/${safeAddress}/multisig-transactions/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...safeTransactionData,
          baseGas: safeTx.data.baseGas,
          gasPrice: safeTx.data.gasPrice,
          nonce: safeTx.data.nonce,
          safeTxGas: safeTx.data.safeTxGas,
          contractTransactionHash: safeTxHash,
          sender: (await getSafeOwners(safeAddress, networkId))[0], // this can be any signer on the safe, so pick the first one
        }),
      },
    )

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}: ${await response.text()}`,
      )
    }
    const safeTxUrl = `https://app.safe.global/transactions/tx?safe=${safeConfig.shortName}:${safeAddress}&id=${safeTxHash}`

    return { safeTxUrl, safeTxHash }
  }
  return { safeTxUrl: null, safeTxHash: null }
}
