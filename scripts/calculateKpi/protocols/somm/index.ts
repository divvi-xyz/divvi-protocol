import { Address, erc20Abi, formatUnits, getContract, isAddress } from 'viem'
import { getViemPublicClient } from '../../../utils'
import { getVaults } from './getVaults'
import { VaultInfo } from './types'
import { getEvents } from './getEvents'
import {
  calculateWeightedAveragePrice,
  getDailySnapshots,
} from './dailySnapshots'
import { KpiResultByReferrerId } from '../../../types'

const REWARDS_PERCENTAGE = 0.1 // 10%
export const ONE_YEAR = 365 * 24 * 60 * 60 * 1000

/**
 * Retrieves the current token balance of a user address in a specific Sommelier vault.
 *
 * **Business Purpose**: Determines the current vault token balance for use in TVL calculations
 * and temporal balance tracking across deposit/withdrawal events.
 *
 * @internal
 * @param vaultInfo - Vault configuration and metadata
 * @param address - User wallet address to query balance for
 * @returns Promise resolving to user's current vault token balance (in vault token units)
 */
export async function getBalanceOfAddress({
  vaultInfo,
  address,
}: {
  vaultInfo: VaultInfo
  address: Address
}) {
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: erc20Abi,
    client,
  })
  return vaultContract.read.balanceOf([address])
}

/**
 * Calculates the Total Value Locked (TVL) for a given user address prorated for a year.
 *
 * **Business Purpose**: Computes the time-weighted TVL for a user's position in a Sommelier vault,
 * accounting for deposits and withdrawals over time. This forms the basis for strategy fee revenue
 * attribution based on user's proportional vault participation.
 *
 * **Calculation Method**:
 * 1. Tracks user's vault token balance changes through historical events
 * 2. Calculates time-weighted average TVL using daily price snapshots
 * 3. Prorates the TVL contribution over a yearly basis for standardized comparison
 * 4. Accounts for vault token price fluctuations during the period
 *
 * **Time-Weighting**: Uses milliseconds as the base unit for precise temporal calculations,
 * tracking how long each balance amount was held and at what vault token price.
 *
 * @internal
 * @param vaultInfo - Vault configuration including address and network
 * @param address - User wallet address to calculate TVL for
 * @param startTimestamp - Start of calculation period (inclusive)
 * @param endTimestampExclusive - End of calculation period (exclusive)
 * @param nowTimestamp - Current timestamp for balance calculations
 * @returns Promise resolving to annualized time-weighted TVL in USD
 *
 * @throws Error if endTimestampExclusive is in the future relative to nowTimestamp
 */
export async function getTvlProratedPerYear({
  vaultInfo,
  address,
  startTimestamp,
  endTimestampExclusive,
  nowTimestamp,
}: {
  vaultInfo: VaultInfo
  address: Address
  startTimestamp: Date
  endTimestampExclusive: Date
  nowTimestamp: Date
}) {
  if (endTimestampExclusive.getTime() > nowTimestamp.getTime()) {
    throw new Error('Cannot have an endTimestampExclusive in the future')
  }
  const client = getViemPublicClient(vaultInfo.networkId)
  const vaultContract = getContract({
    address: vaultInfo.vaultAddress,
    abi: erc20Abi,
    client,
  })
  const currentLPTokenBalance = await vaultContract.read.balanceOf([address])
  const tokenDecimals = await vaultContract.read.decimals()

  const dailySnapshots = await getDailySnapshots({
    networkId: vaultInfo.networkId,
    vaultAddress: vaultInfo.vaultAddress,
    startTimestamp,
    endTimestampExclusive,
  })

  const tvlEvents = await getEvents({
    address,
    vaultInfo,
    startTimestamp,
    endTimestampExclusive: nowTimestamp,
  })

  let prevTimestamp = nowTimestamp
  let tvlMilliseconds = 0 // think killowatt hours
  let currentTvl = Number(formatUnits(currentLPTokenBalance, tokenDecimals))

  // Loop through the TVL events in reverse chronological order keeping track of the user's TVL as
  // different TVL events occur (withdaws and deposits) and adding up the total TVL milliseconds within the start and end timestamps
  for (const tvlEvent of tvlEvents) {
    // the default case is that the previous event and current event are outside of the time range
    let timeInRange = 0
    let priceInRange = 0

    // if the previous event is outside of the time range and the current event is inside the time range
    if (
      prevTimestamp.getTime() >= endTimestampExclusive.getTime() &&
      tvlEvent.timestamp.getTime() < endTimestampExclusive.getTime()
    ) {
      timeInRange = getTimeInRange(tvlEvent.timestamp, endTimestampExclusive)
      priceInRange = calculateWeightedAveragePrice({
        snapshots: dailySnapshots,
        startTimestamp: prevTimestamp,
        endTimestampExclusive,
      })
    }
    // else the events are both inside the time range
    else if (tvlEvent.timestamp.getTime() < endTimestampExclusive.getTime()) {
      timeInRange = getTimeInRange(tvlEvent.timestamp, prevTimestamp)
      priceInRange = calculateWeightedAveragePrice({
        snapshots: dailySnapshots,
        startTimestamp: tvlEvent.timestamp,
        endTimestampExclusive: prevTimestamp,
      })
    }
    tvlMilliseconds += timeInRange * currentTvl * priceInRange
    currentTvl -= tvlEvent.amount
    prevTimestamp = tvlEvent.timestamp
  }
  tvlMilliseconds +=
    getTimeInRange(startTimestamp, prevTimestamp) *
    currentTvl *
    calculateWeightedAveragePrice({
      snapshots: dailySnapshots,
      startTimestamp,
      endTimestampExclusive: prevTimestamp,
    })
  return tvlMilliseconds / ONE_YEAR
}

