import { ReferralEvent } from '../types'

// TODO: Add in same filtering as with aerodrome
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
