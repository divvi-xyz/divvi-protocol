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
import { Address } from 'viem'

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
}

function _createFilter(
  filter: (
    event: ReferralEvent,
    builderAllowList?: Address[],
  ) => Promise<boolean>,
) {
  return async function (
    events: ReferralEvent[],
    builderAllowList?: Address[],
  ): Promise<ReferralEvent[]> {
    const filteredEvents = []
    for (const event of events) {
      if (await filter(event, builderAllowList)) {
        filteredEvents.push(event)
      }
    }
    return filteredEvents
  }
}
