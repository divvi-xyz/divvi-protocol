import { Address } from 'viem'
import { ReferralEvent } from '../types'

const KNOWN_BUILDERS: Address[] = []

export async function filter(
  event: ReferralEvent,
  builderAllowList?: Address[],
): Promise<boolean> {
  const allAllowlistedBuilders = KNOWN_BUILDERS.concat(builderAllowList ?? [])
  return allAllowlistedBuilders.some(
    (address) => address.toLowerCase() === event.referrerId.toLowerCase(),
  )
}
