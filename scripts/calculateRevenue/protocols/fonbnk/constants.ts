import { NetworkId } from "../../../types";

export const TRANSACTION_VOLUME_USD_PRECISION = 8

export const FONBNK_API_URL = 'https://aten.fonbnk-services.com'

export enum FonbnkNetwork {
    CELO = 'CELO',
    ETHEREUM = 'ETHEREUM',
    POLYGON = 'POLYGON',
    BASE = 'BASE',
    OPTIMISM = 'OPTIMISM',
    ARBITRUM = 'ARBITRUM',
}

export const fonbnkNetworkToNetworkId: Record<FonbnkNetwork, NetworkId> = {
    [FonbnkNetwork.CELO]: NetworkId['celo-mainnet'],
    [FonbnkNetwork.ETHEREUM]: NetworkId['ethereum-mainnet'],
    [FonbnkNetwork.ARBITRUM]: NetworkId['arbitrum-one'],
    [FonbnkNetwork.OPTIMISM]: NetworkId['op-mainnet'],
    [FonbnkNetwork.POLYGON]: NetworkId['polygon-pos-mainnet'],
    [FonbnkNetwork.BASE]: NetworkId['base-mainnet'],
  }