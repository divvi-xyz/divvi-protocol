import { MatcherFn } from '../types'

export const filter: MatcherFn = async (event) => {
  return !!event
}
