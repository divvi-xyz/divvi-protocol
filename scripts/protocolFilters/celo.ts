import { ReferralEvent } from '../types'

// TODO(ENG-200): Implement the filter function
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
