import fetch from 'node-fetch'
import { DailySnapshot } from './types'
import { NetworkId } from '../../../types'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

const NETWORK_ID_TO_CHAIN_ID: Partial<Record<NetworkId, string>> = {
  [NetworkId['ethereum-mainnet']]: 'ethereum',
  [NetworkId['arbitrum-one']]: 'arbitrum',
  [NetworkId['op-mainnet']]: 'optimism',
  [NetworkId['polygon-pos-mainnet']]: 'polygon',
  [NetworkId['base-mainnet']]: 'base',
}

export async function getDailySnapshots({
  networkId,
  vaultAddress,
  startTimestamp,
  endTimestamp,
}: {
  networkId: NetworkId
  vaultAddress: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<DailySnapshot[]> {
  // Subtract 24 hours from the start time to ensure we get the snapshot for the start time
  const startUnixTimestamp = Math.floor(
    (startTimestamp.getTime() - TWENTY_FOUR_HOURS) / 1000,
  )
  const endUnixTimestamp = Math.floor(endTimestamp.getTime() / 1000)
  const url = `https://api.sommelier.finance/dailyData/${NETWORK_ID_TO_CHAIN_ID[networkId]}/${vaultAddress}/${startUnixTimestamp}/${endUnixTimestamp}`
  console.log('Fetching data from:', url)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`)
  }

  const data: DailySnapshot[] = await response.json()
  return data
}

/**
 * Calculates the average price_usd / share_price within a given time range,
 * Assumes that each daily snapshot is taken at midnight UTC
 * and that the price & shares are constant for 24 hours after the snapshot time.
 */
export function calculateWeightedAveragePrice(
  snapshots: DailySnapshot[],
  startTimestamp: Date,
  endTimestamp: Date,
): number {
  const startTime = startTimestamp.getTime()
  const endTime = endTimestamp.getTime()

  if (isNaN(startTime) || isNaN(endTime) || startTime > endTime) {
    throw new Error('Invalid timestamps provided')
  }

  if (snapshots.length === 0) {
    throw new Error('No snapshots provided')
  }

  let totalWeightedPrice = 0
  let totalTimeWeight = 0

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i]
    const snapshotTime = new Date(snapshot.timestamp).getTime()

    if (snapshotTime > endTime) {
      continue
    }
    if (snapshotTime + TWENTY_FOUR_HOURS < startTime) {
      continue
    }

    const snapshotStartTime = Math.max(snapshotTime, startTime)
    const snapshotEndTime = Math.min(snapshotTime + TWENTY_FOUR_HOURS, endTime)
    const snapshotWeight = snapshotEndTime - snapshotStartTime
    const snapshotPrice = snapshot.price_usd / snapshot.share_price

    totalTimeWeight += snapshotWeight
    totalWeightedPrice += snapshotWeight * snapshotPrice
  }

  if (totalTimeWeight === 0) {
    throw new Error('No snapshots in range')
  }

  return totalWeightedPrice / totalTimeWeight
}
