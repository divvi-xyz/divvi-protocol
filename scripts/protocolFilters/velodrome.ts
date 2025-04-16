import {
  VELODROME_NETWORK_ID,
  VELODROME_UNIVERSAL_ROUTER_ADDRESS,
} from '../calculateRevenue/protocols/velodrome/constants'
import { ReferralEvent } from '../types'
import { filterDrome } from '../utils/filterDrome'

export async function filter(event: ReferralEvent): Promise<boolean> {
  return filterDrome({
    event,
    routerAddress: VELODROME_UNIVERSAL_ROUTER_ADDRESS,
    networkId: VELODROME_NETWORK_ID,
  })
}
