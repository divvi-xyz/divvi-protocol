import {
  VELODROME_NETWORK_ID,
  VELODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateKpi/protocols/velodrome/constants'
import { MatcherFn } from '../types'
import { filterDrome } from '../utils/filterDrome'

export const filter: MatcherFn = async (event) => {
  return filterDrome({
    event,
    routerAddress: VELODROME_UNIVERSAL_ROUTER_ADDRESS,
    networkId: VELODROME_NETWORK_ID,
  })
}
