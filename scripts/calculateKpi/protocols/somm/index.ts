import { Address, erc20Abi, formatUnits, getContract, isAddress } from 'viem'
import { getViemPublicClient } from '../../../utils'
import { getVaults } from './getVaults'
import { VaultInfo } from './types'
import { getEvents } from './getEvents'
import {
  calculateWeightedAveragePrice,
  getDailySnapshots,
} from './dailySnapshots'

const REWARDS_PERCENTAGE = 0.1 // 10%
export const ONE_YEAR = 365 * 24 * 60 * 60 * 1000

export async function getBalanceOfAddress({
  vaultInfo,
  address,
}: {
  vaultInfo: VaultInfo
  address: Address
}) {
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: erc20Abi,
    client,
  })
  return vaultContract.read.balanceOf([address])
}

/**
 * Calculates the Total Value Locked (TVL) for a given user address prorated for a year.
 * This function calculates the TVL for a user address in a given vault pair within a specified
 * time range using daily snapshots of the vault's price and shares.
 */
export async function getTvlProratedPerYear({
  vaultInfo,
  address,
  startTimestamp,
  endTimestampExclusive,
  nowTimestamp,
}: {
  vaultInfo: VaultInfo
  address: Address
  startTimestamp: Date
  endTimestampExclusive: Date
  nowTimestamp: Date
}) {
  if (endTimestampExclusive.getTime() > nowTimestamp.getTime()) {
    throw new Error('Cannot have an endTimestampExclusive in the future')
  }
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: erc20Abi,
    client,
  })
  const currentLPTokenBalance = await vaultContract.read.balanceOf([address])
  const tokenDecimals = await vaultContract.read.decimals()

  const dailySnapshots = await getDailySnapshots({
    networkId: vaultInfo.networkId,
    vaultAddress: vaultInfo.vaultAddress,
    startTimestamp,
    endTimestampExclusive,
  })

  const tvlEvents = await getEvents({
    address,
    vaultInfo,
    startTimestamp,
    endTimestampExclusive: nowTimestamp,
  })

  let prevTimestamp = nowTimestamp
  let tvlMilliseconds = 0 // think killowatt hours
  let currentTvl = Number(formatUnits(currentLPTokenBalance, tokenDecimals))

  // Loop through the TVL events in reverse chronological order keeping track of the user's TVL as
  // different TVL events occur (withdaws and deposits) and adding up the total TVL milliseconds within the start and end timestamps
  for (const tvlEvent of tvlEvents) {
    // the default case is that the previous event and current event are outside of the time range
    let timeInRange = 0
    let priceInRange = 0

    // if the previous event is outside of the time range and the current event is inside the time range
    if (
      prevTimestamp.getTime() >= endTimestampExclusive.getTime() &&
      tvlEvent.timestamp.getTime() < endTimestampExclusive.getTime()
    ) {
      timeInRange = getTimeInRange(tvlEvent.timestamp, endTimestampExclusive)
      priceInRange = calculateWeightedAveragePrice({
        snapshots: dailySnapshots,
        startTimestamp: prevTimestamp,
        endTimestampExclusive,
      })
    }
    // else the events are both inside the time range
    else if (tvlEvent.timestamp.getTime() < endTimestampExclusive.getTime()) {
      timeInRange = getTimeInRange(tvlEvent.timestamp, prevTimestamp)
      priceInRange = calculateWeightedAveragePrice({
        snapshots: dailySnapshots,
        startTimestamp: tvlEvent.timestamp,
        endTimestampExclusive: prevTimestamp,
      })
    }
    tvlMilliseconds += timeInRange * currentTvl * priceInRange
    currentTvl -= tvlEvent.amount
    prevTimestamp = tvlEvent.timestamp
  }
  tvlMilliseconds +=
    getTimeInRange(startTimestamp, prevTimestamp) *
    currentTvl *
    calculateWeightedAveragePrice({
      snapshots: dailySnapshots,
      startTimestamp,
      endTimestampExclusive: prevTimestamp,
    })
  return tvlMilliseconds / ONE_YEAR
}

function getTimeInRange(startTimestamp: Date, endTimestampExclusive: Date) {
  return endTimestampExclusive.getTime() - startTimestamp.getTime()
}

export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }
  const vaultsInfo = await getVaults()

  let totalRevenue = 0
  const nowTimestamp = new Date()
  for (const vaultInfo of vaultsInfo) {
    const vaultRevenue = await getTvlProratedPerYear({
      vaultInfo,
      address,
      startTimestamp,
      endTimestampExclusive,
      nowTimestamp,
    })
    totalRevenue += vaultRevenue
  }
  return totalRevenue * REWARDS_PERCENTAGE
}
