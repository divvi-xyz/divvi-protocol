import { HardhatRuntimeEnvironment } from 'hardhat/types'

export const SUPPORTED_NETWORKS = [
  'celo',
  'mainnet',
  'arbitrum',
  'polygon',
  'op',
  'base',
  'berachain',
  'vana',
]

export const ONE_DAY = 60 * 60 * 24

// Contract deployment helper
export async function deployContract(
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
export async function upgradeContract(
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
