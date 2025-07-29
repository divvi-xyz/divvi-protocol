import {
  FilterFn,
  Protocol,
  MatcherFn,
  FilterParams,
  ReferralEvent,
} from '../types'
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
import { filter as filterScoutGameV0 } from './scoutGameV0'
import { filter as filterLiskV0 } from './lisk-v0'
import { filter as filterTetherV0 } from './tether-v0'
import { filter as filterBaseV0 } from './baseV0'
import { filter as filterMantleV0 } from './mantleV0'
import { filter as filterMorph } from './morph'

export const protocolFilters: Record<Protocol, FilterFn> = {
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
  'scout-game-v0': _createFilter(filterScoutGameV0),
  'lisk-v0': _createFilter(filterLiskV0),
  'tether-v0': _createFilter(filterTetherV0),
  'base-v0': _createFilter(filterBaseV0),
  'mantle-v0': _createFilter(filterMantleV0),
  morph: _createFilter(filterMorph),
}

const BATCH_SIZE = 20

function _createFilter(matcher: MatcherFn) {
  return async function (
    events: ReferralEvent[],
    filterParams?: FilterParams,
  ): Promise<ReferralEvent[]> {
    const filteredEvents = []

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (event) => {
          if (await matcher(event, filterParams)) {
            return event
          }
          return null
        }),
      )
      const filteredBatchResults = batchResults.filter((event) => !!event)
      filteredEvents.push(...filteredBatchResults)
    }

    return filteredEvents
  }
}
