import { task } from 'hardhat/config'
import { deployContract } from './helpers/deployHelpers'

const CONTRACT_NAME = 'DataAvailability'

task('data-availability:deploy', 'Deploy DataAvailability contract')
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addParam(
    'imageId',
    'Image ID of the zkVM binary to accept verification from',
  )
  .addParam('verifierAddress', 'Address of the RISC Zero verifier contract')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    await deployContract(
      hre,
      CONTRACT_NAME,
      [ownerAddress, taskArgs.imageId, taskArgs.verifierAddress],
      {
        isUpgradeable: false,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })
