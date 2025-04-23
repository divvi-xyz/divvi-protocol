import { task } from 'hardhat/config'
import {
  deployContract,
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
