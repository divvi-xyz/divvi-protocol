import {
  Address,
  erc20Abi,
  erc4626Abi,
  formatUnits,
  getContract,
  isAddressEqual,
} from 'viem'
import { getViemPublicClient } from '../../../utils'
import { fetchEvents } from '../utils/events'
import { TvlEvent, VaultInfo } from './types'

/**
 * Fetches and returns a list of TVL (Total Value Locked) change events for a given address and vault within a specified time range.
 * The events include both deposits and withdrawals, and are sorted in reverse chronological order.
 */
export async function getEvents({
  address,
  vaultInfo,
  startTimestamp,
  endTimestamp,
}: {
  address: Address
  vaultInfo: VaultInfo
  startTimestamp: Date
  endTimestamp: Date
}) {
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: [...erc4626Abi, ...erc20Abi],
    client,
  })
  const tvlEvents: TvlEvent[] = []

  const decimals = await vaultContract.read.decimals()

  const depositEvents = (
    await fetchEvents({
      contract: vaultContract,
      networkId: vaultInfo.networkId,
      eventName: 'Deposit',
      startTimestamp,
      endTimestamp,
    })
  ).filter((event) => {
    return isAddressEqual((event.args as { sender: Address }).sender, address)
  })

  for (const depositEvent of depositEvents) {
    const block = await client.getBlock({
      blockNumber: depositEvent.blockNumber,
    })
    tvlEvents.push({
      amount: Number(
        formatUnits((depositEvent.args as { shares: bigint }).shares, decimals),
      ),
      timestamp: new Date(Number(block.timestamp * 1000n)),
    })
  }

  const withdrawEvents = (
    await fetchEvents({
      contract: vaultContract,
      networkId: vaultInfo.networkId,
      eventName: 'Withdraw',
      startTimestamp,
      endTimestamp,
    })
  ).filter((event) => {
    return isAddressEqual((event.args as { sender: Address }).sender, address)
  })

  for (const withdrawEvent of withdrawEvents) {
    const block = await client.getBlock({
      blockNumber: withdrawEvent.blockNumber,
    })
    tvlEvents.push({
      amount:
        -1 *
        Number(
          formatUnits(
            (withdrawEvent.args as { shares: bigint }).shares,
            decimals,
          ),
        ),
      timestamp: new Date(Number(block.timestamp * 1000n)),
    })
  }

  // Sort events in reverse chronological order
  return tvlEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}