/**
 * Utility function to calculate time duration within a specified range.
 *
 * **Business Purpose**: Helper function for time-weighted TVL calculations,
 * ensuring accurate temporal measurements for vault participation periods.
 *
 * @internal
 * @param startTimestamp - Start of time range
 * @param endTimestampExclusive - End of time range (exclusive)
 * @returns Duration in milliseconds between timestamps
 */
function getTimeInRange(startTimestamp: Date, endTimestampExclusive: Date) {
  return endTimestampExclusive.getTime() - startTimestamp.getTime()
}

/**
 * Calculates reward allocation based on user's time-weighted TVL in Sommelier protocol.
 *
 * **KPI Unit**: USD (United States Dollars)
 *
 * **Business Purpose**: Measures the reward allocation for a specific user based on their
 * time-weighted TVL across Sommelier strategy vaults. This metric quantifies the user's
 * proportional participation in Sommelier's active yield strategies and determines their
 * reward share.
 *
 * **Protocol Context**: Sommelier is a decentralized asset management platform that runs active yield
 * strategies on Ethereum. Users are rewarded based on their time-weighted TVL in the protocol's
 * strategy vaults.
 *
 * **Network**: Ethereum Mainnet (and networks where Sommelier has deployed strategy vaults)
 *
 * **Data Sources**:
 * - **Sommelier API**: Strategy vault data, performance metrics, and metadata from Sommelier's API
 * - **RPC Queries**: User deposit/withdrawal events via Viem public client calls to strategy vault contracts
 * - **Token Price API**: Historical token prices via `fetchTokenPrices` utility for USD conversion
 * - **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
 * - **Vault Contracts**: Time-weighted TVL calculations and share price data from strategy vault contracts
 *
 * **Business Assumptions**:
 * - Reward rate is 10% of user's time-weighted TVL
 * - Reward attribution is proportional to user's time-weighted deposits within strategy vaults
 * - USD conversion uses token prices at time of each transaction for accuracy
 * - Only active strategy vaults are included in calculations
 * - Reward distribution follows time-weighted calculation based on vault share ownership
 *
 * **Reward Structure**: 10% of time-weighted TVL (standard reward rate for protocol participation)
 *
 * **Calculation Method**:
 * 1. Retrieves active strategy vault configurations from Sommelier API
 * 2. Filters vaults by Ethereum network and active status
 * 3. For each vault, queries user's deposit/withdrawal events within time window
 * 4. Calculates user's time-weighted share of vault deposits using share price history
 * 5. Applies 10% reward rate to user's proportional vault activity
 * 6. Converts to USD using historical token prices at transaction timestamps
 * 7. Aggregates rewards across all strategy vaults for total allocation
 *
 * @param params - Calculation parameters
 * @param params.address - User wallet address to calculate rewards for
 * @param params.startTimestamp - Start of time window for reward calculation (inclusive)
 * @param params.endTimestampExclusive - End of time window for reward calculation (exclusive)
 * @param params.referrerId - Referrer identifier for result attribution
 *
 * @returns Promise resolving to total reward allocation in USD per referrerId
 */
export async function calculateKpi({
  address,
  startTimestamp,
  endTimestampExclusive,
  referrerId,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
  referrerId: string
}): Promise<KpiResultByReferrerId> {
  if (!isAddress(address)) {
    throw new Error('Invalid address')
  }
  const vaultsInfo = await getVaults()

  let totalRevenue = 0
  const nowTimestamp = new Date()
  for (const vaultInfo of vaultsInfo) {
    const vaultRevenue = await getTvlProratedPerYear({
      vaultInfo,
      address,
      startTimestamp,
      endTimestampExclusive,
      nowTimestamp,
    })
    totalRevenue += vaultRevenue
  }
  return {
    [referrerId]: { kpi: totalRevenue * REWARDS_PERCENTAGE, referrerId },
  }
}
