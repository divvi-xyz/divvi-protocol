import { Address } from 'viem'
import { getTokenPrice } from '../beefy'
import { fetchEvents } from '../utils/events'
import { fetchTokenPrices } from '../utils/tokenPrices'
import { getAerodromeLiquidityPoolContract } from '../utils/viem'
import { NetworkId } from '../../../types'
import { getErc20Contract, getViemPublicClient } from '../../../utils'

const SUPPORTED_LIQUIDITY_POOL_ADDRESSES: Address[] = [
  '0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59',
]
const AERODROME_NETWORK_ID = NetworkId['base-mainnet']

type SwapEvent = {
  timestamp: Date
  amountInToken: number
  tokenId: string
}

async function getSwapEvents(
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
      amountInToken: Number(
        (swapEvent.args as { amount0: bigint }).amount0 > 0n
          ? (swapEvent.args as { amount0: bigint }).amount0
          : -(swapEvent.args as { amount0: bigint }).amount0 /
              10n ** tokenDecimals,
      ),
      tokenId,
    })
  }
  return swapEvents
}

export async function calculateSwapRevenue(swapEvents: SwapEvent[]) {
  let totalUsdContribution = 0

  const startTimestamp = swapEvents[0].timestamp
  const endTimestamp = swapEvents[swapEvents.length - 1].timestamp
  const tokenId = swapEvents[0].tokenId
  const tokenPrices = await fetchTokenPrices({
    tokenId,
    startTimestamp,
    endTimestamp,
  })
  for (const swapEvent of swapEvents) {
    const tokenPriceUsd = getTokenPrice(
      tokenPrices,
      new Date(swapEvent.timestamp),
    )
    const partialUsdContribution = swapEvent.amountInToken * tokenPriceUsd
    totalUsdContribution += partialUsdContribution
  }
  return totalUsdContribution
}

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  let totalRevenue = 0
  for (const liquidityPoolAddress of SUPPORTED_LIQUIDITY_POOL_ADDRESSES) {
    const swapEvents = await getSwapEvents(
      address,
      liquidityPoolAddress,
      startTimestamp,
      endTimestamp,
    )
    const swapRevenue = await calculateSwapRevenue(swapEvents)
    totalRevenue += swapRevenue
  }
  return totalRevenue
}
