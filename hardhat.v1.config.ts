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
    vana: {
      url: 'https://rpc.vana.org',
      accounts,
      chainId: 1480,
    },
    morph: {
      url: 'https://rpc-quicknode.morphl2.io',
      accounts,
      chainId: 2818,
    },
  },
  etherscan: {
    apiKey: {
      vana: process.env.VANASCAN_API_KEY!,
      morph: 'anything', // Per https://docs.morphl2.io/docs/build-on-morph/build-on-morph/verify-your-smart-contracts#verify-with-hardhat
    },
    customChains: [
      {
        network: 'vana',
        chainId: 1480,
        urls: {
          apiURL: 'https://vanascan.io/api',
          browserURL: 'https://vanascan.io/',
        },
      },
      {
        network: 'morph',
        chainId: 2818,
        urls: {
          apiURL: 'https://explorer-api.morphl2.io/api? ',
          browserURL: 'https://explorer.morphl2.io/',
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
}

export default config
