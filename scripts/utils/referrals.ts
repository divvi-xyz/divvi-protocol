import { NetworkId, Protocol, ReferralEvent } from '../types'
import { getHyperSyncClient } from './index'
import { Address, decodeEventLog, encodeEventTopics, Hex, pad } from 'viem'
import { BlockField, LogField, Query } from '@envio-dev/hypersync-client'
import { paginateEventsQuery } from './hypersyncPagination'
import { divviRegistryAbi } from '../../abis/DivviRegistry'

const REGISTRY_CONTRACT_ADDRESS = '0xedb51a8c390fc84b1c2a40e0ae9c9882fa7b7277'
const STAGING_REGISTRY_CONTRACT_ADDRESS =
  '0x2f5E320698dB89CbefB810Fa19264103d99aAFB1'
const REGISTRY_NETWORK_ID = NetworkId['op-mainnet']

const REGISTRY_START_BLOCK = 134945942 // Block where the registry contract was deployed

const REWARDS_PROVIDERS: Partial<Record<Protocol, Address>> = {
  'celo-transactions': '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8', // celo proof of impact
  'celo-pg': '0x', // TODO: Add entity address for celo pg
}

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
  protocol: Protocol,
  referrerIds?: Address[],
  useStaging = false,
): Promise<ReferralEvent[]> {
  const referralEvents: ReferralEvent[] = []
  console.log('Fetching referral events for protocol:', protocol)

  const rewardsProvider = REWARDS_PROVIDERS[protocol]

  if (!rewardsProvider) {
    console.error('No rewards provider found for protocol:', protocol)
    return []
  }

  const registryContractAddress = useStaging
    ? STAGING_REGISTRY_CONTRACT_ADDRESS
    : REGISTRY_CONTRACT_ADDRESS

  const topics = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'ReferralRegistered',
  })

  const hypersyncClient = getHyperSyncClient(REGISTRY_NETWORK_ID)

  const hypersyncQuery: Query = {
    fromBlock: REGISTRY_START_BLOCK,
    logs: [
      {
        address: [registryContractAddress],
        // topic0 is the event signature for ReferralRegistered
        // topic2 is the rewards provider
        topics: [[topics[0]], [], [pad(rewardsProvider)]],
      },
    ],
    fieldSelection: {
      block: [BlockField.Timestamp],
      log: [
        LogField.TransactionHash,
        LogField.Data,
        LogField.Topic0,
        LogField.Topic1,
        LogField.Topic2,
        LogField.Topic3,
      ],
    },
  }

  await paginateEventsQuery(
    hypersyncClient,
    hypersyncQuery,
    async (response) => {
      for (const event of response.data) {
        if (!event.block) {
          // should never happen
          throw new Error(
            `Block data is missing in the event response: ${JSON.stringify(event)}`,
          )
        }

        const decodedEvent = decodeEventLog({
          abi: divviRegistryAbi,
          eventName: 'ReferralRegistered',
          topics: event.log.topics as [Hex, ...Hex[]],
          data: event.log.data as Hex,
        })

        if (
          referrerIds &&
          !referrerIds.includes(decodedEvent.args.rewardsConsumer)
        ) {
          continue
        }

        referralEvents.push({
          protocol,
          userAddress: decodedEvent.args.user.toLowerCase(),
          referrerId: decodedEvent.args.rewardsConsumer.toLowerCase(),
          timestamp: Number(event.block.timestamp),
        })
      }
    },
  )

  return referralEvents
}
