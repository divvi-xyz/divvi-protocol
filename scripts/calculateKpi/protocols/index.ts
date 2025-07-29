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
import { calculateKpi as calculateKpiTetherV0 } from './tetherV0'
import { calculateKpi as calculateKpiBaseV0 } from './baseV0'
import { calculateKpi as calculateKpiMantleV0 } from './mantleV0'
import { calculateKpi as calculateKpiMorph } from './morph'

/**
 * Central registry of KPI calculation handlers for all supported protocols.
 *
 * **KPI Unit**: Mixed units - USD revenue for DeFi protocols, transaction counts for activity-based metrics, gas usage for infrastructure
 *
 * **Business Purpose**: Maps protocol identifiers to their respective KPI calculation functions,
 * enabling automated revenue and usage tracking across different DeFi protocols and blockchain applications.
 *
 * **Supported Protocol KPIs**:
 * - **DeFi Protocols (USD Revenue)**: Aerodrome, Velodrome (DEX trading fees), Beefy (vault management fees), Aave (lending protocol revenue), Somm (strategy fees)
 * - **Activity Metrics (Transaction Count)**: Scout Game V0 (user engagement), Celo Transactions (network usage)
 * - **Infrastructure Metrics**: Celo PG (gas usage), Arbitrum (network activity), Fonbnk (transaction volume)
 *
 * **Data Sources**:
 * - On-chain transaction data via HyperSync clients
 * - DEX swap events and liquidity pool interactions
 * - Token price feeds for USD conversion
 * - Block timestamp data for time-based filtering
 *
 * **Business Assumptions**:
 * - Revenue attribution based on user transaction activity within specified time windows
 * - Token prices fetched at transaction timestamps for accurate USD conversion
 * - Protocol-specific fee structures and revenue sharing models are hardcoded per protocol
 */
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
  'tether-v0': calculateKpiTetherV0,
  'base-v0': calculateKpiBaseV0,
  'mantle-v0': calculateKpiMantleV0,
  morph: calculateKpiMorph,
}

export default calculateKpiHandlers
