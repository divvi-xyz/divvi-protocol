import { Address } from 'viem'
import { Protocol, NetworkId } from '../scripts/types'

export type Campaign = {
  providerAddress: Address
  protocol: Protocol
  rewardsPoolAddress: Address
  networkId: NetworkId
  valoraRewardsPoolAddress: Address | null
}

export const campaigns: Campaign[] = [
  {
    providerAddress: '0x0423189886d7966f0dd7e7d256898daeee625dca',
    protocol: 'celo-pg',
    rewardsPoolAddress: '0xc273fb49c5c291f7c697d0fcef8ce34e985008f3',
    networkId: NetworkId['celo-mainnet'],
    valoraRewardsPoolAddress: null,
  },
  {
    providerAddress: '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
    protocol: 'scout-game-v0',
    rewardsPoolAddress: '0x6f599b879541d289e344e325f4d9badf8c5bb49e',
    networkId: NetworkId['base-mainnet'],
    valoraRewardsPoolAddress: null,
  },
  {
    providerAddress: '0x7beb0e14f8d2e6f6678cc30d867787b384b19e20',
    protocol: 'lisk-v0',
    rewardsPoolAddress: '0xbbf7b15c819102b137a96703e63ecf1c3d57cc68',
    networkId: NetworkId['lisk-mainnet'],
    valoraRewardsPoolAddress: null,
  },
  {
    providerAddress: '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8',
    protocol: 'celo-transactions',
    rewardsPoolAddress: '0xe2bedafb063e0b7f12607ebcf4636e2690a427a3',
    networkId: NetworkId['celo-mainnet'],
    valoraRewardsPoolAddress: null,
  },
  {
    providerAddress: '0xce56ed47c8f2ee8714087c9e48924b1a30bc455c',
    protocol: 'base-v0',
    rewardsPoolAddress: '0xa2a4c1eb286a2efa470d42676081b771bbe9c1c8',
    networkId: NetworkId['base-mainnet'],
    valoraRewardsPoolAddress: null,
  },
]
