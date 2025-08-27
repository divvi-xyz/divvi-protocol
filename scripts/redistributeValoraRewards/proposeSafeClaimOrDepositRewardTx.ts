import { Address, encodeFunctionData, getAddress } from 'viem'
import { rewardPoolAbi } from '../../abis/RewardPool'
import { NetworkId } from '../types'
import Safe from '@safe-global/protocol-kit'
import { OperationType } from '@safe-global/types-kit'
import { NETWORK_ID_TO_ALCHEMY_RPC_URL } from '../utils'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'
import { getSafeOwners } from './getSafeOwners'

/**
 * Propose a Safe transaction to claim or deposit rewards from a RewardPool contract.
 * @param safeAddress The Safe (VALORA_DIVVI_IDENTIFIER) address
 * @param rewardPoolAddress The RewardPool contract address
 * @param rewardAmount The amount to claim (as string or bigint)
 * @param isClaiming Whether to claim or deposit rewards
 * @param networkId The NetworkId for the Safe Transaction Service
 */
export async function proposeSafeClaimOrDepositRewardTx({
  safeAddress: rawSafeAddress,
  rewardPoolAddress: rawRewardPoolAddress,
  rewardAmount,
  isClaiming,
  networkId,
  alchemyKey,
  dryRun,
}: {
  safeAddress: Address
  rewardPoolAddress: string
  rewardAmount: bigint
  isClaiming: boolean
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

  // 1. Encode calldata for claimReward or deposit
  const data = encodeFunctionData({
    abi: rewardPoolAbi,
    functionName: isClaiming ? 'claimReward' : 'deposit',
    args: [rewardAmount],
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
      rewardAmount,
    },
    `Created Safe ${isClaiming ? 'Claim Reward' : 'Deposit'} Tx`,
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

    console.info(
      {
        response,
        safeTxHash,
        safeAddress,
        networkId,
        rewardPoolAddress,
        rewardAmount,
        safeTxUrl,
      },
      `Proposed Safe ${isClaiming ? 'Claim Reward' : 'Deposit'} Tx`,
    )
    return safeTxUrl
  }
  return null
}
