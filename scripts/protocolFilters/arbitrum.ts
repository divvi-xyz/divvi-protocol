import { ReferralEvent } from '../types'

export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
