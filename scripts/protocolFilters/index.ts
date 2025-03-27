import { FilterFunction, Protocol, ReferralEvent } from '../types'
import { filter as filterBeefy } from './beefy'
import { filter as filterAerodrome } from './aerodrome'
import { filter as filterSomm } from './somm'
import { filter as filterCelo } from './celo'
import { filter as filterArbitrum } from './arbitrum'
import { filter as filterVelodrome } from './velodrome'

export const protocolFilters: Record<Protocol, FilterFunction> = {
  beefy: _createFilter(filterBeefy),
  somm: _createFilter(filterSomm),
  aerodrome: _createFilter(filterAerodrome),
  celo: _createFilter(filterCelo),
  arbitrum: _createFilter(filterArbitrum),
  velodrome: _createFilter(filterVelodrome)
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
