import { Address } from 'viem'
import { ReferralEvent } from '../types'

export async function filter(
  event: ReferralEvent,
  allowList?: Address[],
): Promise<boolean> {
  return allowList
    ? allowList.some((address) => address === event.referrerId)
    : true
}
