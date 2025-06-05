import { task, types } from 'hardhat/config'
import { deployContract } from './helpers/deployHelpers'

task('reward-pool:deploy', 'Deploy RewardPool contract')
  .addParam('poolToken', 'Address of the token used for rewards')
  .addParam('rewardFunction', 'Identifier of the reward function')
  .addParam('ownerAddress', 'Address to use as owner')
  .addParam('managerAddress', 'Address that will have MANAGER_ROLE')
  .addParam(
    'timelock',
    'Timestamp when manager withdrawals will be allowed',
    0,
    types.int,
  )
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    const managerAddress = taskArgs.managerAddress || ownerAddress

    const rewardFunctionId = hre.ethers.zeroPadValue(
      taskArgs.rewardFunction || '0x00',
      32,
    )

    await deployContract(
      hre,
      'RewardPool',
      [
        taskArgs.poolToken,
        rewardFunctionId,
        ownerAddress,
        managerAddress,
        taskArgs.timelock,
      ],
      {
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )
  })
