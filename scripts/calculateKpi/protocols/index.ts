import { Protocol, CalculateKpiFn } from '../../types'
import { calculateKpi as calculateKpiAerodrome } from './aerodrome'
import { calculateKpi as calculateKpiBeefy } from './beefy'
import { calculateKpi as calculateKpiSomm } from './somm'
import { calculateKpi as calculateKpiCeloPG } from './celo-pg'
import { calculateKpi as calculateKpiArbitrum } from './arbitrum'
import { calculateKpi as calculateKpiVelodrome } from './velodrome'
import { calculateKpi as calculateKpiFonbnk } from './fonbnk'
import { calculateKpi as calculateKpiAave } from './aave'
import { calculateKpi as calculateKpiCeloTransactions } from './celoTransactions'
import { calculateKpi as calculateKpiRhino } from './rhino'
import { calculateKpi as calculateKpiScoutGameV0 } from './scoutGameV0'
import { calculateKpi as calculateKpiLiskV0 } from './liskV0'

const calculateKpiHandlers: Record<Protocol, CalculateKpiFn> = {
  beefy: calculateKpiBeefy,
  aerodrome: calculateKpiAerodrome,
  somm: calculateKpiSomm,
  'celo-pg': calculateKpiCeloPG,
  arbitrum: calculateKpiArbitrum,
  velodrome: calculateKpiVelodrome,
  fonbnk: calculateKpiFonbnk,
  aave: calculateKpiAave,
  'celo-transactions': calculateKpiCeloTransactions,
  rhino: calculateKpiRhino,
  'scout-game-v0': calculateKpiScoutGameV0,
  'lisk-v0': calculateKpiLiskV0,
}

export default calculateKpiHandlers
