import { Protocol, CalculateRevenueFn } from '../../types'
import { calculateRevenue as calculateRevenueAerodrome } from './aerodrome'
import { calculateRevenue as calculateRevenueBeefy } from './beefy'

const calculateRevenueHandlers: Record<Protocol, CalculateRevenueFn> = {
  Beefy: calculateRevenueBeefy,
  Aerodrome: calculateRevenueAerodrome,
}

export default calculateRevenueHandlers
