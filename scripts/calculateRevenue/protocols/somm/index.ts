import { Address, erc20Abi, formatUnits, getContract, isAddress } from 'viem'
import { getViemPublicClient } from '../../../utils'
import { getVaults } from './getVaults'
import { VaultInfo } from './types'
import { getEvents } from './getEvents'

const ONE_DAY = 24 * 60 * 60 * 1000

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
 * Calculates the daily mean Total Value Locked (TVL) for a given user address
 * and vault pair within a specified time range.
 *
 * TODO(ENG-201): Return TVL in USD
 */
export async function getDailyMeanTvl({
  vaultInfo,
  address,
  startTimestamp,
  endTimestamp,
  nowTimestamp,
}: {
  vaultInfo: VaultInfo
  address: Address
  startTimestamp: Date
  endTimestamp: Date
  nowTimestamp: Date
}) {
  if (endTimestamp.getTime() > nowTimestamp.getTime()) {
    throw new Error('Cannot have an endTimestamp in the future')
  }
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: erc20Abi,
    client,
  })
  const currentLPTokenBalance = await vaultContract.read.balanceOf([address])
  const tokenDecimals = await vaultContract.read.decimals()

  const tvlEvents = await getEvents({
    address,
    vaultInfo,
    startTimestamp,
    endTimestamp: nowTimestamp,
  })

  let prevTimestamp = nowTimestamp
  let tvlDays = 0
  let currentTvl = Number(formatUnits(currentLPTokenBalance, tokenDecimals))

  // Loop through the TVL events in reverse chronological order keeping track of the user's TVL as
  // different TVL events occur (withdaws and deposits) and adding up the total TVL days within the start and end timestamps
  for (const tvlEvent of tvlEvents) {
    // the default case is that the previous event and current event are outside of the time range
    let daysInRange = 0

    // if the previous event is outside of the time range and the current event is inside the time range
    if (
      prevTimestamp.getTime() >= endTimestamp.getTime() &&
      tvlEvent.timestamp.getTime() < endTimestamp.getTime()
    ) {
      daysInRange = getDaysInRange(tvlEvent.timestamp, endTimestamp)
    }
    // else the events are both inside the time range
    else if (tvlEvent.timestamp.getTime() < endTimestamp.getTime()) {
      daysInRange = getDaysInRange(tvlEvent.timestamp, prevTimestamp)
    }
    tvlDays += daysInRange * currentTvl
    currentTvl -= tvlEvent.amount
    prevTimestamp = tvlEvent.timestamp
  }
  tvlDays += getDaysInRange(startTimestamp, prevTimestamp) * currentTvl
  return tvlDays / getDaysInRange(startTimestamp, endTimestamp)
}

function getDaysInRange(startTimestamp: Date, endTimestamp: Date) {
  return (endTimestamp.getTime() - startTimestamp.getTime()) / ONE_DAY
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
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }
  const vaultsInfo = getVaults()

  let totalRevenue = 0
  const nowTimestamp = new Date()
  for (const vaultInfo of vaultsInfo) {
    const vaultRevenue = await getDailyMeanTvl({
      vaultInfo,
      address,
      startTimestamp,
      endTimestamp,
      nowTimestamp,
    })
    totalRevenue += vaultRevenue
  }
  return totalRevenue
}
