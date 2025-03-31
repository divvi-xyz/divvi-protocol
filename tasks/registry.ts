import fs from 'fs'
import path from 'path'
import { task } from 'hardhat/config'
import {
  deployContract,
  SUPPORTED_NETWORKS,
  ONE_DAY,
} from './helpers/deployHelpers'
import { populateRegistry } from './helpers/populateRegistry'

task('registry:deploy', 'Deploy Registry contract')
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .addOptionalParam('outputFile', 'File to write the deployment info (JSON)')
  .setAction(async (taskArgs, hre) => {
    if (
      taskArgs.useDefender &&
      !SUPPORTED_NETWORKS.includes(hre.network.name)
    ) {
      throw new Error(
        `--use-defender only supports networks: ${SUPPORTED_NETWORKS}`,
      )
    }

    if (taskArgs.defenderDeploySalt && !taskArgs.useDefender) {
      throw new Error(
        `--defender-deploy-salt can only be used with --use-defender`,
      )
    }

    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    const address = await deployContract(
      hre,
      'Registry',
      [ownerAddress, ONE_DAY],
      {
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )

    if (taskArgs.outputFile) {
      const exportData = {
        registryAddress: address,
        ownerAddress,
      }

      const exportDir = path.dirname(taskArgs.outputFile)
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }

      fs.writeFileSync(taskArgs.outputFile, JSON.stringify(exportData, null, 2))
      console.log(`\n💾 Deployment info written to ${taskArgs.outputFile}`)
    }
  })

task('registry:populate', 'Populate Registry contract with test data')
  .addParam('deploymentInfo', 'Path to JSON file containing deployment info')
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name !== 'localhost') {
      throw new RangeError('Only supports "localhost" network')
    }

    const fullPath = path.resolve(taskArgs.deploymentInfo)
    const fileContent = fs.readFileSync(fullPath, 'utf8')
    const deploymentInfo = JSON.parse(fileContent)

    if (!deploymentInfo.registryAddress) {
      throw new Error('Deployment info must contain the `registryAddress`')
    }

    await populateRegistry({
      hre,
      registryAddress: deploymentInfo.registryAddress,
    })
  })
