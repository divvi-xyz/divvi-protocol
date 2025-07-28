import '@nomicfoundation/hardhat-viem'
import '@nomicfoundation/hardhat-toolbox-viem'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@openzeppelin/hardhat-upgrades'
import { HardhatUserConfig } from 'hardhat/config'
import { HDAccountsUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'
import './tasks/registry'
import './tasks/rewardPool'
import './tasks/mockToken'
import './tasks/divviRegistry'
import './tasks/dataAvailability'
import './tasks/rewardPoolFactory'

dotenv.config()

const accounts: HDAccountsUserConfig = {
  mnemonic:
    process.env.MNEMONIC ||
    'test test test test test test test test test test test junk',
}

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  defender: {
    apiKey: process.env.DEFENDER_API_KEY!,
    apiSecret: process.env.DEFENDER_API_SECRET!,
  },
  networks: {
    alfajores: {
      url: 'https://alfajores-forno.celo-testnet.org',
      accounts,
      chainId: 44787,
    },
    celo: {
      url: 'https://forno.celo.org',
      accounts,
      chainId: 42220,
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/public`,
      accounts,
      chainId: 1,
    },
    arbitrum: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts,
      chainId: 42161,
    },
    op: {
      url: 'https://mainnet.optimism.io',
      accounts,
      chainId: 10,
    },
    base: {
      url: 'https://base-rpc.publicnode.com',
      accounts,
      chainId: 8453,
    },
    berachain: {
      url: 'https://berachain-rpc.publicnode.com',
      accounts,
      chainId: 80094,
    },
    polygon: {
      url: 'https://rpc.ankr.com/polygon',
      accounts,
      chainId: 137,
    },
    mantle: {
      url: 'https://mantle-mainnet.g.alchemy.com/public',
      accounts,
      chainId: 5000,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!,
    customChains: [
      {
        network: 'alfajores',
        chainId: 44787,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://alfajores.celoscan.io',
        },
      },
      {
        network: 'celo',
        chainId: 42220,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://celoscan.io/',
        },
      },
      {
        network: 'berachain',
        chainId: 80094,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://berascan.com/',
        },
      },
      {
        network: 'mantle',
        chainId: 5000,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://mantlescan.xyz/',
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
}

export default config
