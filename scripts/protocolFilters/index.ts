import { FilterFunction, Protocol } from '../types'
import { filterEvents as filterBeefyEvents } from './beefy'
import { filterEvents as filterSommEvents } from './somm'

export const protocolFilters: Record<Protocol, FilterFunction> = {
  Beefy: filterBeefyEvents,
  Somm: filterSommEvents,
}
