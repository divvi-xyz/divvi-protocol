import { Address, encodeFunctionData, getAddress } from 'viem'
import { rewardPoolAbi } from '../../../abis/RewardPool'
import { NetworkId } from '../../../scripts/types'
import Safe from '@safe-global/protocol-kit'
import { OperationType } from '@safe-global/types-kit'
import { NETWORK_ID_TO_ALCHEMY_RPC_URL } from '../../../scripts/utils'
import { logger } from '../../log'

const NETWORK_ID_TO_SAFE_CONFIG: Partial<
  Record<
    NetworkId,
    {
      apiUrl: string
      shortName: string
    }
  >
> = {
  [NetworkId['celo-mainnet']]: {
    apiUrl: 'https://safe-transaction-celo.safe.global/api',
    shortName: 'celo',
  },
  [NetworkId['ethereum-mainnet']]: {
    apiUrl: 'https://safe-transaction-mainnet.safe.global/api',
    shortName: 'eth',
  },
  [NetworkId['arbitrum-one']]: {
    apiUrl: 'https://safe-transaction-arbitrum.safe.global/api',
    shortName: 'arb1',
  },
  [NetworkId['op-mainnet']]: {
    apiUrl: 'https://safe-transaction-optimism.safe.global/api',
    shortName: 'oeth',
  },
  [NetworkId['base-mainnet']]: {
    apiUrl: 'https://safe-transaction-base.safe.global/api',
    shortName: 'base',
  },
  [NetworkId['polygon-pos-mainnet']]: {
    apiUrl: 'https://safe-transaction-polygon.safe.global/api',
    shortName: 'pol',
  },
}

/**
 * Propose a Safe transaction to claim rewards from a RewardPool contract.
 * @param safeAddress The Safe (VALORA_DIVVI_IDENTIFIER) address
 * @param rewardPoolAddress The RewardPool contract address
 * @param pendingRewards The amount to claim (as string or bigint)
 * @param networkId The NetworkId for the Safe Transaction Service
 */
export async function proposeSafeClaimRewardTx({
  safeAddress: rawSafeAddress,
  rewardPoolAddress,
  pendingRewards,
  networkId,
  alchemyKey,
  dryRun,
}: {
  safeAddress: Address
  rewardPoolAddress: string
  pendingRewards: bigint
  networkId: NetworkId
  alchemyKey: string
  dryRun: boolean
}) {
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]
  const alchemyRpcUrl = NETWORK_ID_TO_ALCHEMY_RPC_URL[networkId]
  const safeAddress = getAddress(rawSafeAddress)

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

  // 1. Encode calldata for claimReward
  const data = encodeFunctionData({
    abi: rewardPoolAbi,
    functionName: 'claimReward',
    args: [pendingRewards],
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

  logger.info(
    {
      safeTxHash,
      safeAddress,
      networkId,
      safeTx,
      rewardPoolAddress,
      pendingRewards,
    },
    'Created Safe Claim Reward Tx',
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

    logger.info(
      {
        response,
        safeTxHash,
        safeAddress,
        networkId,
        rewardPoolAddress,
        pendingRewards,
        safeTxUrl,
      },
      'Proposed Safe Claim Reward Tx',
    )
    return safeTxUrl
  }
  return null
}

async function getSafeOwners(
  address: Address,
  networkId: NetworkId,
): Promise<Address[]> {
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]
  if (!safeConfig) {
    throw new Error(`No Safe Info found for networkId: ${networkId}`)
  }
  const response = await fetch(`${safeConfig.apiUrl}/v1/safes/${address}/`)

  if (!response.ok) {
    throw new Error(
      `Failed to get Safe info: ${response.statusText}, ${await response.text()}`,
    )
  }

  const safeDetails = (await response.json()) as { owners: Address[] }
  return safeDetails.owners
}
