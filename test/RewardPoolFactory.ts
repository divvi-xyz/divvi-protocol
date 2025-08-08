import { expect } from 'chai'
import { Contract } from 'ethers'
import hre from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

const CONTRACT_NAME = 'RewardPoolFactory'
const IMPLEMENTATION_NAME = 'RewardPool'
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const MOCK_REWARD_FUNCTION_ID = hre.ethers.zeroPadValue(
  '0xa1b2c3d4e5f67890abcdef1234567890abcdef12',
  32,
)
const WEEK_IN_SECONDS = 60 * 60 * 24 * 7
const TRANSFER_DELAY = WEEK_IN_SECONDS
const TIMELOCK = WEEK_IN_SECONDS

describe(CONTRACT_NAME, function () {
  async function deployFactoryContract() {
    const [deployer, owner, manager, user1, user2, stranger] =
      await hre.ethers.getSigners()

    // Deploy implementation
    const RewardPool = await hre.ethers.getContractFactory(IMPLEMENTATION_NAME)
    const implementation = await RewardPool.deploy(
      NATIVE_TOKEN_ADDRESS,
      MOCK_REWARD_FUNCTION_ID,
      owner.address,
      manager.address,
      (await time.latest()) + TIMELOCK,
      0, // protocolFee - 0% fee for tests
      deployer.address, // reserveAddress - use deployer as reserve for tests
    )
    await implementation.waitForDeployment()

    // Deploy factory
    const Factory = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const factory = await hre.upgrades.deployProxy(
      Factory,
      [
        owner.address,
        TRANSFER_DELAY,
        await implementation.getAddress(),
        0, // defaultProtocolFee - 0% fee for tests
        deployer.address, // defaultReserveAddress - use deployer as reserve for tests
      ],
      { kind: 'uups' },
    )
    await factory.waitForDeployment()

    return {
      factory,
      implementation,
      deployer,
      owner,
      manager,
      user1,
      user2,
      stranger,
    }
  }

  describe('Initialization', function () {
    it('initializes correctly', async function () {
      const { factory, implementation, owner } = await loadFixture(
        deployFactoryContract,
      )

      expect(await factory.implementation()).to.equal(
        await implementation.getAddress(),
      )
      expect(
        await factory.hasRole(
          await factory.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
    })
  })

  describe('Create RewardPool', function () {
    let factory: Contract
    let owner: HardhatEthersSigner
    let manager: HardhatEthersSigner
    let user1: HardhatEthersSigner

    beforeEach(async function () {
      const deployment = await loadFixture(deployFactoryContract)
      factory = deployment.factory
      owner = deployment.owner
      manager = deployment.manager
      user1 = deployment.user1
    })

    it('creates a new RewardPool clone', async function () {
      const poolToken = await hre.ethers.getSigner(user1.address)
      const rewardFunctionId = MOCK_REWARD_FUNCTION_ID
      const poolOwner = user1.address
      const poolManager = user1.address
      const timelock = (await time.latest()) + TIMELOCK

      const tx = await factory.createRewardPool(
        poolToken.address,
        rewardFunctionId,
        poolOwner,
        poolManager,
        timelock,
      )

      const receipt = await tx.wait()
      const event = receipt?.logs.slice(-1)[0]
      const eventData = factory.interface.parseLog({
        topics: event?.topics as string[],
        data: event?.data as string,
      })
      const cloneAddress = eventData?.args.rewardPool // Get the clone address from the named argument

      await expect(tx)
        .to.emit(factory, 'RewardPoolCreated')
        .withArgs(
          poolToken.address,
          rewardFunctionId,
          poolOwner,
          poolManager,
          timelock,
          cloneAddress,
        )

      const rewardPool = await hre.ethers.getContractAt(
        IMPLEMENTATION_NAME,
        cloneAddress,
      )

      expect(await rewardPool.poolToken()).to.equal(poolToken.address)
      expect(await rewardPool.rewardFunctionId()).to.equal(rewardFunctionId)
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          poolOwner,
        ),
      ).to.be.true
      expect(
        await rewardPool.hasRole(await rewardPool.MANAGER_ROLE(), poolManager),
      ).to.be.true
      expect(await rewardPool.timelock()).to.equal(timelock)

      // Check that the created pool uses the factory's default values
      expect(await rewardPool.protocolFee()).to.equal(
        await factory.defaultProtocolFee(),
      )
      expect(await rewardPool.reserveAddress()).to.equal(
        await factory.defaultReserveAddress(),
      )
    })

    it('reverts when creating with zero pool token', async function () {
      await expect(
        factory.createRewardPool(
          hre.ethers.ZeroAddress,
          MOCK_REWARD_FUNCTION_ID,
          owner.address,
          manager.address,
          (await time.latest()) + TIMELOCK,
        ),
      ).to.be.revertedWithCustomError(factory, 'ZeroAddressNotAllowed')
    })

    it('reverts when creating with zero owner', async function () {
      await expect(
        factory.createRewardPool(
          user1.address,
          MOCK_REWARD_FUNCTION_ID,
          hre.ethers.ZeroAddress,
          manager.address,
          (await time.latest()) + TIMELOCK,
        ),
      ).to.be.revertedWithCustomError(factory, 'ZeroAddressNotAllowed')
    })

    it('reverts when creating with zero manager', async function () {
      await expect(
        factory.createRewardPool(
          user1.address,
          MOCK_REWARD_FUNCTION_ID,
          owner.address,
          hre.ethers.ZeroAddress,
          (await time.latest()) + TIMELOCK,
        ),
      ).to.be.revertedWithCustomError(factory, 'ZeroAddressNotAllowed')
    })
  })

  describe('Default Protocol Fee Management', function () {
    let factory: Contract
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let stranger: HardhatEthersSigner

    beforeEach(async function () {
      const deployment = await loadFixture(deployFactoryContract)
      factory = deployment.factory
      owner = deployment.owner
      user1 = deployment.user1
      stranger = deployment.stranger
    })

    it('initializes with correct default values', async function () {
      const deployment = await loadFixture(deployFactoryContract)
      expect(await factory.defaultProtocolFee()).to.equal(0)
      expect(await factory.defaultReserveAddress()).to.equal(
        deployment.deployer.address,
      )
    })

    it('allows owner to set default protocol fee', async function () {
      const factoryWithOwner = factory.connect(owner) as typeof factory
      const newFee = hre.ethers.parseEther('0.05') // 5%

      await expect(factoryWithOwner.setDefaultProtocolFee(newFee))
        .to.emit(factory, 'DefaultProtocolFeeUpdated')
        .withArgs(newFee, 0)

      expect(await factory.defaultProtocolFee()).to.equal(newFee)
    })

    it('allows owner to set default reserve address', async function () {
      const factoryWithOwner = factory.connect(owner) as typeof factory
      const deployment = await loadFixture(deployFactoryContract)
      const newReserveAddress = stranger.address

      await expect(factoryWithOwner.setDefaultReserveAddress(newReserveAddress))
        .to.emit(factory, 'DefaultReserveAddressUpdated')
        .withArgs(newReserveAddress, deployment.deployer.address)

      expect(await factory.defaultReserveAddress()).to.equal(newReserveAddress)
    })

    it('reverts when non-owner tries to set default protocol fee', async function () {
      const factoryWithStranger = factory.connect(stranger) as typeof factory
      const newFee = hre.ethers.parseEther('0.05')

      await expect(
        factoryWithStranger.setDefaultProtocolFee(newFee),
      ).to.be.revertedWithCustomError(
        factory,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('reverts when non-owner tries to set default reserve address', async function () {
      const factoryWithStranger = factory.connect(stranger) as typeof factory
      const newReserveAddress = stranger.address

      await expect(
        factoryWithStranger.setDefaultReserveAddress(newReserveAddress),
      ).to.be.revertedWithCustomError(
        factory,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('reverts when setting invalid default protocol fee', async function () {
      const factoryWithOwner = factory.connect(owner) as typeof factory
      const invalidFee = hre.ethers.parseEther('1.1') // 110%

      await expect(
        factoryWithOwner.setDefaultProtocolFee(invalidFee),
      ).to.be.revertedWithCustomError(factory, 'InvalidProtocolFee')
    })

    it('reverts when setting zero address as default reserve', async function () {
      const factoryWithOwner = factory.connect(owner) as typeof factory
      await expect(
        factoryWithOwner.setDefaultReserveAddress(hre.ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(factory, 'InvalidReserveAddress')
    })

    it('creates pools with updated default values', async function () {
      const factoryWithOwner = factory.connect(owner) as typeof factory
      // Set new defaults
      const newFee = hre.ethers.parseEther('0.05') // 5%
      const newReserveAddress = stranger.address

      await factoryWithOwner.setDefaultProtocolFee(newFee)
      await factoryWithOwner.setDefaultReserveAddress(newReserveAddress)

      // Create a new pool using the same factory instance (not a new deployment)
      const poolToken = user1.address
      const rewardFunctionId = MOCK_REWARD_FUNCTION_ID
      const poolOwner = user1.address
      const poolManager = user1.address
      const timelock = (await time.latest()) + TIMELOCK

      const tx = await factory.createRewardPool(
        poolToken,
        rewardFunctionId,
        poolOwner,
        poolManager,
        timelock,
      )

      const receipt = await tx.wait()
      const event = receipt?.logs.slice(-1)[0]
      const eventData = factory.interface.parseLog({
        topics: event?.topics as string[],
        data: event?.data as string,
      })
      const cloneAddress = eventData?.args.rewardPool

      const rewardPool = await hre.ethers.getContractAt(
        IMPLEMENTATION_NAME,
        cloneAddress,
      )

      // Check that the new pool uses the updated default values
      expect(await rewardPool.protocolFee()).to.equal(newFee)
      expect(await rewardPool.reserveAddress()).to.equal(newReserveAddress)
    })
  })

  describe('Set Implementation', function () {
    let factory: Contract
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let stranger: HardhatEthersSigner

    beforeEach(async function () {
      const deployment = await loadFixture(deployFactoryContract)
      factory = deployment.factory
      owner = deployment.owner
      user1 = deployment.user1
      stranger = deployment.stranger
    })

    it('allows admin to update implementation', async function () {
      const newImplementation = user1.address

      await (factory.connect(owner) as typeof factory).setImplementation(
        newImplementation,
      )

      expect(await factory.implementation()).to.equal(newImplementation)
    })

    it('reverts when non-admin tries to update implementation', async function () {
      const newImplementation = user1.address

      await expect(
        (factory.connect(stranger) as typeof factory).setImplementation(
          newImplementation,
        ),
      ).to.be.revertedWithCustomError(
        factory,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('reverts when setting zero implementation', async function () {
      await expect(
        (factory.connect(owner) as typeof factory).setImplementation(
          hre.ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(factory, 'ZeroAddressNotAllowed')
    })
  })
})
