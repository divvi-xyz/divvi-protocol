import { task } from 'hardhat/config'
import { deployContract } from './helpers/deployHelpers'

const CONTRACT_NAME = 'SqrtReward'

task('sqrt-reward:deploy', 'Deploy SqrtReward contract')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    await deployContract(hre, CONTRACT_NAME, [], {
      isUpgradeable: true,
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })
