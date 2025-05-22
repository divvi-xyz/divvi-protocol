import { MatcherFn } from '../types'

// TODO: Implement Aave filter
export const filter: MatcherFn = async (event) => {
  return !!event
}
