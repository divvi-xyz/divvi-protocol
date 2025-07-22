import {
  AERODROME_NETWORK_ID,
  AERODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateKpi/protocols/aerodrome/constants'
import { MatcherFn } from '../types'
import { filterDrome } from '../utils/filterDrome'

export const filter: MatcherFn = async (event) => {
  return filterDrome({
    event,
    routerAddress: AERODROME_UNIVERSAL_ROUTER_ADDRESS,
    networkId: AERODROME_NETWORK_ID,
  })
}
