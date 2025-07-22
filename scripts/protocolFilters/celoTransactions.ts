import { Address } from 'viem'
import { MatcherFn } from '../types'

const KNOWN_BUILDERS: Address[] = ['0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5']

export const filter: MatcherFn = async (event, { allowList } = {}) => {
  // If no allow list is provided, default to accept all referrals
  if (!allowList) {
    return true
  }
  return KNOWN_BUILDERS.concat(allowList).some(
    (address) => address.toLowerCase() === event.referrerId.toLowerCase(),
  )
}
