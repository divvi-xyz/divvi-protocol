import { GetContractReturnType } from 'viem'
import { NetworkId } from '../../../types'
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout'
import memoize from '@github/memoize'
import { getViemPublicClient } from '../../../utils'
import { BlockTimestampData } from '../types'

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
}

/**
 * Fetches the nearest block number for a given network and timestamp.
 *
 * @param networkId - The ID of the network to query.
 * @param timestamp - The date and time for which to find the nearest block.
 * @returns A promise that resolves to the block number closest to the given timestamp.
 * @throws Will throw an error if the fetch request to DefiLlama fails.
 */
export async function _getNearestBlock(
  networkId: NetworkId,
  timestamp: Date,
): Promise<number> {
  const unixTimestamp = Math.floor(timestamp.getTime() / 1000)
  const defiLlamaChain = NETWORK_ID_TO_DEFI_LLAMA_CHAIN[networkId]

  const response = await fetchWithTimeout(
    `${DEFI_LLAMA_API_URL}/block/${defiLlamaChain}/${unixTimestamp}`,
  )
  if (!response.ok) {
    throw new Error(
      `Error while fetching block timestamp from DefiLlama: ${response}`,
    )
  }
  const blockTimestampData = (await response.json()) as BlockTimestampData
  return blockTimestampData.height
}

export const getNearestBlock = memoize(_getNearestBlock, {
  hash: (...params: Parameters<typeof _getNearestBlock>) => params.join(','),
})

/**
 * Fetches events from a specified contract within a given time range.
 *
 * @param {Object} params - The parameters for fetching events.
 * @param {GetContractReturnType} params.contract - The contract to fetch events from.
 * @param {NetworkId} params.networkId - The network ID where the contract is deployed.
 * @param {string} params.eventName - The name of the event to fetch.
 * @param {Date} params.startTimestamp - The start timestamp for the event search.
 * @param {Date} params.endTimestamp - The end timestamp for the event search.
 * @returns {Promise<Log[]>} A promise that resolves to an array of event logs.
 */
export async function _fetchEvents({
  contract,
  networkId,
  eventName,
  startTimestamp,
  endTimestamp,
}: {
  contract: GetContractReturnType
  eventName: string
  networkId: NetworkId
  startTimestamp: Date
  endTimestamp: Date
}) {
  const client = getViemPublicClient(networkId)

  const startBlock = await getNearestBlock(networkId, startTimestamp)
  const endBlock = await getNearestBlock(networkId, endTimestamp)
  const blocksPer = 10000
  let currentBlock = startBlock

  const events = []

  while (currentBlock <= endBlock) {
    const toBlock = Math.min(currentBlock + blocksPer, endBlock)
    const eventLogs = await client.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName,
      fromBlock: BigInt(currentBlock),
      toBlock: BigInt(toBlock),
    })

    events.push(...eventLogs)
    currentBlock = toBlock + 1
  }
  return events
}

export const fetchEvents = memoize(_fetchEvents, {
  hash: (...params: Parameters<typeof _fetchEvents>) =>
    Object.values(params[0]).join(','),
})
