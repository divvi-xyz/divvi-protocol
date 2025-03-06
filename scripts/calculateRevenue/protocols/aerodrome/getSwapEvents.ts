import { Address } from 'viem'
import { getViemPublicClient, getErc20Contract } from '../../../utils'
import { fetchEvents } from '../utils/events'
import { getAerodromeLiquidityPoolContract } from '../utils/viem'
import { SwapEvent } from '.'
import { AERODROME_NETWORK_ID, TOKEN_AMOUNT_PRECISION } from './constants'

export async function getSwapEvents(
  address: string,
  liquidityPoolAddress: Address,
  startTimestamp: Date,
  endTimestamp: Date,
): Promise<SwapEvent[]> {
  const swapContract = await getAerodromeLiquidityPoolContract(
    liquidityPoolAddress,
    AERODROME_NETWORK_ID,
  )
  const allSwapEvents = await fetchEvents({
    contract: swapContract,
    networkId: AERODROME_NETWORK_ID,
    eventName: 'Swap',
    startTimestamp,
    endTimestamp,
  })
  const filteredSwapEvents = allSwapEvents.filter(
    (swapEvent) =>
      (swapEvent.args as { recipient: string }).recipient === address,
  )

  const swapEvents: SwapEvent[] = []
  const client = getViemPublicClient(AERODROME_NETWORK_ID)
  const tokenId = await client.readContract({
    address: liquidityPoolAddress,
    abi: swapContract.abi,
    functionName: 'token0',
  })
  const tokenContract = await getErc20Contract(tokenId, AERODROME_NETWORK_ID)
  const tokenDecimals = BigInt(await tokenContract.read.decimals())

  for (const swapEvent of filteredSwapEvents) {
    const block = await client.getBlock({
      blockNumber: swapEvent.blockNumber,
    })
    swapEvents.push({
      timestamp: new Date(Number(block.timestamp * 1000n)),
      amountInToken:
        Number(
          (((swapEvent.args as { amount0: bigint }).amount0 > 0n
            ? (swapEvent.args as { amount0: bigint }).amount0
            : -(swapEvent.args as { amount0: bigint }).amount0) *
            10n ** BigInt(TOKEN_AMOUNT_PRECISION)) /
            10n ** tokenDecimals,
        ) /
        10 ** TOKEN_AMOUNT_PRECISION,
      tokenId,
    })
  }
  return swapEvents
}
