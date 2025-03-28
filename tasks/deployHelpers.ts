import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

export const ONE_DAY = 60 * 60 * 24

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

type BaseDeployConfig = {
  isUpgradeable?: boolean
}

type DefenderConfig = WithDefender | WithoutDefender

type WithDefender = {
  useDefender: true
  defenderDeploySalt?: string
}

type WithoutDefender = {
  useDefender?: false
}

// Contract deployment helper
export async function deployContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: any[],
  config: BaseDeployConfig & DefenderConfig = {},
) {
  const Contract = await hre.ethers.getContractFactory(contractName)

  let proxyAddress: string | undefined
  let contractAddress: string

  log(`Deploying ${contractName}`)
  log('Constructor args:', constructorArgs.join(', '))

  if (config.useDefender) {
    log(`Using OpenZeppelin Defender`)
    if (config.defenderDeploySalt) {
      log(`Salt: ${config.defenderDeploySalt}`)
    }

    if (config.isUpgradeable) {
      const proxy = await hre.defender.deployProxy(Contract, constructorArgs, {
        salt: config.defenderDeploySalt,
        kind: 'uups',
      })
      await proxy.waitForDeployment()

      proxyAddress = await proxy.getAddress()
      contractAddress = await getImplementationAddress(
        hre.ethers.provider,
        proxyAddress,
      )
    } else {
      const contract = await hre.defender.deployContract(
        Contract,
        constructorArgs,
        {
          salt: config.defenderDeploySalt,
        },
      )
      await contract.waitForDeployment()

      contractAddress = await contract.getAddress()
    }
  } else {
    log(`Using local signer`)
    if (config.isUpgradeable) {
      const proxy = await hre.upgrades.deployProxy(Contract, constructorArgs, {
        kind: 'uups',
      })
      await proxy.waitForDeployment()

      proxyAddress = await proxy.getAddress()
      contractAddress = await getImplementationAddress(
        hre.ethers.provider,
        proxyAddress,
      )
    } else {
      const contract = await Contract.deploy(...constructorArgs)
      await contract.waitForDeployment()

      contractAddress = await contract.getAddress()
    }
  }
  log(`✅ Deployed!`)
  if (proxyAddress) {
    log('Proxy Address:', proxyAddress)
    log('Implementation Address:', contractAddress)
  } else {
    log('Contract Address:', contractAddress)
  }

  log(`\nTo verify the ${proxyAddress ? 'implementation' : 'contract'}, run:`)
  log(
    `yarn hardhat verify ${contractAddress} --network ${hre.network.name} ${proxyAddress ? '' : constructorArgs.join(' ')}`,
  )
}

// Contract upgrade helper
export async function upgradeContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  proxyAddress: string,
  config: DefenderConfig = {},
) {
  const Contract = await hre.ethers.getContractFactory(contractName)

  let newImplementationAddress: string

  if (config?.useDefender) {
    log(`Upgrading ${contractName} with OpenZeppelin Defender`)
    log(`Proxy Address: ${proxyAddress}`)

    const currentImplementationAddress = await getImplementationAddress(
      hre.ethers.provider,
      proxyAddress,
    )
    log('Current Implementation Address:', currentImplementationAddress)

    const proposal = await hre.defender.proposeUpgradeWithApproval(
      proxyAddress,
      Contract,
      {
        salt: config.defenderDeploySalt,
      },
    )

    log('Proposal created:', proposal.url)
    log('Waiting for approval...')

    newImplementationAddress = currentImplementationAddress
    while (newImplementationAddress === currentImplementationAddress) {
      await new Promise((resolve) => setTimeout(resolve, 10_000)) // 10 seconds
      newImplementationAddress = await getImplementationAddress(
        hre.ethers.provider,
        proxyAddress,
      )
    }
  } else {
    log(`Upgrading ${contractName} with local signer`)
    log(`Proxy Address: ${proxyAddress}`)
    const result = await hre.upgrades.upgradeProxy(proxyAddress, Contract)
    await result.waitForDeployment()

    newImplementationAddress = await getImplementationAddress(
      hre.ethers.provider,
      proxyAddress,
    )
  }
  log(`✅ Updraded!`)
  log('New Implementation Address:', newImplementationAddress)

  log('\nTo verify the new implementation contract, run:')
  log(
    `yarn hardhat verify ${newImplementationAddress} --network ${hre.network.name}`,
  )
}

function log(...args: any[]) {
  if (process.env.SHELL !== 'true') {
    console.log(...args)
  }
}
