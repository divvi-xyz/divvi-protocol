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

// TODO(ENG-200): Implement the filter function
export async function filter(event: ReferralEvent): Promise<boolean> {
  return !!event
}
