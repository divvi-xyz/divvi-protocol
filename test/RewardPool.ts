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
  async function deployRewardPoolContract({
    tokenType,
  }: {
    tokenType: 'native' | 'erc20'
  }) {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, manager, user1, user2, stranger] =
      await hre.ethers.getSigners()

    const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
    const mockERC20 = await MockERC20.deploy('MockERC20', 'MOCK')

    const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)

    const tokenAddress =
      tokenType === 'native'
        ? NATIVE_TOKEN_ADDRESS
        : await mockERC20.getAddress()

    const proxy = await hre.upgrades.deployProxy(
      RewardPool,
      [
        tokenAddress,
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
      deployer,
      owner,
      manager,
      user1,
      user2,
      stranger,
    }
  }

  async function deployERC20RewardPoolContract() {
    return deployRewardPoolContract({ tokenType: 'erc20' })
  }

  async function deployNativeRewardPoolContract() {
    return deployRewardPoolContract({ tokenType: 'native' })
  }

  const tokenTypes = [
    {
      tokenType: 'ERC20',
      deployFixture: deployERC20RewardPoolContract,
      deposit: async function (contract: Contract, amount: bigint) {
        return contract.deposit(amount)
      },
      getBalance: async function (address: string, contract: Contract) {
        return contract.balanceOf(address)
      },
      getGasDeduction: function () {
        return 0n
      },
    },
    {
      tokenType: 'native',
      deployFixture: deployNativeRewardPoolContract,
      deposit: async function (contract: Contract, amount: bigint) {
        return contract.deposit(amount, { value: amount })
      },
      getBalance: async function (address: string) {
        return hre.ethers.provider.getBalance(address)
      },
      getGasDeduction: function (receipt: TransactionReceipt) {
        return receipt.gasUsed * receipt.gasPrice
      },
    },
  ]

  describe('Initialization', function () {
    tokenTypes.forEach(function ({ tokenType, deployFixture }) {
      it(`initializes correclty with ${tokenType} token`, async function () {
        const { rewardPool, mockERC20, owner, manager } =
          await loadFixture(deployFixture)

        const expectedTokenAddress =
          tokenType === 'native'
            ? NATIVE_TOKEN_ADDRESS
            : await mockERC20.getAddress()

        expect(await rewardPool.poolToken()).to.equal(expectedTokenAddress)
        expect(await rewardPool.isNativeToken()).to.equal(
          tokenType === 'native',
        )
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
            expectedTokenAddress,
            MOCK_REWARD_FUNCTION_ID,
            currentTimelock,
          )
      })
    })
  })

  describe('Deposit', function () {
    const depositAmount = hre.ethers.parseEther('1')

    tokenTypes.forEach(function ({ tokenType, deposit, deployFixture }) {
      describe(`with ${tokenType} token`, function () {
        let rewardPool: Contract
        let manager: HardhatEthersSigner
        let stranger: HardhatEthersSigner
        let poolWithManager: Contract

        beforeEach(async function () {
          const deployment = await loadFixture(deployFixture)
          rewardPool = deployment.rewardPool
          manager = deployment.manager
          stranger = deployment.stranger

          // Connect with manager
          poolWithManager = rewardPool.connect(manager) as typeof rewardPool
        })

        it('allows manager to deposit tokens', async function () {
          await expect(deposit(poolWithManager, depositAmount))
            .to.emit(rewardPool, 'Deposit')
            .withArgs(depositAmount)

          expect(await rewardPool.poolBalance()).to.equal(depositAmount)
        })

        it('reverts when non-manager tries to deposit', async function () {
          const poolWithStranger = rewardPool.connect(
            stranger,
          ) as typeof rewardPool

          await expect(
            deposit(poolWithStranger, depositAmount),
          ).to.be.revertedWithCustomError(
            rewardPool,
            'AccessControlUnauthorizedAccount',
          )
        })

        if (tokenType === 'ERC20') {
          it('reverts when sending native tokens with ERC20 deposit', async function () {
            await expect(
              poolWithManager.deposit(depositAmount, {
                value: depositAmount,
              }),
            ).to.be.revertedWithCustomError(
              rewardPool,
              'NativeTokenNotAccepted',
            )
          })
        }

        if (tokenType === 'native') {
          it('reverts when amount mismatch in native token deposit', async function () {
            const sentAmount = hre.ethers.parseEther('4')

            await expect(
              poolWithManager.deposit(depositAmount, { value: sentAmount }),
            )
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
        }
      })
    })
  })

  describe('Withdraw', function () {
    const depositAmount = hre.ethers.parseEther('100')
    const withdrawAmount = hre.ethers.parseEther('50')

    tokenTypes.forEach(function ({
      tokenType,
      deposit,
      getBalance,
      getGasDeduction,
      deployFixture,
    }) {
      describe(`with ${tokenType} token`, function () {
        let rewardPool: Contract
        let mockERC20: Contract
        let manager: HardhatEthersSigner
        let stranger: HardhatEthersSigner
        let pool: Contract

        beforeEach(async function () {
          const deployment = await loadFixture(deployFixture)
          rewardPool = deployment.rewardPool
          mockERC20 = deployment.mockERC20
          manager = deployment.manager
          stranger = deployment.stranger

          // Connect with manager
          pool = rewardPool.connect(manager) as typeof rewardPool

          // Deposit
          await deposit(pool, depositAmount)
        })

        it('allows manager to withdraw after timelock', async function () {
          // Mine blocks until timelock expires
          await mine(10, { interval: TIMELOCK })

          // Get balance before withdrawal
          const balanceBefore = await getBalance(manager.address, mockERC20)

          // Withdraw
          const tx = await pool.withdraw(withdrawAmount)
          const receipt = await tx.wait()

          // Calculate deduction (gas used for native token)
          const deductionAmount = getGasDeduction(receipt)

          // Check event
          await expect(tx)
            .to.emit(rewardPool, 'Withdraw')
            .withArgs(withdrawAmount)

          // Check balances
          const balanceAfter = await getBalance(manager.address, mockERC20)
          expect(balanceAfter).to.equal(
            balanceBefore + withdrawAmount - deductionAmount,
          )

          expect(await rewardPool.poolBalance()).to.equal(
            depositAmount - withdrawAmount,
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
          const largeWithdrawAmount = depositAmount * 2n
          await expect(pool.withdraw(largeWithdrawAmount))
            .to.be.revertedWithCustomError(
              rewardPool,
              'InsufficientPoolBalance',
            )
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
    })
  })

  describe('Add reward', function () {
    let rewardPool: Contract
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let user2: HardhatEthersSigner
    let stranger: HardhatEthersSigner
    let pool: Contract

    beforeEach(async function () {
      const deployment = await loadFixture(deployERC20RewardPoolContract)
      rewardPool = deployment.rewardPool
      owner = deployment.owner
      user1 = deployment.user1
      user2 = deployment.user2
      stranger = deployment.stranger

      // Connect with owner
      pool = rewardPool.connect(owner) as typeof rewardPool
    })

    it('allows owner to add rewards', async function () {
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

    it('reverts when non-owner tries to add rewards', async function () {
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

    tokenTypes.forEach(function ({
      tokenType,
      deposit,
      getBalance,
      getGasDeduction,
      deployFixture,
    }) {
      describe(`with ${tokenType} token`, function () {
        let rewardPool: Contract
        let mockERC20: Contract
        let manager: HardhatEthersSigner
        let user1: HardhatEthersSigner
        let poolWithManager: Contract
        let poolWithUser: Contract

        beforeEach(async function () {
          const deployment = await loadFixture(deployFixture)
          rewardPool = deployment.rewardPool
          mockERC20 = deployment.mockERC20
          manager = deployment.manager
          user1 = deployment.user1

          // Connect with manager
          poolWithManager = rewardPool.connect(manager) as typeof rewardPool

          // Deposit
          await deposit(poolWithManager, depositAmount)

          // Connect with owner
          const poolWithOwner = rewardPool.connect(
            deployment.owner,
          ) as typeof rewardPool

          // Add rewards
          await poolWithOwner.addRewards(
            [user1.address],
            [rewardAmount],
            MOCK_REWARD_FUNCTION_ARGS,
          )

          // Connect with user
          poolWithUser = rewardPool.connect(user1) as typeof rewardPool
        })

        it('allows users to claim partial rewards', async function () {
          // Get balance before claim
          const balanceBefore = await getBalance(user1.address, mockERC20)

          // Claim rewards
          const tx = await poolWithUser.claimReward(claimAmount)
          const receipt = await tx.wait()

          // Calculate deduction (gas used for native token)
          const deduction = getGasDeduction(receipt)

          // Check event
          await expect(tx)
            .to.emit(rewardPool, 'ClaimReward')
            .withArgs(user1.address, claimAmount)

          // Check balances
          const balanceAfter = await getBalance(user1.address, mockERC20)
          expect(balanceAfter).to.equal(balanceBefore + claimAmount - deduction)
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
          // Get balance before claim
          const balanceBefore = await getBalance(user1.address, mockERC20)

          // Claim rewards
          const tx = await poolWithUser.claimReward(rewardAmount)
          const receipt = await tx.wait()

          // Calculate deduction (gas used for native token)
          const deduction = getGasDeduction(receipt)

          await expect(tx)
            .to.emit(rewardPool, 'ClaimReward')
            .withArgs(user1.address, rewardAmount)

          // Check balances
          const balanceAfter = await getBalance(user1.address, mockERC20)
          expect(balanceAfter).to.equal(
            balanceBefore + rewardAmount - deduction,
          )
          expect(await rewardPool.pendingRewards(user1.address)).to.equal(0)
          expect(await rewardPool.totalPendingRewards()).to.equal(0)
        })

        it('reverts when claiming more than pending rewards', async function () {
          // Try to claim more than allocated
          await expect(
            poolWithUser.claimReward(rewardAmount * 2n),
          ).to.be.revertedWithCustomError(
            rewardPool,
            'InsufficientRewardBalance',
          )
        })

        it('reverts when claiming zero amount', async function () {
          await expect(
            poolWithUser.claimReward(0),
          ).to.be.revertedWithCustomError(
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
            .to.be.revertedWithCustomError(
              rewardPool,
              'InsufficientPoolBalance',
            )
            .withArgs(claimAmount, 0)
        })
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
    tokenTypes.forEach(function ({ tokenType, deployFixture }) {
      describe(`with ${tokenType} token`, function () {
        const rescueAmount = hre.ethers.parseEther('10')

        let rewardPool: Contract
        let manager: HardhatEthersSigner
        let stranger: HardhatEthersSigner
        let poolWithManager: Contract
        let poolTokenAddress: string

        beforeEach(async function () {
          const deployment = await loadFixture(deployFixture)
          rewardPool = deployment.rewardPool
          manager = deployment.manager
          stranger = deployment.stranger

          // Connect with manager
          poolWithManager = rewardPool.connect(manager) as typeof rewardPool

          poolTokenAddress =
            tokenType === 'native'
              ? NATIVE_TOKEN_ADDRESS
              : await deployment.mockERC20.getAddress()
        })

        it('allows manager to rescue non-pool ERC20 tokens', async function () {
          // Deploy additional token to rescue
          const OtherToken = await hre.ethers.getContractFactory('MockERC20')
          const otherToken = await OtherToken.deploy('Other Token', 'OTHER')
          await otherToken.waitForDeployment()
          await otherToken.mint(await rewardPool.getAddress(), rescueAmount)

          // Rescue tokens
          await expect(
            poolWithManager.rescueToken(await otherToken.getAddress()),
          )
            .to.emit(rewardPool, 'RescueToken')
            .withArgs(await otherToken.getAddress(), rescueAmount)

          expect(await otherToken.balanceOf(manager.address)).to.equal(
            rescueAmount,
          )
        })

        if (tokenType === 'ERC20') {
          it('allows manager to rescue non-pool native tokens', async function () {
            // Force send native tokens to contract
            await setBalance(await rewardPool.getAddress(), rescueAmount)

            // Get balance before rescue
            const balanceBefore = await hre.ethers.provider.getBalance(
              manager.address,
            )

            // Rescue tokens
            const tx = await poolWithManager.rescueToken(NATIVE_TOKEN_ADDRESS)
            const receipt: TransactionReceipt = await tx.wait()

            // Calculate gas used
            const gasCost = receipt.gasUsed * receipt.gasPrice

            // Get balance after rescue
            const balanceAfter = await hre.ethers.provider.getBalance(
              manager.address,
            )

            // Check balance
            expect(balanceAfter).to.equal(
              balanceBefore + rescueAmount - gasCost,
            )
          })
        }

        it('reverts when trying to rescue pool token', async function () {
          await expect(
            poolWithManager.rescueToken(poolTokenAddress),
          ).to.be.revertedWithCustomError(rewardPool, 'CannotRescuePoolToken')
        })

        it('reverts when non-manager tries to rescue tokens', async function () {
          const poolWithStranger = rewardPool.connect(
            stranger,
          ) as typeof rewardPool

          await expect(
            poolWithStranger.rescueToken(poolTokenAddress),
          ).to.be.revertedWithCustomError(
            rewardPool,
            'AccessControlUnauthorizedAccount',
          )
        })
      })
    })
  })

  describe('Upgrade', function () {
    it('allows admin to upgrade the contract', async function () {
      const { rewardPool, mockERC20, owner } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      const proxyAddress = await rewardPool.getAddress()

      // Get current implementation address
      const currentImplementationAddress =
        await hre.upgrades.erc1967.getImplementationAddress(proxyAddress)

      // Deploy new implementation
      const RewardPoolV2 = await hre.ethers.getContractFactory(
        CONTRACT_NAME,
        owner,
      )
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

    it('reverts when deployer tries to upgrade', async function () {
      const { rewardPool, deployer } = await loadFixture(
        deployERC20RewardPoolContract,
      )

      const proxyAddress = await rewardPool.getAddress()

      // Deploy new implementation
      const RewardPoolV2 = await hre.ethers.getContractFactory(
        CONTRACT_NAME,
        deployer,
      )

      // Try to upgrade proxy
      await expect(
        hre.upgrades.upgradeProxy(proxyAddress, RewardPoolV2, {
          kind: 'uups',
          redeployImplementation: 'always',
        }),
      ).to.be.rejectedWith('AccessControlUnauthorizedAccount')
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

      // Connect with owner
      const poolWithOwner = rewardPool.connect(owner) as typeof rewardPool

      // Begin the admin transfer process
      await poolWithOwner.beginDefaultAdminTransfer(stranger.address)

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
