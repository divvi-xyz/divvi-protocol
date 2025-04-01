import { task } from 'hardhat/config'
import {
  deployContract,
  SUPPORTED_NETWORKS,
  ONE_DAY,
  readDeploymentMetadata,
} from './helpers/deployHelpers'
import { populateRegistry } from './helpers/populateRegistry'

const CONTRACT_NAME = 'Registry'

task('registry:deploy', 'Deploy Registry contract')
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
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

    await deployContract(hre, CONTRACT_NAME, [ownerAddress, ONE_DAY], {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })

task(
  'registry:populate',
  'Populate Registry contract with test data',
).setAction(async (_, hre) => {
  if (hre.network.name !== 'localhost') {
    throw new RangeError('Only supports "localhost" network')
  }

  const { contractAddress } = readDeploymentMetadata({
    hre,
    contractName: CONTRACT_NAME,
  })

  await populateRegistry({ hre, contractAddress })
})
