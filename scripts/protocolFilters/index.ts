import { FilterFunction, Protocol, ReferralEvent } from '../types'
import { filter as filterBeefy } from './beefy'
import { filter as filterAerodrome } from './aerodrome'
import { filter as filterSomm } from './somm'
import { filter as filterCeloPG } from './celo-pg'
import { filter as filterArbitrum } from './arbitrum'
import { filter as filterVelodrome } from './velodrome'
import { filter as filterFonbnk } from './fonbnk'
import { filter as filterAave } from './aave'
import { filter as filterCeloTransactions } from './celoTransactions'
import { filter as filterRhino } from './rhino'

export const protocolFilters: Record<Protocol, FilterFunction> = {
  beefy: _createFilter(filterBeefy),
  somm: _createFilter(filterSomm),
  aerodrome: _createFilter(filterAerodrome),
  'celo-pg': _createFilter(filterCeloPG),
  arbitrum: _createFilter(filterArbitrum),
  velodrome: _createFilter(filterVelodrome),
  fonbnk: _createFilter(filterFonbnk),
  aave: _createFilter(filterAave),
  'celo-transactions': _createFilter(filterCeloTransactions),
  rhino: _createFilter(filterRhino),
}

function _createFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (event: ReferralEvent, ...args: any[]) => Promise<boolean>,
) {
  return async function (
    events: ReferralEvent[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<ReferralEvent[]> {
    const filteredEvents = []
    for (const event of events) {
      if (await filter(event, ...args)) {
        filteredEvents.push(event)
      }
    }
    return filteredEvents
  }
}
