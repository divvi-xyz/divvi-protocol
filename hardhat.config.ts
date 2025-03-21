import '@nomicfoundation/hardhat-viem'
import '@nomicfoundation/hardhat-toolbox-viem'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@openzeppelin/hardhat-upgrades'
import { HardhatUserConfig, task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment, HDAccountsUserConfig } from 'hardhat/types'
import * as dotenv from 'dotenv'
import { ethers } from 'ethers'

dotenv.config()

const accounts: HDAccountsUserConfig = {
  mnemonic:
    process.env.MNEMONIC ||
    'test test test test test test test test test test test junk',
}

const SUPPORTED_NETWORKS = [
  'celo',
  'mainnet',
  'arbitrum',
  'polygon',
  'op',
  'base',
  'berachain',
  'vana',
]

const ONE_DAY = 60 * 60 * 24

task('deploy-registry', 'Deploy Registry contract')
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    if (
      taskArgs.useDefender &&
      !SUPPORTED_NETWORKS.includes(hre.network.name)
    ) {
      throw Error(
        `--use-defender only supports networks: ${SUPPORTED_NETWORKS}`,
      )
    }

    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    await deployContract(hre, 'Registry', [ownerAddress, ONE_DAY], {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })

task('deploy-reward-pool', 'Deploy RewardPool contract')
  .addParam('poolToken', 'Address of the token used for rewards')
  .addOptionalParam('managerAddress', 'Address that will have MANAGER_ROLE')
  .addOptionalParam('rewardFunction', 'Identifier of the reward function')
  .addOptionalParam(
    'timelock',
    'Timestamp when manager withdrawals will be allowed',
    0,
    types.int,
  )
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    if (
      taskArgs.useDefender &&
      !SUPPORTED_NETWORKS.includes(hre.network.name)
    ) {
      throw Error(
        `--use-defender only supports networks: ${SUPPORTED_NETWORKS}`,
      )
    }

    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    const managerAddress = taskArgs.managerAddress || ownerAddress

    const rewardFunctionId = ethers.zeroPadValue(
      taskArgs.rewardFunction || '0x00',
      32,
    )

    await deployContract(
      hre,
      'RewardPool',
      [
        taskArgs.poolToken,
        rewardFunctionId,
        ownerAddress,
        ONE_DAY,
        managerAddress,
        taskArgs.timelock,
      ],
      {
        isUpgradeable: true,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })

task('upgrade-reward-pool', 'Upgrade RewardPool contract')
  .addParam('proxyAddress', 'Address of the token used for rewards')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    if (
      taskArgs.useDefender &&
      !SUPPORTED_NETWORKS.includes(hre.network.name)
    ) {
      throw Error(
        `--use-defender only supports networks: ${SUPPORTED_NETWORKS}`,
      )
    }

    await upgradeContract(hre, 'RewardPool', taskArgs.proxyAddress, {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })

task('deploy-mock-token', 'Deploy mock ERC-20 token').setAction(
  async (_, hre) => {
    await deployContract(hre, 'MockERC20', ['Mock ERC20', 'MOCK'])
  },
)

// Contract deployment helper
async function deployContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: any[],
  config: {
    isUpgradeable?: boolean
    useDefender?: boolean
    defenderDeploySalt?: string
  } = {},
) {
  const Contract = await hre.ethers.getContractFactory(contractName)

  if (config.useDefender) {
    console.log(`Deploying ${contractName} with OpenZeppelin Defender`)
    if (config.isUpgradeable) {
      await hre.defender.deployProxy(Contract, constructorArgs, {
        salt: config.defenderDeploySalt,
        kind: 'uups',
      })
    } else {
      await hre.defender.deployContract(Contract, constructorArgs, {
        salt: config.defenderDeploySalt,
      })
    }
  } else {
    console.log(`Deploying ${contractName} with local signer`)
    if (config.isUpgradeable) {
      const result = await hre.upgrades.deployProxy(Contract, constructorArgs, {
        kind: 'uups',
      })
      await result.waitForDeployment()
    } else {
      await Contract.deploy(...constructorArgs)
    }
  }
}

// Contract upgrade helper
async function upgradeContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  proxyAddress: string,
  config: {
    useDefender?: boolean
    defenderDeploySalt?: string
  } = {},
) {
  const Contract = await hre.ethers.getContractFactory(contractName)

  if (config.useDefender) {
    console.log(`Upgrading ${contractName} with OpenZeppelin Defender`)
    await hre.defender.proposeUpgradeWithApproval(proxyAddress, Contract, {
      salt: config.defenderDeploySalt,
    })
  } else {
    console.log(`Upgrading ${contractName} with local signer`)
    const result = await hre.upgrades.upgradeProxy(proxyAddress, Contract)
    await result.waitForDeployment()
  }
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
      url: 'https://rpc.ankr.com/eth',
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
      url: 'https://rpc.ankr.com/base',
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
    vana: {
      url: 'https://rpc.vana.org',
      accounts,
      chainId: 1480,
    },
  },
  etherscan: {
    apiKey: {
      alfajores: process.env.CELOSCAN_API_KEY!,
      celo: process.env.CELOSCAN_API_KEY!,
      arbitrumOne: process.env.ARBISCAN_API_KEY!,
      mainnet: process.env.ETHERSCAN_API_KEY!,
      optimisticEthereum: process.env.OPSCAN_API_KEY!,
      base: process.env.BASESCAN_API_KEY!,
      berachain: process.env.BERASCAN_API_KEY!,
      vana: process.env.VANASCAN_API_KEY!,
      polygon: process.env.POLYGONSCAN_API_KEY!,
    },
    customChains: [
      {
        network: 'alfajores',
        chainId: 44787,
        urls: {
          apiURL: 'https://api-alfajores.celoscan.io/api',
          browserURL: 'https://alfajores.celoscan.io',
        },
      },
      {
        network: 'celo',
        chainId: 42220,
        urls: {
          apiURL: 'https://api.celoscan.io/api',
          browserURL: 'https://celoscan.io/',
        },
      },
      {
        network: 'berachain',
        chainId: 80094,
        urls: {
          apiURL: 'https://api.berascan.com/api',
          browserURL: 'https://berascan.com/',
        },
      },
      {
        network: 'vana',
        chainId: 1480,
        urls: {
          apiURL: 'https://vanascan.io/api',
          browserURL: 'https://vanascan.io/',
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
}

export default config
