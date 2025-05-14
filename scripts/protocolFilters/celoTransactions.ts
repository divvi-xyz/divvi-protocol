import { Address } from 'viem'
import { ReferralEvent } from '../types'

const KNOWN_BUILDERS: Address[] = ['0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5']

export async function filter(
  event: ReferralEvent,
  builderAllowList?: Address[],
): Promise<boolean> {
  const allAllowlistedBuilders = KNOWN_BUILDERS.concat(builderAllowList ?? [])
  return allAllowlistedBuilders.some(
    (address) => address.toLowerCase() === event.referrerId.toLowerCase(),
  )
}
