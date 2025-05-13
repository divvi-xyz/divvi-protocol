import { Address } from 'viem'
import { ReferralEvent } from '../types'

export async function filter(
  event: ReferralEvent,
  referrerAllowList?: Address[],
): Promise<boolean> {
  return referrerAllowList
    ? referrerAllowList.some((address) => address === event.referrerId)
    : true
}
