import { task } from 'hardhat/config'
import { deployContract, upgradeContract } from './helpers/deployHelpers'

const CONTRACT_NAME = 'RewardLibrary'

task('reward-library:deploy', 'Deploy RewardLibrary contract')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    await deployContract(hre, CONTRACT_NAME, [], {
      isUpgradeable: true,
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })

task('reward-library:upgrade', 'Upgrade RewardLibrary contract')
  .addParam('proxyAddress', 'Address of the RewardLibrary proxy')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .addOptionalParam(
    'defenderUpgradeApprovalProcessId',
    'Defender approval process ID to use for upgrades (if not provided, will use the default approval process set in Defender)',
  )
  .setAction(async (taskArgs, hre) => {
    await upgradeContract(hre, CONTRACT_NAME, taskArgs.proxyAddress, {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
      defenderUpgradeApprovalProcessId:
        taskArgs.defenderUpgradeApprovalProcessId,
    })
  })
