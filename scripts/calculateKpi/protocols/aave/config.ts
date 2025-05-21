import {
  AaveV3Arbitrum,
  AaveV3Base,
  AaveV3Celo,
  AaveV3Ethereum,
  AaveV3Optimism,
} from '@bgd-labs/aave-address-book'
import { NetworkId } from '../../../types'
import { Address } from 'viem'

export interface SupportedNetwork {
  networkId: NetworkId
  poolAddress: Address
  poolConfiguratorAddress: Address
  oracleAddress: Address
  subgraphId: string
}

export const SUBGRAPH_BASE_URL =
  'https://gateway.thegraph.com/api/subgraphs/id/'
export const THE_GRAPH_API_KEY = process.env.THE_GRAPH_API_KEY

export const SUPPORTED_NETWORKS: SupportedNetwork[] = [
  {
    networkId: NetworkId['arbitrum-one'],
    poolAddress: AaveV3Arbitrum.POOL,
    poolConfiguratorAddress: AaveV3Arbitrum.POOL_CONFIGURATOR,
    oracleAddress: AaveV3Arbitrum.ORACLE,
    subgraphId: 'DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B',
  },
  {
    networkId: NetworkId['base-mainnet'],
    poolAddress: AaveV3Base.POOL,
    poolConfiguratorAddress: AaveV3Base.POOL_CONFIGURATOR,
    oracleAddress: AaveV3Base.ORACLE,
    subgraphId: 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF',
  },
  {
    networkId: NetworkId['celo-mainnet'],
    poolAddress: AaveV3Celo.POOL,
    poolConfiguratorAddress: AaveV3Celo.POOL_CONFIGURATOR,
    oracleAddress: AaveV3Celo.ORACLE,
    subgraphId: 'GAVWZzGwQ6d6QbFojyFWxpZ2GB9Rf5hZgGyJHCEry8kn',
  },
  {
    networkId: NetworkId['ethereum-mainnet'],
    poolAddress: AaveV3Ethereum.POOL,
    poolConfiguratorAddress: AaveV3Ethereum.POOL_CONFIGURATOR,
    oracleAddress: AaveV3Ethereum.ORACLE,
    subgraphId: 'Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g',
  },
  {
    networkId: NetworkId['op-mainnet'],
    poolAddress: AaveV3Optimism.POOL,
    poolConfiguratorAddress: AaveV3Optimism.POOL_CONFIGURATOR,
    oracleAddress: AaveV3Optimism.ORACLE,
    subgraphId: 'DSfLz8oQBUeU5atALgUFQKMTSYV9mZAVYp4noLSXAfvb',
  },
]
