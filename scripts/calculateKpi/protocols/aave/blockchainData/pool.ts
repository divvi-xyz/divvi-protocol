import memoize from '@github/memoize'
import { Address, erc20Abi } from 'viem'
import { NetworkId } from '../../../../types'
import { getViemPublicClient } from '../../../../utils'
import { poolAbi } from '../../../../abis/aave/pool'
import { ReserveData } from '../types'

// Fetches the reserve data for all reserve tokens in an Aave pool
export const getReserveData = memoize(_getReserveData, {
  hash: (...params: Parameters<typeof _getReserveData>) => params.join(','),
})

// Retrieves reserve data in an Aave pool at a specific block number
export async function _getReserveData(
  networkId: NetworkId,
  poolAddress: Address,
  blockNumber: number,
): Promise<Map<Address, ReserveData>> {
  const publicClient = getViemPublicClient(networkId)

  // Check if the contract exists at the given block number
  const poolByteCode = await publicClient.getCode({
    address: poolAddress,
    blockNumber: BigInt(blockNumber),
  })

  const reserveTokens = poolByteCode
    ? await publicClient.readContract({
        address: poolAddress,
        abi: poolAbi,
        functionName: 'getReservesList',
        blockNumber: BigInt(blockNumber),
      })
    : []

  const [reserveData, tokenDecimals] = await Promise.all([
    Promise.all(
      reserveTokens.map((tokenAddress) =>
        publicClient.readContract({
          address: poolAddress,
          abi: poolAbi,
          functionName: 'getReserveData',
          args: [tokenAddress],
          blockNumber: BigInt(blockNumber),
        }),
      ),
    ),
    Promise.all(
      reserveTokens.map((tokenAddress) =>
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ),
    ),
  ])

  const result = new Map(
    reserveData.map((data, index) => [
      reserveTokens[index].toLowerCase() as Address,
      {
        reserveTokenAddress: reserveTokens[index].toLowerCase() as Address,
        reserveTokenDecimals: tokenDecimals[index],
        aTokenAddress: data.aTokenAddress.toLowerCase() as Address,
        liquidityIndex: data.liquidityIndex,
        reserveFactor: (data.configuration.data >> BigInt(64)) & BigInt(0xffff), // ReserveFactor is 16 bits from the 64th to the 79th bit
      },
    ]),
  )

  return result
}
