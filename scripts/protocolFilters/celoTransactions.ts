import { Address } from 'viem'
import { ReferralEvent } from '../types'

export async function filter(
  event: ReferralEvent,
  builderAllowList?: Address[],
): Promise<boolean> {
  return builderAllowList
    ? builderAllowList.some((address) => address === event.referrerId)
    : true
}
