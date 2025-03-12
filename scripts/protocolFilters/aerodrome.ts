import { ReferralEvent } from '../types'

// TODO(ENG-194): Check that the user has made at least one transaction on Aerodrome,
// and all transactions were made after the referral event.
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
