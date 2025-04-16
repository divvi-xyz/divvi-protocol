import {
  AERODROME_NETWORK_ID,
  AERODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateRevenue/protocols/aerodrome/constants'
import { ReferralEvent } from '../types'
import { filterDrome } from '../utils/filterDrome'

export async function filter(event: ReferralEvent): Promise<boolean> {
  return filterDrome({
    event,
    routerAddress: AERODROME_UNIVERSAL_ROUTER_ADDRESS,
    networkId: AERODROME_NETWORK_ID,
  })
}
