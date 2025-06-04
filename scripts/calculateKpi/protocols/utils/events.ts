import { GetContractReturnType } from 'viem'
import { NetworkId } from '../../../types'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'
import memoize from '@github/memoize'
import { getViemPublicClient } from '../../../utils'
import { BlockTimestampData } from '../types'
import Bottleneck from 'bottleneck'

const DEFI_LLAMA_API_URL = 'https://coins.llama.fi'

const NETWORK_ID_TO_DEFI_LLAMA_CHAIN: Partial<{
  [networkId in NetworkId]: string // eslint-disable-line @typescript-eslint/no-unused-vars
}> = {
  [NetworkId['ethereum-mainnet']]: 'ethereum',
  [NetworkId['arbitrum-one']]: 'arbitrum',
  [NetworkId['op-mainnet']]: 'optimism',
  [NetworkId['celo-mainnet']]: 'celo',
  [NetworkId['polygon-pos-mainnet']]: 'polygon',
  [NetworkId['base-mainnet']]: 'base',
  [NetworkId['lisk-mainnet']]: 'lisk',
}

/**
 * Fetches the nearest block number for a given network and timestamp.
 *
 * @param networkId - The ID of the network to query.
 * @param timestamp - The date and time for which to find the nearest block.
 * @returns A promise that resolves to the block number closest to the given timestamp.
 * @throws Will throw an error if the fetch request to DefiLlama fails.
 */
