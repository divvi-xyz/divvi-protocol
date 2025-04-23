import { task, types } from 'hardhat/config'
import {
  deployContract,
  upgradeContract,
  ONE_DAY,
} from './helpers/deployHelpers'

const CONTRACT_NAME = 'DivviRegistry'

task('divvi-registry:deploy', 'Deploy DivviRegistry contract')
  .addOptionalParam(
    'ownerAddress',
    'Address that will have the DEFAULT_ADMIN_ROLE',
  )
  .addOptionalParam(
    'transferDelay',
    'Delay in seconds before admin role can be transferred',
    ONE_DAY,
    types.int,
  )
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    await deployContract(
      hre,
      CONTRACT_NAME,
      [ownerAddress, taskArgs.transferDelay],
      {
        isUpgradeable: true,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })

task('divvi-registry:upgrade', 'Upgrade DivviRegistry contract')
  .addParam('proxyAddress', 'Address of the DivviRegistry proxy')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    await upgradeContract(hre, CONTRACT_NAME, taskArgs.proxyAddress, {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
    })
  })
