import { FilterFunction, Protocol } from '../types'
import { filterEvents as filterBeefyEvents } from './beefy'
import { filterEvents as filterAerodromeEvents } from './aerodrome'

export const protocolFilters: Record<Protocol, FilterFunction> = {
  Beefy: filterBeefyEvents,
  Aerodrome: filterAerodromeEvents,
}
