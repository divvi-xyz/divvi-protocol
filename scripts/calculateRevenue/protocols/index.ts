import { Protocol, CalculateRevenueFn } from '../../types'
import { calculateRevenue as calculateRevenueAerodrome } from './aerodrome'
import { calculateRevenue as calculateRevenueBeefy } from './beefy'
import { calculateRevenue as calculateRevenueSomm } from './somm'
import { calculateRevenue as calculateRevenueCelo } from './celo'

const calculateRevenueHandlers: Record<Protocol, CalculateRevenueFn> = {
  beefy: calculateRevenueBeefy,
  aerodrome: calculateRevenueAerodrome,
  somm: calculateRevenueSomm,
  celo: calculateRevenueCelo,
}

export default calculateRevenueHandlers
