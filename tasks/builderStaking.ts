import { task, types } from 'hardhat/config'
import { deployContract, upgradeContract } from './helpers/deployHelpers'

const CONTRACT_NAME = 'BuilderStaking'

task('builder-staking:deploy', 'Deploy BuilderStaking contract')
  .addParam('divviTokenAddress', 'Address of the $DIVVI token contract')
  .addOptionalParam(
    'adminAddress',
    'Address that will have the DEFAULT_ADMIN_ROLE',
  )
  .addOptionalParam(
    'initialThreshold',
    'Initial staking threshold amount',
    '0',
    types.string,
  )
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .addOptionalParam(
    'transferDelay',
    'Delay in seconds before admin role changes take effect',
    '0',
    types.string,
  )
  .setAction(async (taskArgs, hre) => {
    const adminAddress =
      taskArgs.adminAddress || (await hre.ethers.getSigners())[0].address

    await deployContract(
      hre,
      CONTRACT_NAME,
      [
        taskArgs.divviTokenAddress,
        adminAddress,
        taskArgs.initialThreshold,
        taskArgs.transferDelay,
      ],
      {
        isUpgradeable: true,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })

task('builder-staking:upgrade', 'Upgrade BuilderStaking contract')
  .addParam('proxyAddress', 'Address of the BuilderStaking proxy')
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
