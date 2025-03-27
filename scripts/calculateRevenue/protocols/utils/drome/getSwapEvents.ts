import { Address, isAddressEqual } from 'viem'
import { getViemPublicClient, getErc20Contract } from '../../../../utils'
import { fetchEvents } from '../events'
import { getAerodromeLiquidityPoolContract } from '../viem'
import { SwapEvent } from './types'
import { NetworkId } from '../../../../types'

export async function getSwapEvents(
  address: string,
  liquidityPoolAddress: Address,
  startTimestamp: Date,
  endTimestamp: Date,
  networkId: NetworkId,
): Promise<SwapEvent[]> {
  const swapContract = await getAerodromeLiquidityPoolContract(
    liquidityPoolAddress,
    networkId,
  )
  const allSwapEvents = await fetchEvents({
    contract: swapContract,
    networkId: networkId,
    eventName: 'Swap',
    startTimestamp,
    endTimestamp,
  })
  const filteredSwapEvents = allSwapEvents.filter(
    (swapEvent) =>
      isAddressEqual(
        (swapEvent.args as { recipient: Address }).recipient,
        address as Address,
      ) || (swapEvent.args as { recipient: string }).recipient === address,
  )

  const swapEvents: SwapEvent[] = []
  const client = getViemPublicClient(networkId)
  const tokenAddress = await client.readContract({
    address: liquidityPoolAddress,
    abi: swapContract.abi,
    functionName: 'token0',
  })
  const tokenContract = await getErc20Contract(tokenAddress, networkId)
  const tokenDecimals = BigInt(await tokenContract.read.decimals())

  for (const swapEvent of filteredSwapEvents) {
    const block = await client.getBlock({
      blockNumber: swapEvent.blockNumber,
    })
    const absAmount0 =
      (swapEvent.args as { amount0: bigint }).amount0 > 0n
        ? (swapEvent.args as { amount0: bigint }).amount0
        : -(swapEvent.args as { amount0: bigint }).amount0
    swapEvents.push({
      timestamp: new Date(Number(block.timestamp * 1000n)),
      amountInToken: absAmount0,
      tokenDecimals,
      tokenId: `${networkId}:${tokenAddress}`,
    })
  }
  return swapEvents
}
