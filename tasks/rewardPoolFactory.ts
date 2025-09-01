import { task, types } from 'hardhat/config'
import {
  deployContract,
  upgradeContract,
  ONE_DAY,
} from './helpers/deployHelpers'

const CONTRACT_NAME = 'RewardPoolFactory'
const IMPLEMENTATION_NAME = 'RewardPool'

task(
  'reward-pool-factory:deploy',
  'Deploy RewardPoolFactory and implementation',
)
  .addOptionalParam(
    'ownerAddress',
    'Address that will have the DEFAULT_ADMIN_ROLE on the factory',
  )
  .addOptionalParam(
    'transferDelay',
    'Delay in seconds before admin role can be transferred',
    ONE_DAY,
    types.int,
  )
  .addOptionalParam(
    'defaultProtocolFee',
    'Default protocol fee numerator (denominator is 10^18)',
    0,
    types.int,
  )
  .addParam(
    'defaultReserveAddress',
    'Default address that will receive protocol fees',
  )
  .addParam(
    'defaultOwner',
    'Default address that will have the DEFAULT_ADMIN_ROLE in created pools',
  )
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .setAction(async (taskArgs, hre) => {
    const ownerAddress =
      taskArgs.ownerAddress || (await hre.ethers.getSigners())[0].address

    // Get current block timestamp and add 1 day for timelock
    // This is a dummy value, (as are the other constructor arguments)
    // to be replaced when deploying clones.
    const currentBlock = await hre.ethers.provider.getBlock('latest')
    if (!currentBlock) {
      throw new Error('Failed to get current block')
    }
    const futureTimelock = currentBlock.timestamp + ONE_DAY

    // Deploy RewardPool implementation (not upgradeable)
    const implementationAddress = await deployContract(
      hre,
      IMPLEMENTATION_NAME,
      [
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        ownerAddress,
        ownerAddress,
        futureTimelock,
        taskArgs.defaultProtocolFee,
        taskArgs.defaultReserveAddress,
      ],
      {
        isUpgradeable: false,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )

    // Deploy RewardPoolFactory (upgradeable)
    const factoryAddress = await deployContract(
      hre,
      CONTRACT_NAME,
      [
        ownerAddress,
        taskArgs.transferDelay,
        implementationAddress,
        taskArgs.defaultProtocolFee,
        taskArgs.defaultReserveAddress,
        taskArgs.defaultOwner,
      ],
      {
        isUpgradeable: true,
        useDefender: taskArgs.useDefender,
        defenderDeploySalt: taskArgs.defenderDeploySalt,
      },
    )

    console.log('RewardPool implementation deployed to:', implementationAddress)
    console.log('RewardPoolFactory deployed to:', factoryAddress)
  })

task('reward-pool-factory:upgrade', 'Upgrade RewardPoolFactory contract')
  .addParam('proxyAddress', 'Address of the RewardPoolFactory proxy')
  .addFlag('useDefender', 'Deploy using OpenZeppelin Defender')
  .addOptionalParam('defenderDeploySalt', 'Salt to use for CREATE2 deployments')
  .addFlag(
    'callInitializeV2',
    'Call initializeV2 reinitializer (for V1 to V2 upgrade)',
  )
  .addOptionalParam(
    'defaultProtocolFee',
    'Default protocol fee (e.g., 0.05 for 5%)',
    '0',
  )
  .addOptionalParam(
    'defaultReserveAddress',
    'Default reserve address for protocol fees',
  )
  .setAction(async (taskArgs, hre) => {
    if (taskArgs.callInitializeV2 && !taskArgs.defaultReserveAddress) {
      throw new Error(
        'defaultReserveAddress is required when calling initializeV2',
      )
    }

    await upgradeContract(hre, CONTRACT_NAME, taskArgs.proxyAddress, {
      useDefender: taskArgs.useDefender,
      defenderDeploySalt: taskArgs.defenderDeploySalt,
      ...(taskArgs.callInitializeV2 && {
        reinitializerName: 'initializeV2',
        reinitializerArgs: [
          hre.ethers.parseEther(taskArgs.defaultProtocolFee),
          taskArgs.defaultReserveAddress,
        ],
      }),
    })
  })
