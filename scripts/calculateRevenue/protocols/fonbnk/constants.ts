import { encodeEventTopics, erc20Abi } from 'viem'
import { NetworkId } from '../../../types'
import { FonbnkNetwork } from './types'

export const TRANSACTION_VOLUME_USD_PRECISION = 8

export const FONBNK_API_URL = 'https://aten.fonbnk-services.com'

// Gets transfer topic hash, should be 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
export const TRANSFER_TOPIC = encodeEventTopics({
  abi: erc20Abi,
  eventName: 'Transfer',
})[0]

export const fonbnkNetworkToNetworkId: Record<FonbnkNetwork, NetworkId> = {
  CELO: NetworkId['celo-mainnet'],
  ETHEREUM: NetworkId['ethereum-mainnet'],
  ARBITRUM: NetworkId['arbitrum-one'],
  OPTIMISM: NetworkId['op-mainnet'],
  POLYGON: NetworkId['polygon-pos-mainnet'],
  BASE: NetworkId['base-mainnet'],
}
