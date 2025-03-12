import { Protocol, CalculateRevenueFn } from '../../types'
import { calculateRevenue as calculateRevenueAerodrome } from './aerodrome'
import { calculateRevenue as calculateRevenueBeefy } from './beefy'
import { calculateRevenue as calculateRevenueSomm } from './somm'

const calculateRevenueHandlers: Record<Protocol, CalculateRevenueFn> = {
  Beefy: calculateRevenueBeefy,
  Aerodrome: calculateRevenueAerodrome,
  Somm: calculateRevenueSomm,
}

export default calculateRevenueHandlers
