import { task, types } from 'hardhat/config'
import { deployContract } from './helpers/deployHelpers'

task('reward-pool:deploy', 'Deploy RewardPool contract')
  .addParam('poolToken', 'Address of the token used for rewards')
  .addParam('rewardFunctionAddress', 'Address of the reward function')
  .addOptionalParam('ownerAddress', 'Address to use as owner')
  .addOptionalParam('managerAddress', 'Address that will have MANAGER_ROLE')
  .addOptionalParam(
    'timelock',
    'Timestamp when manager withdrawals will be allowed',
    0,
    types.int,
  )
  .addOptionalParam(
    'protocolFee',
    'Protocol fee numerator (denominator is 10^18)',
    0,
    types.int,
  )
  .addParam('reserveAddress', 'Address that will receive protocol fees')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    const managerAddress = taskArgs.managerAddress || ownerAddress

    await deployContract(
      hre,
      'RewardPool',
      [
        taskArgs.poolToken,
        taskArgs.rewardFunctionAddress,
        ownerAddress,
        managerAddress,
        taskArgs.timelock,
        taskArgs.protocolFee,
        taskArgs.reserveAddress,
      ],
      {
        isUpgradeable: false,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })
