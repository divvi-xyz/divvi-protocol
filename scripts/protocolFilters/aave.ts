import { ReferralEvent } from '../types'

// TODO: Implement Aave filter
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
