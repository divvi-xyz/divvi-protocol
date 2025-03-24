import { erc20Abi, formatUnits, getContract, isAddress } from 'viem'
import { getEvents } from '../calculateRevenue/protocols/somm/getEvents'
import { getVaults } from '../calculateRevenue/protocols/somm/getVaults'
import { ReferralEvent } from '../types'
import { getViemPublicClient } from '../utils'

// The user has to have done at least one TVL event on Somm
// and their TVL at the time of the referral must be 0
export async function filter(event: ReferralEvent): Promise<boolean> {
  let numTvlEvents = 0

  const vaultsInfo = await getVaults()
  const nowDate = new Date()
  const eventDate = new Date(event.timestamp)
  const address = event.userAddress
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }

  for (const vaultInfo of vaultsInfo) {
    const client = getViemPublicClient(vaultInfo.networkId)
    const vaultContract = getContract({
      address: vaultInfo.vaultAddress,
      abi: erc20Abi,
      client,
    })
    const currentLPTokenBalance = await vaultContract.read.balanceOf([address])
    const tokenDecimals = await vaultContract.read.decimals()
    const currentTvl = Number(formatUnits(currentLPTokenBalance, tokenDecimals))
    const tvlEvents = await getEvents({
      address,
      vaultInfo,
      startTimestamp: eventDate,
      endTimestamp: nowDate,
    })
    numTvlEvents += tvlEvents.length
    const tvlAtReferral =
      currentTvl - tvlEvents.reduce((acc, event) => acc + event.amount, 0)
    if (tvlAtReferral > 0) {
      return false
    }
  }
  return numTvlEvents > 0
}
