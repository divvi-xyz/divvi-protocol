import { Address } from 'viem'
import { SupportedNetwork } from '../config'
import { getBlockRange } from '../../utils/events'
import { getReserveData } from './pool'
import { getReserveFactorHistory } from './reserveFactor'
import { getATokenScaledBalances } from './aToken'
import { getATokenScaledBalanceHistory } from './subgraph'
import { getUSDPrices } from './oracle'

export async function fetchBlockchainData(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestampExclusive: Date,
) {
  const {
    networkId,
    poolAddress,
    poolConfiguratorAddress,
    oracleAddress,
    subgraphId,
  } = network

  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId,
    startTimestamp,
    endTimestampExclusive,
  })
  // For state at the end of the period, use the last inclusive block
  const endBlockInclusive = endBlockExclusive - 1

  const [startReserveData, endReserveData, reserveFactorHistory] =
    await Promise.all([
      getReserveData(networkId, poolAddress, startBlock),
      getReserveData(networkId, poolAddress, endBlockInclusive),
      getReserveFactorHistory({
        networkId,
        poolConfiguratorAddress,
        startBlock,
        endBlockExclusive,
      }),
    ])

  // We expect the end reserve data to include all tokens involved during the period
  const allReserveTokenAddresses = [...endReserveData.keys()]
  const allATokenAddresses = [...endReserveData.values()].map(
    (data) => data.aTokenAddress,
  )

  const [startBalances, balanceHistory, tokenUSDPrices] = await Promise.all([
    getATokenScaledBalances(
      networkId,
      userAddress,
      allATokenAddresses,
      startBlock,
    ),
    getATokenScaledBalanceHistory({
      subgraphId,
      userAddress,
      startTimestamp,
      endTimestampExclusive,
    }),
    getUSDPrices({
      networkId,
      oracleAddress,
      tokenAddresses: allReserveTokenAddresses,
      blockNumber: endBlockInclusive,
    }),
  ])

  return {
    startReserveData,
    endReserveData,
    reserveFactorHistory,
    startBalances,
    balanceHistory,
    tokenUSDPrices,
  }
}
