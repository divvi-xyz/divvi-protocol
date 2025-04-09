import { Address } from 'viem'
import { NetworkId } from '../../../types'
import { getViemPublicClient } from '../../../utils'
import { aTokenAbi } from '../../../abis/aave/aToken'

export async function getScaledBalances(
  networkId: NetworkId,
  userAddress: Address,
  aTokenAddresses: Address[],
  blockNumber: number,
) {
  const publicClient = getViemPublicClient(networkId)

  // Check if the contract exists at the given block number
  const aTokenContractsByteCode = await Promise.all(
    aTokenAddresses.map((tokenAddress) =>
      publicClient.getCode({
        address: tokenAddress,
        blockNumber: BigInt(blockNumber),
      }),
    ),
  )

  const scaledBalances = await Promise.all(
    aTokenAddresses.map((tokenAddress, index) =>
      aTokenContractsByteCode[index]
        ? publicClient.readContract({
            address: tokenAddress,
            abi: aTokenAbi,
            functionName: 'scaledBalanceOf',
            args: [userAddress],
            blockNumber: BigInt(blockNumber),
          })
        : 0n,
    ),
  )

  const result = new Map(
    aTokenAddresses.map((address, index) => [address, scaledBalances[index]]),
  )

  return result
}
