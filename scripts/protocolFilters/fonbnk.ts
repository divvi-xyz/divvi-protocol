import { ReferralEvent } from '../types'

// TODO(ENG-272): Implement filter function
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
