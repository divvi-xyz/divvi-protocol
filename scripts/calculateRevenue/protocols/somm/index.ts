import { Address, erc20Abi, formatUnits, getContract } from 'viem'
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

  for (const tvlEvent of tvlEvents) {
    let daysInRange = 0
    if (
      prevTimestamp.getTime() >= endTimestamp.getTime() &&
      tvlEvent.timestamp.getTime() < endTimestamp.getTime()
    ) {
      daysInRange =
        (endTimestamp.getTime() - tvlEvent.timestamp.getTime()) / ONE_DAY
    } else if (tvlEvent.timestamp.getTime() < endTimestamp.getTime()) {
      daysInRange =
        (prevTimestamp.getTime() - tvlEvent.timestamp.getTime()) / ONE_DAY
    }
    tvlDays += daysInRange * currentTvl
    currentTvl -= tvlEvent.amount
    prevTimestamp = tvlEvent.timestamp
  }
  tvlDays +=
    ((prevTimestamp.getTime() - startTimestamp.getTime()) / ONE_DAY) *
    currentTvl
  return (
    tvlDays / ((endTimestamp.getTime() - startTimestamp.getTime()) / ONE_DAY)
  )
}

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: Address
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
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
