import { NetworkId } from '../types'
import { getViemPublicClient, NETWORK_ID_TO_ALCHEMY_RPC_URL } from '../utils'
import { rewardPoolAbi } from '../../abis/RewardPool'
import ERC20 from '../abis/ERC20'
import { encodeFunctionData, getAddress } from 'viem'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'
import Safe from '@safe-global/protocol-kit'
import { OperationType } from '@safe-global/types-kit'
import { getSafeOwners } from './getSafeOwners'

export async function checkAndProposeTokenApproval({
  safeAddress,
  rewardPoolAddress,
  rewardAmount,
  networkId,
  alchemyKey,
  dryRun,
}: {
  safeAddress: string
  rewardPoolAddress: string
  rewardAmount: bigint
  networkId: NetworkId
  alchemyKey: string
  dryRun: boolean
}) {
  const client = getViemPublicClient(networkId)

  // Get the pool token address
  const poolTokenAddress = await client.readContract({
    address: rewardPoolAddress as `0x${string}`,
    abi: rewardPoolAbi,
    functionName: 'poolToken',
  })

  // Check if it's a native token (no approval needed)
  const isNativeToken = await client.readContract({
    address: rewardPoolAddress as `0x${string}`,
    abi: rewardPoolAbi,
    functionName: 'isNativeToken',
  })

  if (isNativeToken) {
    console.log('Pool uses native token, no approval needed')
    return { safeTxUrl: null, safeTxHash: null }
  }

  // Check current allowance
  const currentAllowance = await client.readContract({
    address: poolTokenAddress as `0x${string}`,
    abi: ERC20,
    functionName: 'allowance',
    args: [safeAddress as `0x${string}`, rewardPoolAddress as `0x${string}`],
  })

  console.log(`Current allowance: ${currentAllowance.toString()}`)
  console.log(`Required amount: ${rewardAmount.toString()}`)

  // If allowance is sufficient, no approval needed
  if (currentAllowance >= rewardAmount) {
    console.log('Sufficient allowance already exists, no approval needed')
    return { safeTxUrl: null, safeTxHash: null }
  }

  // Create approval transaction using Safe
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]
  const alchemyRpcUrl = NETWORK_ID_TO_ALCHEMY_RPC_URL[networkId]

  if (!safeConfig) {
    throw new Error(`No Safe config found for networkId: ${networkId}`)
  }

  if (!alchemyRpcUrl) {
    throw new Error(`No Alchemy RPC URL found for networkId: ${networkId}`)
  }

  const protocolKit = await Safe.init({
    provider: `${alchemyRpcUrl}${alchemyKey}`,
    safeAddress: getAddress(safeAddress),
  })

  // Encode calldata for approve
  const data = encodeFunctionData({
    abi: ERC20,
    functionName: 'approve',
    args: [getAddress(rewardPoolAddress), rewardAmount],
  })

  const safeTransactionData = {
    to: getAddress(poolTokenAddress as string),
    value: '0',
    data,
    operation: OperationType.Call,
  }

  // Prepare Safe transaction data
  const safeTx = await protocolKit.createTransaction({
    transactions: [safeTransactionData],
  })

  const safeTxHash = await protocolKit.getTransactionHash(safeTx)

  // Propose transaction to Safe Transaction Service
  if (!dryRun) {
    const response = await fetch(
      `${safeConfig.apiUrl}/v2/safes/${getAddress(safeAddress)}/multisig-transactions/`,
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
          sender: (await getSafeOwners(getAddress(safeAddress), networkId))[0], // this can be any signer on the safe, so pick the first one
        }),
      },
    )

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}: ${await response.text()}`,
      )
    }

    const safeTxUrl = `https://app.safe.global/transactions/tx?safe=${safeConfig.shortName}:${getAddress(safeAddress)}&id=${safeTxHash}`

    return { safeTxUrl, safeTxHash }
  }

  return { safeTxUrl: null, safeTxHash: null }
}
