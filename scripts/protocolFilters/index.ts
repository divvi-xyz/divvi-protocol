import { FilterFunction, Protocol, ReferralEvent } from '../types'
import { filter as filterBeefy } from './beefy'
import { filter as filterSomm } from './somm'

export const protocolFilters: Record<Protocol, FilterFunction> = {
  Beefy: _createFilter(filterBeefy),
  Somm: _createFilter(filterSomm),
}

function _createFilter(filter: (event: ReferralEvent) => Promise<boolean>) {
  return async function (events: ReferralEvent[]): Promise<ReferralEvent[]> {
    const filteredEvents = []
    for (const event of events) {
      if (await filter(event)) {
        filteredEvents.push(event)
      }
    }
    return filteredEvents
  }
}
