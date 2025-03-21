import { expect } from 'chai'
import { Contract, TransactionReceipt } from 'ethers'
import hre from 'hardhat'
import {
  loadFixture,
  mine,
  setBalance,
  time,
} from '@nomicfoundation/hardhat-network-helpers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

const CONTRACT_NAME = 'RewardPool'
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const MOCK_REWARD_FUNCTION_ID = hre.ethers.zeroPadValue(
  '0xa1b2c3d4e5f67890abcdef1234567890abcdef12',
  32,
)
const MOCK_REWARD_FUNCTION_ARGS = [1000, 2000]
const WEEK_IN_SECONDS = 60 * 60 * 24 * 7
const TIMELOCK = WEEK_IN_SECONDS
const ADMIN_CHANGE_DELAY = WEEK_IN_SECONDS
const MANAGER_CAPITAL = hre.ethers.parseEther('1000')

describe(CONTRACT_NAME, function () {
  async function deployERC20RewardPoolContract() {
    // Contracts are deployed using the first signer/account by default
    const [owner, manager, user1, user2, stranger] =
      await hre.ethers.getSigners()

    const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
    const mockERC20 = await MockERC20.deploy('MockERC20', 'MOCK')

    const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)

    const proxy = await hre.upgrades.deployProxy(
      RewardPool,
      [
        await mockERC20.getAddress(),
        MOCK_REWARD_FUNCTION_ID,
        owner.address,
        ADMIN_CHANGE_DELAY,
        manager.address,
        (await time.latest()) + TIMELOCK,
      ],
      { kind: 'uups' },
    )
    await proxy.waitForDeployment()

    // Mint tokens to manager for deposits
    await mockERC20.mint(manager.address, MANAGER_CAPITAL)

    // Approve tokens for deposit
    const mockToken = mockERC20.connect(manager) as typeof mockERC20
    await mockToken.approve(await proxy.getAddress(), MANAGER_CAPITAL)

    return {
      rewardPool: proxy,
      mockERC20,
      owner,
      manager,
      user1,
      user2,
      stranger,
    }
  }

  async function deployNativeRewardPoolContract() {
    const [owner, manager, user1, user2, stranger] =
      await hre.ethers.getSigners()

    const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)

    const proxy = await hre.upgrades.deployProxy(
      RewardPool,
      [
        NATIVE_TOKEN_ADDRESS,
        MOCK_REWARD_FUNCTION_ID,
        owner.address,
        ADMIN_CHANGE_DELAY,
        manager.address,
        (await time.latest()) + TIMELOCK,
      ],
      { kind: 'uups' },
    )

    return {
      rewardPool: proxy,
      owner,
      manager,
      user1,
      user2,
      stranger,
    }
  }

  describe('Initialization', function () {
    it('initializes with correct ERC20 token parameters', async function () {
      const { rewardPool, mockERC20, owner, manager } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      expect(await rewardPool.poolToken()).to.equal(
        await mockERC20.getAddress(),
      )
      expect(await rewardPool.isNativeToken()).to.be.false
      expect(await rewardPool.rewardFunctionId()).to.equal(
        MOCK_REWARD_FUNCTION_ID,
      )
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
      expect(
        await rewardPool.hasRole(
          await rewardPool.MANAGER_ROLE(),
          manager.address,
        ),
      ).to.be.true
      const currentTimelock = await rewardPool.timelock()
      expect(currentTimelock).to.be.greaterThan(await time.latest())
      await expect(rewardPool.deploymentTransaction())
        .to.emit(rewardPool, 'PoolInitialized')
        .withArgs(
          await mockERC20.getAddress(),
          MOCK_REWARD_FUNCTION_ID,
          currentTimelock,
        )
    })

    it('initializes with correct native token parameters', async function () {
      const { rewardPool, owner, manager } = await loadFixture(
        deployNativeRewardPoolContract,
      )

      expect(await rewardPool.poolToken()).to.equal(NATIVE_TOKEN_ADDRESS)
      expect(await rewardPool.isNativeToken()).to.be.true
      expect(await rewardPool.rewardFunctionId()).to.equal(
        MOCK_REWARD_FUNCTION_ID,
      )
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
      expect(
        await rewardPool.hasRole(
          await rewardPool.MANAGER_ROLE(),
          manager.address,
        ),
      ).to.be.true
      const currentTimelock = await rewardPool.timelock()
      expect(currentTimelock).to.be.greaterThan(await time.latest())
      await expect(rewardPool.deploymentTransaction())
        .to.emit(rewardPool, 'PoolInitialized')
        .withArgs(
          NATIVE_TOKEN_ADDRESS,
          MOCK_REWARD_FUNCTION_ID,
          currentTimelock,
        )
    })
  })

  describe('Deposit', function () {
    const depositAmount = hre.ethers.parseEther('1')

    describe('with ERC20 token', function () {
      let rewardPool: Contract
      let manager: HardhatEthersSigner
      let stranger: HardhatEthersSigner
      let pool: Contract

      beforeEach(async function () {
        const deployment = await loadFixture(deployERC20RewardPoolContract)
        rewardPool = deployment.rewardPool
        manager = deployment.manager
        stranger = deployment.stranger

        // Connect with manager
        pool = rewardPool.connect(manager) as typeof rewardPool
      })

      it('allows manager to deposit ERC20 tokens', async function () {
        await expect(pool.deposit(depositAmount))
          .to.emit(rewardPool, 'Deposit')
          .withArgs(depositAmount)

        expect(await rewardPool.poolBalance()).to.equal(depositAmount)
      })

      it('reverts when non-manager tries to deposit', async function () {
        const poolWithStranger = rewardPool.connect(
          stranger,
        ) as typeof rewardPool

        await expect(
          poolWithStranger.deposit(depositAmount),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'AccessControlUnauthorizedAccount',
        )
      })

      it('reverts when sending native tokens with ERC20 deposit', async function () {
        await expect(
          pool.deposit(depositAmount, {
            value: depositAmount,
          }),
        ).to.be.revertedWithCustomError(rewardPool, 'NativeTokenNotAccepted')
      })
    })

    describe('with native token', function () {
      let rewardPool: Contract
      let manager: HardhatEthersSigner
      let pool: Contract

      beforeEach(async function () {
        const deployment = await loadFixture(deployNativeRewardPoolContract)
        rewardPool = deployment.rewardPool
        manager = deployment.manager

        // Connect with manager
        pool = rewardPool.connect(manager) as typeof rewardPool
      })

      it('allows manager to deposit native tokens', async function () {
        await expect(pool.deposit(depositAmount, { value: depositAmount }))
          .to.emit(rewardPool, 'Deposit')
          .withArgs(depositAmount)

        expect(await rewardPool.poolBalance()).to.equal(depositAmount)
      })

      it('reverts when amount mismatch in native token deposit', async function () {
        const sentAmount = hre.ethers.parseEther('4')

        await expect(pool.deposit(depositAmount, { value: sentAmount }))
          .to.be.revertedWithCustomError(rewardPool, 'AmountMismatch')
          .withArgs(depositAmount, sentAmount)
      })

      it('reverts direct transfers to contract', async function () {
        await expect(
          manager.sendTransaction({
            to: await rewardPool.getAddress(),
            value: depositAmount,
          }),
        ).to.be.revertedWithCustomError(rewardPool, 'UseDepositFunction')
      })
    })
  })

  describe('Withdraw', function () {
    const depositAmount = hre.ethers.parseEther('100')
    const withdrawAmount = hre.ethers.parseEther('50')

    let rewardPool: Contract
    let mockERC20: Contract
    let manager: HardhatEthersSigner
    let stranger: HardhatEthersSigner
    let pool: Contract

    describe('with ERC20 token', function () {
      beforeEach(async function () {
        const deployment = await loadFixture(deployERC20RewardPoolContract)
        rewardPool = deployment.rewardPool
        mockERC20 = deployment.mockERC20
        manager = deployment.manager
        stranger = deployment.stranger

        // Connect with manager
        pool = rewardPool.connect(manager) as typeof rewardPool

        // Deposit
        await pool.deposit(depositAmount)
      })

      it('allows manager to withdraw after timelock', async function () {
        // Mine blocks until timelock expires
        await mine(10, { interval: TIMELOCK })

        // Withdraw
        expect(await pool.withdraw(withdrawAmount))
          .to.emit(rewardPool, 'Withdraw')
          .withArgs(withdrawAmount)

        // Check balance
        expect(await rewardPool.poolBalance()).to.equal(
          depositAmount - withdrawAmount,
        )
        expect(await mockERC20.balanceOf(manager.address)).to.equal(
          MANAGER_CAPITAL - depositAmount + withdrawAmount,
        )
      })

      it('reverts withdrawals before timelock expires', async function () {
        const blockTimestamp = (await time.latest()) + 1
        await expect(pool.withdraw(withdrawAmount))
          .to.be.revertedWithCustomError(rewardPool, 'TimelockNotExpired')
          .withArgs(blockTimestamp, await rewardPool.timelock())
      })

      it('reverts when withdrawing more than pool balance', async function () {
        // Mine blocks until timelock expires
        await mine(10, { interval: TIMELOCK })

        // Try to withdraw more than balance
        const largeWithdrawAmount = hre.ethers.parseEther('150')
        await expect(pool.withdraw(largeWithdrawAmount))
          .to.be.revertedWithCustomError(rewardPool, 'InsufficientPoolBalance')
          .withArgs(largeWithdrawAmount, await rewardPool.poolBalance())
      })

      it('reverts when non-manager tries to withdraw', async function () {
        // Connect with stranger
        const poolWithStranger = rewardPool.connect(
          stranger,
        ) as typeof rewardPool

        await expect(
          poolWithStranger.withdraw(withdrawAmount),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'AccessControlUnauthorizedAccount',
        )
      })
    })

    describe('with native token', function () {
      const nativeDepositAmount = hre.ethers.parseEther('5')
      const nativeWithdrawAmount = hre.ethers.parseEther('2')

      beforeEach(async function () {
        const deployment = await loadFixture(deployNativeRewardPoolContract)
        rewardPool = deployment.rewardPool
        manager = deployment.manager

        // Connect with manager
        pool = rewardPool.connect(manager) as typeof rewardPool

        // Deposit
        await pool.deposit(nativeDepositAmount, { value: nativeDepositAmount })
      })

      it('allows manager to withdraw after timelock', async function () {
        // Mine blocks until timelock expires
        await mine(10, { interval: TIMELOCK })

        // Get balance before withdrawal
        const balanceBefore = await hre.ethers.provider.getBalance(
          manager.address,
        )

        // Withdraw
        const tx = await pool.withdraw(nativeWithdrawAmount)
        const receipt: TransactionReceipt = await tx.wait()

        // Calculate gas used
        const gasUsed = receipt.gasUsed * receipt.gasPrice

        // Check balance
        const balanceAfter = await hre.ethers.provider.getBalance(
          manager.address,
        )
        expect(await rewardPool.poolBalance()).to.equal(
          nativeDepositAmount - nativeWithdrawAmount,
        )
        expect(balanceAfter).to.equal(
          balanceBefore + nativeWithdrawAmount - gasUsed,
        )
      })
    })
  })

  describe('Add reward', function () {
    const depositAmount = hre.ethers.parseEther('100')

    let rewardPool: Contract
    let manager: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let user2: HardhatEthersSigner
    let stranger: HardhatEthersSigner
    let pool: Contract

    beforeEach(async function () {
      const deployment = await loadFixture(deployERC20RewardPoolContract)
      rewardPool = deployment.rewardPool
      manager = deployment.manager
      user1 = deployment.user1
      user2 = deployment.user2
      stranger = deployment.stranger

      // Connect with manager
      pool = rewardPool.connect(manager) as typeof rewardPool

      // Deposit funds for most tests
      await pool.deposit(depositAmount)
    })

    it('allows manager to add rewards', async function () {
      // Add rewards
      const users = [user1.address, user2.address]
      const amounts = [hre.ethers.parseEther('10'), hre.ethers.parseEther('20')]

      await expect(pool.addRewards(users, amounts, MOCK_REWARD_FUNCTION_ARGS))
        .to.emit(rewardPool, 'AddReward')
        .withArgs(user1.address, amounts[0], MOCK_REWARD_FUNCTION_ARGS)
        .to.emit(rewardPool, 'AddReward')
        .withArgs(user2.address, amounts[1], MOCK_REWARD_FUNCTION_ARGS)
      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        amounts[0],
      )
      expect(await rewardPool.pendingRewards(user2.address)).to.equal(
        amounts[1],
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(
        amounts[0] + amounts[1],
      )
    })

    it('allows adding multiple rewards for the same user', async function () {
      // First reward
      await pool.addRewards(
        [user1.address],
        [hre.ethers.parseEther('10')],
        MOCK_REWARD_FUNCTION_ARGS,
      )

      // Second reward
      await pool.addRewards(
        [user1.address],
        [hre.ethers.parseEther('15')],
        MOCK_REWARD_FUNCTION_ARGS,
      )

      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        hre.ethers.parseEther('25'),
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(
        hre.ethers.parseEther('25'),
      )
    })

    it('reverts when users and amounts arrays have different lengths', async function () {
      await expect(
        pool.addRewards(
          [user1.address, user2.address],
          [hre.ethers.parseEther('10')],
          MOCK_REWARD_FUNCTION_ARGS,
        ),
      )
        .to.be.revertedWithCustomError(rewardPool, 'ArraysLengthMismatch')
        .withArgs(2, 1)
    })

    it('reverts when zero address is provided as user', async function () {
      await expect(
        pool.addRewards(
          [hre.ethers.ZeroAddress],
          [hre.ethers.parseEther('10')],
          MOCK_REWARD_FUNCTION_ARGS,
        ),
      )
        .to.be.revertedWithCustomError(rewardPool, 'ZeroAddressNotAllowed')
        .withArgs(0)
    })

    it('reverts when zero amount is provided', async function () {
      await expect(
        pool.addRewards([user1.address], [0], MOCK_REWARD_FUNCTION_ARGS),
      )
        .to.be.revertedWithCustomError(
          rewardPool,
          'RewardAmountMustBeGreaterThanZero',
        )
        .withArgs(0)
    })

    it('reverts when non-manager tries to add rewards', async function () {
      // Connect with stranger
      const poolWithStranger = rewardPool.connect(stranger) as typeof rewardPool

      await expect(
        poolWithStranger.addRewards(
          [user1.address],
          [hre.ethers.parseEther('10')],
          MOCK_REWARD_FUNCTION_ARGS,
        ),
      ).to.be.revertedWithCustomError(
        rewardPool,
        'AccessControlUnauthorizedAccount',
      )
    })
  })

  describe('Claim reward', function () {
    const depositAmount = hre.ethers.parseEther('100')
    const rewardAmount = hre.ethers.parseEther('30')
    const claimAmount = hre.ethers.parseEther('20')

    let rewardPool: Contract
    let mockERC20: Contract
    let manager: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let poolWithManager: Contract
    let poolWithUser: Contract

    describe('with ERC20 token', function () {
      beforeEach(async function () {
        const deployment = await loadFixture(deployERC20RewardPoolContract)
        rewardPool = deployment.rewardPool
        mockERC20 = deployment.mockERC20
        manager = deployment.manager
        user1 = deployment.user1

        // Connect with manager
        poolWithManager = rewardPool.connect(manager) as typeof rewardPool

        // Deposit
        await poolWithManager.deposit(depositAmount)

        // Add rewards
        await poolWithManager.addRewards(
          [user1.address],
          [rewardAmount],
          MOCK_REWARD_FUNCTION_ARGS,
        )

        // Connect with user
        poolWithUser = rewardPool.connect(user1) as typeof rewardPool
      })

      it('allows users to claim partial rewards', async function () {
        // Claim rewards
        expect(await poolWithUser.claimReward(claimAmount))
          .to.emit(rewardPool, 'ClaimReward')
          .withArgs(user1.address, claimAmount)

        // Check balances
        expect(await mockERC20.balanceOf(user1.address)).to.equal(claimAmount)
        expect(await rewardPool.pendingRewards(user1.address)).to.equal(
          rewardAmount - claimAmount,
        )
        expect(await rewardPool.totalPendingRewards()).to.equal(
          rewardAmount - claimAmount,
        )
        expect(await rewardPool.poolBalance()).to.equal(
          depositAmount - claimAmount,
        )
      })

      it('allows users to claim full reward amount', async function () {
        await expect(poolWithUser.claimReward(rewardAmount))
          .to.emit(rewardPool, 'ClaimReward')
          .withArgs(user1.address, rewardAmount)

        // Check balances
        expect(await mockERC20.balanceOf(user1.address)).to.equal(rewardAmount)
        expect(await rewardPool.pendingRewards(user1.address)).to.equal(0)
        expect(await rewardPool.totalPendingRewards()).to.equal(0)
      })

      it('reverts when claiming more than pending rewards', async function () {
        // Try to claim more than allocated
        await expect(
          poolWithUser.claimReward(hre.ethers.parseEther('40')),
        ).to.be.revertedWithCustomError(rewardPool, 'InsufficientRewardBalance')
      })

      it('reverts when claiming zero amount', async function () {
        await expect(poolWithUser.claimReward(0)).to.be.revertedWithCustomError(
          rewardPool,
          'AmountMustBeGreaterThanZero',
        )
      })

      it('reverts when pool has insufficient balance', async function () {
        // Mine blocks until timelock expires
        await mine(10, { interval: TIMELOCK })

        // Withdraw all funds
        await poolWithManager.withdraw(await poolWithManager.poolBalance())

        await expect(poolWithUser.claimReward(claimAmount))
          .to.be.revertedWithCustomError(rewardPool, 'InsufficientPoolBalance')
          .withArgs(claimAmount, 0)
      })
    })

    describe('with native token', function () {
      beforeEach(async function () {
        const deployment = await loadFixture(deployNativeRewardPoolContract)
        rewardPool = deployment.rewardPool
        manager = deployment.manager
        user1 = deployment.user1

        // Connect with manager
        poolWithManager = rewardPool.connect(manager) as typeof rewardPool

        // Deposit
        await poolWithManager.deposit(depositAmount, {
          value: depositAmount,
        })

        // Add rewards
        await poolWithManager.addRewards(
          [user1.address],
          [rewardAmount],
          MOCK_REWARD_FUNCTION_ARGS,
        )

        // Connect with user
        poolWithUser = rewardPool.connect(user1) as typeof rewardPool
      })

      it('allows users to claim native token rewards', async function () {
        // Get balance before claim
        const balanceBefore = await hre.ethers.provider.getBalance(
          user1.address,
        )

        // Claim rewards
        const tx = await poolWithUser.claimReward(claimAmount)
        const receipt: TransactionReceipt = await tx.wait()

        // Calculate gas used
        const gasCost = receipt!.gasUsed * receipt!.gasPrice

        // Get balance after claim
        const balanceAfter = await hre.ethers.provider.getBalance(user1.address)

        // Check balances
        expect(balanceAfter).to.equal(balanceBefore + claimAmount - gasCost)
        expect(await rewardPool.pendingRewards(user1.address)).to.equal(
          rewardAmount - claimAmount,
        )
        expect(await rewardPool.totalPendingRewards()).to.equal(
          rewardAmount - claimAmount,
        )
        expect(await rewardPool.poolBalance()).to.equal(
          depositAmount - claimAmount,
        )
      })

      it('reverts when pool has insufficient balance', async function () {
        // Mine blocks until timelock expires
        await mine(10, { interval: TIMELOCK })

        // Withdraw all funds
        await poolWithManager.withdraw(await poolWithManager.poolBalance())

        await expect(poolWithUser.claimReward(claimAmount))
          .to.be.revertedWithCustomError(rewardPool, 'InsufficientPoolBalance')
          .withArgs(claimAmount, 0)
      })
    })
  })

  describe('Extend timelock', function () {
    let rewardPool: Contract
    let manager: HardhatEthersSigner
    let stranger: HardhatEthersSigner
    let poolWithManager: Contract

    beforeEach(async function () {
      const deployment = await loadFixture(deployERC20RewardPoolContract)
      rewardPool = deployment.rewardPool
      manager = deployment.manager
      stranger = deployment.stranger

      // Connect with manager
      poolWithManager = rewardPool.connect(manager) as typeof rewardPool
    })

    it('allows manager to extend timelock', async function () {
      const currentTimelock = await poolWithManager.timelock()
      const newTimelock = currentTimelock + 1000n

      await expect(poolWithManager.extendTimelock(newTimelock))
        .to.emit(rewardPool, 'TimelockExtended')
        .withArgs(newTimelock, currentTimelock)
      expect(await rewardPool.timelock()).to.equal(newTimelock)
    })

    it('reverts when extending timelock to the past', async function () {
      const blockTimestamp = (await time.latest()) + 1
      const proposedTimelock = blockTimestamp - 1

      await expect(poolWithManager.extendTimelock(proposedTimelock))
        .to.be.revertedWithCustomError(rewardPool, 'TimelockMustBeInTheFuture')
        .withArgs(proposedTimelock, blockTimestamp)
    })

    it('reverts when reducing existing timelock', async function () {
      const currentTimelock = await poolWithManager.timelock()
      const proposedTimelock = currentTimelock - 1n

      await expect(poolWithManager.extendTimelock(proposedTimelock))
        .to.be.revertedWithCustomError(
          rewardPool,
          'TimelockMustBeGreaterThanCurrent',
        )
        .withArgs(proposedTimelock, currentTimelock)
    })

    it('reverts when non-manager tries to extend timelock', async function () {
      // Connect with stranger
      const poolWithStranger = rewardPool.connect(stranger) as typeof rewardPool

      await expect(
        poolWithStranger.extendTimelock((await time.latest()) + 1000),
      ).to.be.revertedWithCustomError(
        rewardPool,
        'AccessControlUnauthorizedAccount',
      )
    })
  })

  describe('Token rescue', function () {
    it('allows manager to rescue other ERC20 tokens', async function () {
      const { rewardPool, manager } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Connect with manager
      const pool = rewardPool.connect(manager) as typeof rewardPool

      // Deploy additional token to rescue
      const OtherToken = await hre.ethers.getContractFactory('MockERC20')
      const otherToken = await OtherToken.deploy('Other Token', 'OTHER')

      // Send tokens to pool
      const rescueAmount = hre.ethers.parseEther('50')
      await otherToken.mint(await rewardPool.getAddress(), rescueAmount)

      // Rescue tokens
      await expect(pool.rescueToken(await otherToken.getAddress()))
        .to.emit(rewardPool, 'RescueToken')
        .withArgs(await otherToken.getAddress(), rescueAmount)

      expect(await otherToken.balanceOf(manager.address)).to.equal(rescueAmount)
    })

    it('allows manager to rescue native tokens', async function () {
      const { rewardPool, manager } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Connect with manager
      const pool = rewardPool.connect(manager) as typeof rewardPool

      const nativeAmount = hre.ethers.parseEther('10')

      // Force send native tokens to contract
      await setBalance(await rewardPool.getAddress(), nativeAmount)

      // Get balance before rescue
      const balanceBefore = await hre.ethers.provider.getBalance(
        manager.address,
      )

      // Rescue tokens
      const tx = await pool.rescueToken(NATIVE_TOKEN_ADDRESS)
      const receipt: TransactionReceipt = await tx.wait()

      // Calculate gas used
      const gasCost = receipt!.gasUsed * receipt!.gasPrice

      // Get balance after rescue
      const balanceAfter = await hre.ethers.provider.getBalance(manager.address)

      // Check balance
      expect(balanceAfter).to.equal(balanceBefore + nativeAmount - gasCost)
    })

    it('reverts when trying to rescue pool token', async function () {
      const { rewardPool, mockERC20, manager } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Connect with manager
      const pool = rewardPool.connect(manager) as typeof rewardPool

      await expect(
        pool.rescueToken(await mockERC20.getAddress()),
      ).to.be.revertedWithCustomError(rewardPool, 'CannotRescuePoolToken')
    })

    it('reverts when non-manager tries to rescue tokens', async function () {
      const { rewardPool, mockERC20, stranger } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Connect with stranger
      const pool = rewardPool.connect(stranger) as typeof rewardPool

      await expect(
        pool.rescueToken(await mockERC20.getAddress()),
      ).to.be.revertedWithCustomError(
        rewardPool,
        'AccessControlUnauthorizedAccount',
      )
    })
  })

  describe('Upgrade', function () {
    it('allows admin to upgrade the contract', async function () {
      const { rewardPool, mockERC20 } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      const proxyAddress = await rewardPool.getAddress()

      // Get current implementation address
      const currentImplementationAddress =
        await hre.upgrades.erc1967.getImplementationAddress(proxyAddress)

      // Deploy new implementation
      const RewardPoolV2 = await hre.ethers.getContractFactory(CONTRACT_NAME)
      const upgradedPool = await hre.upgrades.upgradeProxy(
        proxyAddress,
        RewardPoolV2,
        { kind: 'uups', redeployImplementation: 'always' },
      )

      // Get new implementation address
      const newImplementationAddress =
        await hre.upgrades.erc1967.getImplementationAddress(proxyAddress)

      // Verify implementation changed
      expect(newImplementationAddress).to.not.equal(
        currentImplementationAddress,
      )

      // Verify state was preserved
      expect(await upgradedPool.poolToken()).to.equal(
        await mockERC20.getAddress(),
      )
      expect(await upgradedPool.rewardFunctionId()).to.equal(
        MOCK_REWARD_FUNCTION_ID,
      )
    })

    it('reverts when non-admin tries to upgrade', async function () {
      const { rewardPool, stranger } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Deploy new implementation
      const RewardPoolV2 = await hre.ethers.getContractFactory(CONTRACT_NAME)
      const rewardPoolV2 = await RewardPoolV2.deploy()
      await rewardPoolV2.waitForDeployment()

      // Connect with stranger
      const poolWithStranger = rewardPool.connect(stranger) as typeof rewardPool

      // Try to update proxy
      await expect(
        poolWithStranger.upgradeToAndCall(
          await rewardPoolV2.getAddress(),
          '0x',
        ),
      ).to.be.rejectedWith('AccessControlUnauthorizedAccount')
    })
  })

  describe('Admin change', function () {
    it('DEFAULT_ADMIN_ROLE transfer works with delay', async function () {
      const { rewardPool, owner, stranger } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      // Check that owner is the current admin
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true

      // Begin the admin transfer process
      await rewardPool.beginDefaultAdminTransfer(stranger.address)

      // Connect with new admin account and try to accept too early
      const rewardPoolWithStranger = rewardPool.connect(
        stranger,
      ) as typeof rewardPool

      await expect(
        rewardPoolWithStranger.acceptDefaultAdminTransfer(),
      ).to.be.revertedWithCustomError(
        rewardPool,
        'AccessControlEnforcedDefaultAdminDelay',
      )

      // Wait out the delay
      await mine(10, { interval: ADMIN_CHANGE_DELAY })

      // Accept the transfer
      await rewardPoolWithStranger.acceptDefaultAdminTransfer()

      // Verify admin role has been transferred
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          stranger.address,
        ),
      ).to.be.true
      expect(
        await rewardPool.hasRole(
          await rewardPool.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.false
    })
  })
})
