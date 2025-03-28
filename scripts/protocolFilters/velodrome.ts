import { ReferralEvent } from '../types'

// TODO (ENG-270): Add in same filtering as with aerodrome
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
