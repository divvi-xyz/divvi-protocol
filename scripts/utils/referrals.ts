import { NETWORK_ID_TO_REGISTRY_ADDRESS } from './networks'
import { NetworkId, Protocol, ReferralEvent } from '../types'
import { getRegistryContract } from './index'
import { Address, hexToString, stringToHex } from 'viem'

// Remove duplicate events, keeping only the earliest event for each user
export function removeDuplicates(events: ReferralEvent[]): ReferralEvent[] {
  const uniqueEventsMap: Map<string, ReferralEvent> = new Map()

  for (const event of events) {
    const existingEvent = uniqueEventsMap.get(event.userAddress)

    if (!existingEvent || event.timestamp < existingEvent.timestamp) {
      uniqueEventsMap.set(event.userAddress, event)
    }
  }

  return Array.from(uniqueEventsMap.values())
}

// Fetch referral events on networks for the given protocol with an optional list of referrer addresses
export async function fetchReferralEvents(
  networkIds: NetworkId[],
  protocol: Protocol,
  referrerIds?: Address[],
): Promise<ReferralEvent[]> {
  const referralEvents: ReferralEvent[] = []
  console.log('Fetching referral events for protocol:', protocol)

  await Promise.all(
    networkIds.map(async (networkId) => {
      if (!NETWORK_ID_TO_REGISTRY_ADDRESS[networkId]) {
        return
      }
      const registryContract = await getRegistryContract(
        NETWORK_ID_TO_REGISTRY_ADDRESS[networkId],
        networkId,
      )
      const hexProtocol = stringToHex(protocol, { size: 32 })

      const referrers = referrerIds
        ? referrerIds
        : ((await registryContract.read.getReferrers([
            hexProtocol,
          ])) as Address[])

      await Promise.all(
        referrers.map(async (referrer) => {
          const [userAddresses, timestamps] =
            (await registryContract.read.getUsers([hexProtocol, referrer])) as [
              string[],
              number[],
            ]
          userAddresses.forEach((userAddress, index) => {
            referralEvents.push({
              protocol,
              userAddress,
              referrerId: hexToString(referrer, { size: 32 }),
              timestamp: timestamps[index],
            })
          })
        }),
      )
    }),
  )
  return referralEvents
}
