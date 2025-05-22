import { MatcherFn } from '../types'

export const filter: MatcherFn = async (
  event,
  { excludeList, failOnExclude } = {},
) => {
  if (!excludeList) {
    return !!event
  }

  const isExcluded = excludeList.some(
    (address) => address.toLowerCase() === event.referrerId.toLowerCase(),
  )

  const message = `Referral event with referrerId ${event.referrerId} is in the exclude list`

  if (isExcluded) {
    if (failOnExclude) {
      throw new Error(message)
    } else {
      console.warn(message)
    }
  }

  return !isExcluded
}
