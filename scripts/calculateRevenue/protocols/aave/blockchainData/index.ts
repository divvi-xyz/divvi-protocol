import { Address } from 'viem'
import { SupportedNetwork } from '../config'
import { getNearestBlock } from '../../utils/events'
import { getReserveData } from './pool'
import { getReserveFactorHistory } from './reserveFactor'
import { getATokenScaledBalances } from './aToken'
import { getATokenScaledBalanceHistory } from './subgraph'
import { getUSDPrices } from './oracle'

export async function fetchBlockchainData(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestamp: Date,
) {
  const {
    networkId,
    poolAddress,
    poolConfiguratorAddress,
    oracleAddress,
    subgraphId,
  } = network

  const [startBlock, endBlock] = await Promise.all([
    getNearestBlock(networkId, startTimestamp),
    getNearestBlock(networkId, endTimestamp),
  ])

  const [startReserveData, endReserveData, reserveFactorHistory] =
    await Promise.all([
      getReserveData(networkId, poolAddress, startBlock),
      getReserveData(networkId, poolAddress, endBlock),
      getReserveFactorHistory({
        networkId,
        poolConfiguratorAddress,
        startBlock,
        endBlock,
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
      endTimestamp,
    }),
    getUSDPrices({
      networkId,
      oracleAddress,
      tokenAddresses: allReserveTokenAddresses,
      blockNumber: endBlock,
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
