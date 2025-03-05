import { ReferralEvent } from '../types'

export async function filterEvents(
  events: ReferralEvent[],
): Promise<ReferralEvent[]> {
  const filteredEvents = []
  for (const event of events) {
    if (await filter(event)) {
      filteredEvents.push(event)
    }
  }
  return filteredEvents
}

// TODO(): Check that the user has made at least one transaction on Aerodrome,
// and all transactions were made after the referral event.
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
