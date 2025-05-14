import { Protocol, CalculateRevenueFn } from '../../types'
import { calculateRevenue as calculateRevenueAerodrome } from './aerodrome'
import { calculateRevenue as calculateRevenueBeefy } from './beefy'
import { calculateRevenue as calculateRevenueSomm } from './somm'
import { calculateRevenue as calculateRevenueCeloPG } from './celo-pg'
import { calculateRevenue as calculateRevenueArbitrum } from './arbitrum'
import { calculateRevenue as calculateRevenueVelodrome } from './velodrome'
import { calculateRevenue as calculateRevenueFonbnk } from './fonbnk'
import { calculateRevenue as calculateRevenueAave } from './aave'
import { calculateRevenue as calculateRevenueCeloTransactions } from './celoTransactions'
import { calculateRevenue as calculateRevenueRhino } from './rhino'

const calculateRevenueHandlers: Record<Protocol, CalculateRevenueFn> = {
  beefy: calculateRevenueBeefy,
  aerodrome: calculateRevenueAerodrome,
  somm: calculateRevenueSomm,
  'celo-pg': calculateRevenueCeloPG,
  arbitrum: calculateRevenueArbitrum,
  velodrome: calculateRevenueVelodrome,
  fonbnk: calculateRevenueFonbnk,
  aave: calculateRevenueAave,
  'celo-transactions': calculateRevenueCeloTransactions,
  rhino: calculateRevenueRhino,
}

export default calculateRevenueHandlers