async function _getNearestBlock(
  networkId: NetworkId,
  timestamp: Date,
): Promise<BlockTimestampData> {
  const unixTimestamp = Math.floor(timestamp.getTime() / 1000)
  const defiLlamaChain = NETWORK_ID_TO_DEFI_LLAMA_CHAIN[networkId]

  const response = await fetchWithTimeout(
    `${DEFI_LLAMA_API_URL}/block/${defiLlamaChain}/${unixTimestamp}`,
  )
  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Error while fetching block timestamp from DefiLlama:\n` +
        `Status: ${response.status} ${response.statusText}\n` +
        `Body: ${errorBody}`,
    )
  }
  const blockTimestampData = (await response.json()) as BlockTimestampData
  return blockTimestampData
}

// Set up a Bottleneck instance to keep requests to DefiLlama under the allowed rate limit (500 requests per minute).
const limiter = new Bottleneck({
  reservoir: 500, // initial number of available requests
  reservoirRefreshAmount: 500, // how many tokens to add on refresh
  reservoirRefreshInterval: 60 * 1000, // refresh every 60 seconds
  minTime: 0, // no minimum time between requests
})

const _safeGetNearestBlock = limiter.wrap(_getNearestBlock)

/**
 * Intentionally not exported. We should use `getBlockRange` instead.
 */
const getNearestBlock = memoize(_safeGetNearestBlock, {
  hash: (...params: Parameters<typeof _safeGetNearestBlock>) =>
    params.join(','),
})

export const _getNearestBlockForTesting = getNearestBlock

export async function getFirstBlockAtOrAfterTimestamp(
  networkId: NetworkId,
  targetDate: Date,
): Promise<number> {
  const targetTimestampSec = Math.floor(targetDate.getTime() / 1000)
  const block = await getNearestBlock(networkId, targetDate)

  if (block.timestamp >= targetTimestampSec) {
    // The nearest block is at or after the target. It must be the first.
    return block.height
  } else {
    // The nearest block is before the target. The next block must be the first one at or after.
    // Note: Assumes block numbers increment by 1 and block N+1 always has timestamp >= block N.
    return block.height + 1
  }
}

/**
 * Calculates the start and end block numbers for a given time range.
 * The time range is defined as [startTimestamp, endTimestampExclusive),
 * meaning it's inclusive of the startTimestamp and exclusive of the endTimestampExclusive.
 *
 * @param networkId The ID of the network.
 * @param startTimestamp The inclusive start date of the time range.
 * @param endTimestampExclusive The exclusive end date of the time range.
 * @returns A promise that resolves to an object containing:
 *    `startBlock`: The first block whose timestamp is >= startTimestamp (inclusive).
 *    `endBlockExclusive`: The first block whose timestamp is >= endTimestampExclusive. This block itself
 *                is *exclusive* from the desired range. When used in loops like
 *                `for (let i = startBlock; i < endBlockExclusive; i++)`, or as an exclusive
 *                upper bound in queries, it correctly defines the desired time window.
 * @throws Will throw an error if startTimestamp is not before endTimestampExclusive, or if a valid
 *         block range cannot be determined (e.g., startBlock ends up >= endBlockExclusive).
 */
export async function getBlockRange({
  networkId,
  startTimestamp,
  endTimestampExclusive,
}: {
  networkId: NetworkId
  startTimestamp: Date // inclusive
  endTimestampExclusive: Date // exclusive
}): Promise<{
  startBlock: number // inclusive
  endBlockExclusive: number
}> {
  if (startTimestamp.getTime() >= endTimestampExclusive.getTime()) {
    throw new Error('Start timestamp must be before end timestamp.')
  }

  const [startBlock, endBlockExclusive] = await Promise.all([
    // Determine the inclusive startBlock:
    // This is the first block whose timestamp is greater than or equal to the startTimestamp.
    getFirstBlockAtOrAfterTimestamp(networkId, startTimestamp),
    // Determine the exclusive endBlock:
    // This is the first block whose timestamp is greater than or equal to the endTimestampExclusive.
    // Using this block's height as `endBlockExclusive` means that loops iterating up to `endBlockExclusive - 1`
    // will process all blocks strictly before this `endBlockExclusive`.
    // Thus, the last processed block will have a timestamp < endTimestampExclusive.
    getFirstBlockAtOrAfterTimestamp(networkId, endTimestampExclusive),
  ])

  // Validate the calculated block range.
  // The startBlock must be strictly less than the endBlockExclusive for a valid, non-empty range.
  // If startBlock == endBlockExclusive, the range is empty (e.g., startTimestamp and endTimestampExclusive map to the same block for their >= condition).
  // If startBlock > endBlockExclusive, it implies an issue, possibly with startTimestamp mapping to a block after endTimestampExclusive's mapped block,
  // though the initial timestamp check should largely prevent this specific sequence.
  if (startBlock >= endBlockExclusive) {
    throw new Error(
      `Calculated startBlock (height: ${startBlock}) is not strictly less than calculated endBlockExclusive (height: ${endBlockExclusive}). This results in an empty or invalid range. Ensure startTimestamp and endTimestampExclusive define a valid, non-empty interval. It's possible the startTimestamp maps to a block that is at or after the endTimestampExclusive's mapped block.`,
    )
  }

  return { startBlock, endBlockExclusive }
}

/**
 * Fetches events from a specified contract within a given time range.
 *
 * @param {Object} params - The parameters for fetching events.
 * @param {GetContractReturnType} params.contract - The contract to fetch events from.
 * @param {NetworkId} params.networkId - The network ID where the contract is deployed.
 * @param {string} params.eventName - The name of the event to fetch.
 * @param {Date} params.startTimestamp - The start timestamp for the event search.
 * @param {Date} params.endTimestampExclusive - The end timestamp for the event search.
 * @returns {Promise<Log[]>} A promise that resolves to an array of event logs.
 */
async function _fetchEvents({
  contract,
  networkId,
  eventName,
  startTimestamp,
  endTimestampExclusive,
}: {
  contract: GetContractReturnType
  eventName: string
  networkId: NetworkId
  startTimestamp: Date
  endTimestampExclusive: Date
}) {
  const client = getViemPublicClient(networkId)

  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
  })
  const blocksPerQuery = 10000
  let currentBlock = startBlock
  const events = []

  // Loop from startBlock up to (but not including) endBlock
  while (currentBlock < endBlockExclusive) {
    // The toBlock for getContractEvents is inclusive.
    // So, it should be currentBlock + blocksPerQuery - 1, but not exceeding endBlock - 1.
    const toBlockForQuery = Math.min(
      currentBlock + blocksPerQuery - 1,
      endBlockExclusive - 1,
    )

    const eventLogs = await client.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName,
      fromBlock: BigInt(currentBlock),
      toBlock: BigInt(toBlockForQuery),
    })

    events.push(...eventLogs)
    currentBlock = toBlockForQuery + 1
  }
  return events
}

export const fetchEvents = memoize(_fetchEvents, {
  hash: (...params: Parameters<typeof _fetchEvents>) =>
    Object.values(params[0]).join(','),
})
