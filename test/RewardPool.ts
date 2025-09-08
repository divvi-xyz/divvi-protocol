import { expect } from 'chai'
import { Contract, TransactionReceipt, AbiCoder } from 'ethers'
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
const MOCK_REWARD_FUNCTION_ARGS = [1000, 2000]
const WEEK_IN_SECONDS = 60 * 60 * 24 * 7
const TIMELOCK = WEEK_IN_SECONDS
const MANAGER_CAPITAL = hre.ethers.parseEther('1000')

// Helper function to generate idempotency keys for testing
function generateTestIdempotencyKey(
  referrer: string,
  nonce: number = 0,
): string {
  return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`${referrer}-${nonce}`))
}

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

    const LinearReward = await hre.ethers.getContractFactory('LinearReward')
    const linearReward = await LinearReward.deploy()

    const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)

    const tokenAddress =
      tokenType === 'native'
        ? NATIVE_TOKEN_ADDRESS
        : await mockERC20.getAddress()
    const rewardFunctionAddress = await linearReward.getAddress()

    const implementation = await RewardPool.deploy(
      tokenAddress,
      rewardFunctionAddress,
      owner.address,
      manager.address,
      (await time.latest()) + TIMELOCK,
      0,
      deployer.address,
    )
    await implementation.waitForDeployment()

    // Mint tokens to manager for deposits
    await mockERC20.mint(manager.address, MANAGER_CAPITAL)

    // Approve tokens for deposit
    const mockToken = mockERC20.connect(manager) as typeof mockERC20
    await mockToken.approve(await implementation.getAddress(), MANAGER_CAPITAL)

    return {
      rewardPool: implementation,
      mockERC20,
      deployer,
      owner,
      manager,
      user1,
      user2,
      stranger,
      rewardFunctionAddress,
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
        const { rewardPool, mockERC20, owner, manager, rewardFunctionAddress } =
          await loadFixture(deployFixture)

        const expectedTokenAddress =
          tokenType === 'native'
            ? NATIVE_TOKEN_ADDRESS
            : await mockERC20.getAddress()

        expect(await rewardPool.poolToken()).to.equal(expectedTokenAddress)
        expect(await rewardPool.isNativeToken()).to.equal(
          tokenType === 'native',
        )
        expect(await rewardPool.rewardFunctionAddress()).to.equal(
          rewardFunctionAddress,
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
            rewardFunctionAddress,
            currentTimelock,
          )
      })

      it(`reverts when trying to initialize after deployment with ${tokenType} token`, async function () {
        const { rewardPool, mockERC20, owner, manager, rewardFunctionAddress } =
          await loadFixture(deployFixture)

        const tokenAddress =
          tokenType === 'native'
            ? NATIVE_TOKEN_ADDRESS
            : await mockERC20.getAddress()

        await expect(
          rewardPool.initialize(
            tokenAddress,
            rewardFunctionAddress,
            owner.address,
            manager.address,
            (await time.latest()) + TIMELOCK,
            0,
            owner.address,
          ),
        ).to.be.revertedWithCustomError(rewardPool, 'AlreadyInitialized')
      })
    })

    it('reverts when owner is zero address', async function () {
      const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)
      const [deployer] = await hre.ethers.getSigners()

      const LinearReward = await hre.ethers.getContractFactory('LinearReward')
      const linearReward = await LinearReward.deploy()
      const rewardFunctionAddress = await linearReward.getAddress()

      await expect(
        RewardPool.deploy(
          NATIVE_TOKEN_ADDRESS,
          rewardFunctionAddress,
          hre.ethers.ZeroAddress, // zero owner
          deployer.address,
          (await time.latest()) + TIMELOCK,
          0,
          deployer.address,
        ),
      )
        .to.be.revertedWithCustomError(RewardPool, 'ZeroAddressNotAllowed')
        .withArgs(0)
    })

    it('reverts when manager is zero address', async function () {
      const RewardPool = await hre.ethers.getContractFactory(CONTRACT_NAME)
      const [deployer] = await hre.ethers.getSigners()

      const LinearReward = await hre.ethers.getContractFactory('LinearReward')
      const linearReward = await LinearReward.deploy()
      const rewardFunctionAddress = await linearReward.getAddress()

      await expect(
        RewardPool.deploy(
          NATIVE_TOKEN_ADDRESS,
          rewardFunctionAddress,
          deployer.address,
          hre.ethers.ZeroAddress, // zero manager
          (await time.latest()) + TIMELOCK,
          0,
          deployer.address,
        ),
      )
        .to.be.revertedWithCustomError(RewardPool, 'ZeroAddressNotAllowed')
        .withArgs(1)
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

    it('allows owner to add rewards with idempotency', async function () {
      // Prepare reward data
      const rewards = [
        {
          referrer: user1.address,
          amount: hre.ethers.parseEther('10'),
          idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
        },
        {
          referrer: user2.address,
          amount: hre.ethers.parseEther('20'),
          idempotencyKey: generateTestIdempotencyKey(user2.address, 1),
        },
      ]

      await expect(pool.addRewards(rewards, MOCK_REWARD_FUNCTION_ARGS))
        .to.emit(rewardPool, 'AddReward')
        .withArgs(user1.address, rewards[0].amount, MOCK_REWARD_FUNCTION_ARGS)
        .to.emit(rewardPool, 'AddRewardWithIdempotency')
        .withArgs(
          user1.address,
          rewards[0].amount,
          rewards[0].idempotencyKey,
          MOCK_REWARD_FUNCTION_ARGS,
        )
        .to.emit(rewardPool, 'AddReward')
        .withArgs(user2.address, rewards[1].amount, MOCK_REWARD_FUNCTION_ARGS)
        .to.emit(rewardPool, 'AddRewardWithIdempotency')
        .withArgs(
          user2.address,
          rewards[1].amount,
          rewards[1].idempotencyKey,
          MOCK_REWARD_FUNCTION_ARGS,
        )

      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        rewards[0].amount,
      )
      expect(await rewardPool.pendingRewards(user2.address)).to.equal(
        rewards[1].amount,
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(
        rewards[0].amount + rewards[1].amount,
      )

      // Check idempotency keys are marked as processed
      expect(
        await rewardPool.isIdempotencyKeyProcessed(rewards[0].idempotencyKey),
      ).to.be.true
      expect(
        await rewardPool.isIdempotencyKeyProcessed(rewards[1].idempotencyKey),
      ).to.be.true
    })

    it('allows adding multiple rewards for the same user with different idempotency keys', async function () {
      // First reward
      const firstReward = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
      }
      await pool.addRewards([firstReward], MOCK_REWARD_FUNCTION_ARGS)

      // Second reward with different idempotency key
      const secondReward = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('15'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 2),
      }
      await pool.addRewards([secondReward], MOCK_REWARD_FUNCTION_ARGS)

      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        hre.ethers.parseEther('25'),
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(
        hre.ethers.parseEther('25'),
      )
    })

    it('skips rewards with duplicate idempotency keys', async function () {
      const reward = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
      }

      // First call - should process the reward
      await expect(pool.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS))
        .to.emit(rewardPool, 'AddReward')
        .withArgs(user1.address, reward.amount, MOCK_REWARD_FUNCTION_ARGS)
        .to.emit(rewardPool, 'AddRewardWithIdempotency')
        .withArgs(
          user1.address,
          reward.amount,
          reward.idempotencyKey,
          MOCK_REWARD_FUNCTION_ARGS,
        )

      // Second call with same idempotency key - should skip
      await expect(pool.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS))
        .to.emit(rewardPool, 'AddRewardSkipped')
        .withArgs(user1.address, reward.amount, reward.idempotencyKey)
        .to.not.emit(rewardPool, 'AddReward')

      // Should only have the reward from the first call
      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        reward.amount,
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(reward.amount)
    })

    it('reverts when zero address is provided as user', async function () {
      const reward = {
        referrer: hre.ethers.ZeroAddress,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: generateTestIdempotencyKey(hre.ethers.ZeroAddress, 1),
      }

      await expect(pool.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS))
        .to.be.revertedWithCustomError(rewardPool, 'ZeroAddressNotAllowed')
        .withArgs(0)
    })

    it('reverts when zero amount is provided', async function () {
      const reward = {
        referrer: user1.address,
        amount: 0,
        idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
      }

      await expect(pool.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS))
        .to.be.revertedWithCustomError(
          rewardPool,
          'RewardAmountMustBeGreaterThanZero',
        )
        .withArgs(0)
    })

    it('reverts when empty idempotency key is provided', async function () {
      const reward = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: hre.ethers.ZeroHash,
      }

      await expect(pool.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS))
        .to.be.revertedWithCustomError(rewardPool, 'EmptyIdempotencyKey')
        .withArgs(0)
    })

    it('reverts when non-owner tries to add rewards', async function () {
      // Connect with stranger
      const poolWithStranger = rewardPool.connect(stranger) as typeof rewardPool

      const reward = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
      }

      await expect(
        poolWithStranger.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS),
      ).to.be.revertedWithCustomError(
        rewardPool,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('processes mixed batch with new and duplicate idempotency keys', async function () {
      const reward1 = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('10'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
      }
      const reward2 = {
        referrer: user2.address,
        amount: hre.ethers.parseEther('20'),
        idempotencyKey: generateTestIdempotencyKey(user2.address, 1),
      }

      // First batch - process both
      await pool.addRewards([reward1, reward2], MOCK_REWARD_FUNCTION_ARGS)

      // Second batch - mix of new and duplicate
      const reward3 = {
        referrer: user1.address,
        amount: hre.ethers.parseEther('15'),
        idempotencyKey: generateTestIdempotencyKey(user1.address, 2), // New key
      }

      await expect(
        pool.addRewards([reward1, reward3], MOCK_REWARD_FUNCTION_ARGS),
      )
        .to.emit(rewardPool, 'AddRewardSkipped') // reward1 duplicate
        .withArgs(user1.address, reward1.amount, reward1.idempotencyKey)
        .to.emit(rewardPool, 'AddReward') // reward3 new
        .withArgs(user1.address, reward3.amount, MOCK_REWARD_FUNCTION_ARGS)
        .to.emit(rewardPool, 'AddRewardWithIdempotency') // reward3 new
        .withArgs(
          user1.address,
          reward3.amount,
          reward3.idempotencyKey,
          MOCK_REWARD_FUNCTION_ARGS,
        )

      // Should have rewards from first batch plus the new reward3
      expect(await rewardPool.pendingRewards(user1.address)).to.equal(
        reward1.amount + reward3.amount,
      )
      expect(await rewardPool.pendingRewards(user2.address)).to.equal(
        reward2.amount,
      )
      expect(await rewardPool.totalPendingRewards()).to.equal(
        reward1.amount + reward2.amount + reward3.amount,
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
          const reward = {
            referrer: user1.address,
            amount: rewardAmount,
            idempotencyKey: generateTestIdempotencyKey(user1.address, 1),
          }
          await poolWithOwner.addRewards([reward], MOCK_REWARD_FUNCTION_ARGS)

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

  describe('Protocol Fee', function () {
    tokenTypes.forEach(function ({ tokenType, deployFixture }) {
      describe(`with ${tokenType} token`, function () {
        let rewardPool: Contract
        let mockERC20: Contract
        let owner: HardhatEthersSigner
        let manager: HardhatEthersSigner
        let user1: HardhatEthersSigner
        let deployer: HardhatEthersSigner
        let poolWithOwner: Contract
        let poolWithManager: Contract

        beforeEach(async function () {
          const deployment = await loadFixture(deployFixture)
          rewardPool = deployment.rewardPool
          mockERC20 = deployment.mockERC20
          owner = deployment.owner
          manager = deployment.manager
          user1 = deployment.user1
          deployer = deployment.deployer

          // Connect with owner and manager
          poolWithOwner = rewardPool.connect(owner) as typeof rewardPool
          poolWithManager = rewardPool.connect(manager) as typeof rewardPool
        })

        it('initializes with correct protocol fee and reserve address', async function () {
          expect(await rewardPool.protocolFee()).to.equal(0)
          expect(await rewardPool.reserveAddress()).to.equal(deployer.address)
        })

        it('allows owner to set protocol fee', async function () {
          const newFee = hre.ethers.parseEther('0.05') // 5%

          await expect(poolWithOwner.setProtocolFee(newFee))
            .to.emit(rewardPool, 'ProtocolFeeUpdated')
            .withArgs(newFee, 0)

          expect(await rewardPool.protocolFee()).to.equal(newFee)
        })

        it('allows owner to set reserve address', async function () {
          const newReserveAddress = user1.address

          await expect(poolWithOwner.setReserveAddress(newReserveAddress))
            .to.emit(rewardPool, 'ReserveAddressUpdated')
            .withArgs(newReserveAddress, deployer.address)

          expect(await rewardPool.reserveAddress()).to.equal(newReserveAddress)
        })

        it('reverts when non-owner tries to set protocol fee', async function () {
          const newFee = hre.ethers.parseEther('0.05')

          await expect(
            poolWithManager.setProtocolFee(newFee),
          ).to.be.revertedWithCustomError(
            rewardPool,
            'AccessControlUnauthorizedAccount',
          )
        })

        it('reverts when non-owner tries to set reserve address', async function () {
          const newReserveAddress = user1.address

          await expect(
            poolWithManager.setReserveAddress(newReserveAddress),
          ).to.be.revertedWithCustomError(
            rewardPool,
            'AccessControlUnauthorizedAccount',
          )
        })

        it('reverts when setting invalid protocol fee', async function () {
          const invalidFee = hre.ethers.parseEther('1.1') // 110%

          await expect(
            poolWithOwner.setProtocolFee(invalidFee),
          ).to.be.revertedWithCustomError(rewardPool, 'InvalidProtocolFee')
        })

        it('reverts when setting zero address as reserve', async function () {
          await expect(
            poolWithOwner.setReserveAddress(hre.ethers.ZeroAddress),
          ).to.be.revertedWithCustomError(rewardPool, 'InvalidReserveAddress')
        })

        it('collects protocol fees when adding rewards', async function () {
          // Set protocol fee to 5%
          const protocolFee = hre.ethers.parseEther('0.05') // 5%
          await poolWithOwner.setProtocolFee(protocolFee)

          // Set reserve address to user1
          await poolWithOwner.setReserveAddress(user1.address)

          // First deposit funds to the pool so it has enough to pay fees
          const depositAmount = hre.ethers.parseEther('1000')
          if (tokenType === 'ERC20') {
            await poolWithManager.deposit(depositAmount)
          } else {
            await poolWithManager.deposit(depositAmount, {
              value: depositAmount,
            })
          }

          const rewardAmount = hre.ethers.parseEther('100')
          const feeAmount = hre.ethers.parseEther('5') // 5% of 100

          // For ERC20 token, we need to mint and approve the reward amount
          if (tokenType === 'ERC20') {
            await mockERC20.mint(deployer.address, rewardAmount)
            await mockERC20.approve(await rewardPool.getAddress(), rewardAmount)
          }

          const rewards = [
            {
              referrer: user1.address,
              amount: rewardAmount,
              idempotencyKey: hre.ethers.keccak256(
                hre.ethers.toUtf8Bytes('test-key-1'),
              ),
            },
          ]

          // Get balance before for native token test
          const balanceBefore =
            tokenType === 'native'
              ? await hre.ethers.provider.getBalance(user1.address)
              : 0n

          const tx = await poolWithOwner.addRewards(rewards, [])

          // User should receive full reward amount (no fee deduction)
          expect(await rewardPool.pendingRewards(user1.address)).to.equal(
            rewardAmount,
          )

          // Protocol fee should be collected from the pool balance to reserve address
          if (tokenType === 'ERC20') {
            expect(await mockERC20.balanceOf(user1.address)).to.equal(feeAmount)
          } else {
            const balanceAfter = await hre.ethers.provider.getBalance(
              user1.address,
            )
            const actualFeeReceived = balanceAfter - balanceBefore
            expect(actualFeeReceived).to.equal(feeAmount)
          }

          // Event should be emitted with correct parameters
          await expect(tx)
            .to.emit(rewardPool, 'ProtocolFeeCollected')
            .withArgs(user1.address, rewardAmount, feeAmount, protocolFee)
        })

        it('does not collect fees when protocol fee is zero', async function () {
          // Protocol fee is already 0 from initialization
          expect(await rewardPool.protocolFee()).to.equal(0)

          // Deposit funds
          const depositAmount = hre.ethers.parseEther('1000')
          if (tokenType === 'ERC20') {
            await poolWithManager.deposit(depositAmount)
          } else {
            await poolWithManager.deposit(depositAmount, {
              value: depositAmount,
            })
          }

          // Add rewards
          const rewardAmount = hre.ethers.parseEther('100')
          const idempotencyKey = generateTestIdempotencyKey(user1.address, 1)
          const rewardData = [
            {
              referrer: user1.address,
              amount: rewardAmount,
              idempotencyKey: idempotencyKey,
            },
          ]

          await expect(
            poolWithOwner.addRewards(rewardData, MOCK_REWARD_FUNCTION_ARGS),
          ).to.not.emit(rewardPool, 'ProtocolFeeCollected')

          // Check that user gets the full amount
          expect(await rewardPool.pendingRewards(user1.address)).to.equal(
            rewardAmount,
          )
        })
      })
    })
  })

  describe('KPI management', function () {
    let rewardPool: Contract
    let owner: HardhatEthersSigner
    let user1: HardhatEthersSigner
    let user2: HardhatEthersSigner
    let stranger: HardhatEthersSigner
    let pool: Contract
    let rewardFunctionAddress: string
    const mockKpiFunctionId = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes('mock-kpi-function'),
    )
    const mockStartTime = 1000000
    const mockEndTime = 2000000
    const mockRewardPeriodKey = hre.ethers.keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256'],
        [mockStartTime, mockEndTime],
      ),
    )
    let mockKpis: { referrer: string; kpi: number }[]

    function getIdempotencyKey(
      referrer: string,
      periodStart: number = mockStartTime,
      periodEnd: number = mockEndTime,
    ) {
      return hre.ethers.keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'uint256'],
          [referrer, periodStart, periodEnd],
        ),
      )
    }

    beforeEach(async function () {
      const deployment = await loadFixture(deployERC20RewardPoolContract)
      rewardPool = deployment.rewardPool
      owner = deployment.owner
      user1 = deployment.user1
      user2 = deployment.user2
      stranger = deployment.stranger
      rewardFunctionAddress = deployment.rewardFunctionAddress

      // Connect with owner
      pool = rewardPool.connect(owner) as typeof rewardPool

      mockKpis = [
        {
          referrer: user1.address,
          kpi: 100,
        },
        {
          referrer: user2.address,
          kpi: 200,
        },
      ]
    })

    describe('Update KPI', function () {
      it('allows owner to add and update kpis', async function () {
        await expect(
          pool.updatePeriodKpis(
            mockKpis,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user1.address,
            mockRewardPeriodKey,
            100,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user2.address,
            mockRewardPeriodKey,
            200,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )

        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user1.address,
          ),
        ).to.equal(100)
        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user2.address,
          ),
        ).to.equal(200)

        expect(
          await rewardPool.getPeriodReferrers(mockStartTime, mockEndTime),
        ).to.deep.equal([user1.address, user2.address])

        expect(
          await rewardPool.isPeriodProcessed(mockStartTime, mockEndTime),
        ).to.equal(false)

        await expect(
          pool.updatePeriodKpis(
            [
              {
                referrer: user1.address,
                kpi: 150,
              },
            ],
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user1.address,
            mockRewardPeriodKey,
            150,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )

        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user1.address,
          ),
        ).to.equal(150)
      })

      it('allows owner to add kpis with zero kpi', async function () {
        await expect(
          pool.updatePeriodKpis(
            [
              {
                referrer: user1.address,
                kpi: 100,
              },
              {
                referrer: user2.address,
                kpi: 0,
              },
            ],
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user1.address,
            mockRewardPeriodKey,
            100,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user2.address,
            mockRewardPeriodKey,
            0,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )

        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user1.address,
          ),
        ).to.equal(100)
        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user2.address,
          ),
        ).to.equal(0)

        expect(
          await rewardPool.getPeriodReferrers(mockStartTime, mockEndTime),
        ).to.deep.equal([user1.address, user2.address])

        await expect(
          pool.updatePeriodKpis(
            [
              {
                referrer: user1.address,
                kpi: 0,
              },
            ],
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        )
          .to.emit(rewardPool, 'KpiUpdated')
          .withArgs(
            user1.address,
            mockRewardPeriodKey,
            0,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          )

        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user1.address,
          ),
        ).to.equal(0)
        expect(
          await rewardPool.getPeriodKpi(
            mockStartTime,
            mockEndTime,
            user2.address,
          ),
        ).to.equal(0)

        expect(
          await rewardPool.getPeriodReferrers(mockStartTime, mockEndTime),
        ).to.deep.equal([user1.address, user2.address])
      })

      it('reverts when kpis are added for zero address', async function () {
        const kpis = [
          {
            referrer: hre.ethers.ZeroAddress,
            kpi: 100,
          },
        ]

        await expect(
          pool.updatePeriodKpis(
            kpis,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        ).to.be.revertedWithCustomError(rewardPool, 'ZeroAddressNotAllowed')
      })

      it('reverts when start time is greater than end time', async function () {
        await expect(
          pool.updatePeriodKpis(
            mockKpis,
            mockEndTime,
            mockStartTime,
            mockKpiFunctionId,
          ),
        ).to.be.revertedWithCustomError(rewardPool, 'InvalidPeriod')
      })

      it('reverts if kpi period is already processed', async function () {
        await pool.updatePeriodKpis(
          mockKpis,
          mockStartTime,
          mockEndTime,
          mockKpiFunctionId,
        )

        await pool.processPeriod(mockStartTime, mockEndTime, 100)

        await expect(
          pool.updatePeriodKpis(
            mockKpis,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        ).to.be.revertedWithCustomError(rewardPool, 'PeriodAlreadyProcessed')
      })

      it('does not allow non-owner to add kpis', async function () {
        const poolWithStranger = pool.connect(stranger) as typeof rewardPool

        await expect(
          poolWithStranger.updatePeriodKpis(
            mockKpis,
            mockStartTime,
            mockEndTime,
            mockKpiFunctionId,
          ),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'AccessControlUnauthorizedAccount',
        )
      })
    })

    describe('Process Period', function () {
      it('allows owner to process reward period and distribute rewards', async function () {
        await pool.updatePeriodKpis(
          mockKpis,
          mockStartTime,
          mockEndTime,
          mockKpiFunctionId,
        )

        await expect(pool.processPeriod(mockStartTime, mockEndTime, 100))
          .to.emit(rewardPool, 'PeriodProcessed')
          .withArgs(mockRewardPeriodKey, mockStartTime, mockEndTime, 100, 99, 2)
          .to.emit(rewardPool, 'AddRewardWithIdempotency')
          .withArgs(user1.address, 33, getIdempotencyKey(user1.address), [
            mockStartTime,
            mockEndTime,
          ])
          .to.emit(rewardPool, 'AddRewardWithIdempotency')
          .withArgs(user2.address, 66, getIdempotencyKey(user2.address), [
            mockStartTime,
            mockEndTime,
          ])

        expect(
          await rewardPool.isPeriodProcessed(mockStartTime, mockEndTime),
        ).to.equal(true)

        expect(await rewardPool.pendingRewards(user1.address)).to.equal(33)
        expect(await rewardPool.pendingRewards(user2.address)).to.equal(66)
      })

      it('handles some users with zero rewards', async function () {
        await pool.updatePeriodKpis(
          [
            {
              referrer: user1.address,
              kpi: 0,
            },
            {
              referrer: user2.address,
              kpi: 200,
            },
          ],
          mockStartTime,
          mockEndTime,
          mockKpiFunctionId,
        )

        await expect(pool.processPeriod(mockStartTime, mockEndTime, 100))
          .to.emit(rewardPool, 'PeriodProcessed')
          .withArgs(
            mockRewardPeriodKey,
            mockStartTime,
            mockEndTime,
            100,
            100,
            1,
          )
          .to.emit(rewardPool, 'AddRewardWithIdempotency')
          .withArgs(user2.address, 100, getIdempotencyKey(user2.address), [
            mockStartTime,
            mockEndTime,
          ])

        expect(await rewardPool.pendingRewards(user1.address)).to.equal(0)
        expect(await rewardPool.pendingRewards(user2.address)).to.equal(100)
      })

      it('does not add reward if idempotency key is already processed', async function () {
        const idempotencyKey = getIdempotencyKey(user1.address)

        await pool.addRewards(
          [
            {
              referrer: user1.address,
              amount: 100,
              idempotencyKey,
            },
          ],
          [mockStartTime, mockEndTime],
        )

        await pool.updatePeriodKpis(
          mockKpis,
          mockStartTime,
          mockEndTime,
          mockKpiFunctionId,
        )

        await expect(pool.processPeriod(mockStartTime, mockEndTime, 100))
          .to.emit(rewardPool, 'PeriodProcessed')
          .withArgs(mockRewardPeriodKey, mockStartTime, mockEndTime, 100, 66, 1)
          .to.emit(rewardPool, 'AddRewardSkipped')
          .withArgs(user1.address, 33, idempotencyKey)
          .to.emit(rewardPool, 'AddRewardWithIdempotency')
          .withArgs(user2.address, 66, getIdempotencyKey(user2.address), [
            mockStartTime,
            mockEndTime,
          ])
      })

      it('reverts if reward period is already processed', async function () {
        await pool.updatePeriodKpis(
          mockKpis,
          mockStartTime,
          mockEndTime,
          mockKpiFunctionId,
        )

        await pool.processPeriod(mockStartTime, mockEndTime, 100)

        await expect(
          pool.processPeriod(mockStartTime, mockEndTime, 100),
        ).to.be.revertedWithCustomError(rewardPool, 'PeriodAlreadyProcessed')
      })

      it('reverts if reward period has no users / kpis', async function () {
        await expect(
          pool.processPeriod(mockStartTime, mockEndTime, 100),
        ).to.be.revertedWithCustomError(rewardPool, 'InvalidPeriod')
      })

      it('does not allow non-owner to process reward period', async function () {
        const poolWithStranger = pool.connect(stranger) as typeof rewardPool

        await expect(
          poolWithStranger.processPeriod(mockStartTime, mockEndTime, 100),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'AccessControlUnauthorizedAccount',
        )
      })
    })

    describe('Set Reward Function Address', function () {
      it('allows owner to set reward function address', async function () {
        const anotherRewardFunctionAddress =
          '0x1234567890123456789012345678901234567890'
        await expect(
          pool.setRewardFunctionAddress(anotherRewardFunctionAddress),
        )
          .to.emit(rewardPool, 'RewardFunctionAddressUpdated')
          .withArgs(anotherRewardFunctionAddress, rewardFunctionAddress)

        expect(await rewardPool.rewardFunctionAddress()).to.equal(
          anotherRewardFunctionAddress,
        )
      })

      it('reverts if reward function address is zero address', async function () {
        await expect(
          pool.setRewardFunctionAddress(hre.ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'InvalidRewardFunctionAddress',
        )
      })

      it('does not allow non-owner to set reward function address', async function () {
        const poolWithStranger = pool.connect(stranger) as typeof rewardPool
        const anotherRewardFunctionAddress =
          '0x1234567890123456789012345678901234567890'

        await expect(
          poolWithStranger.setRewardFunctionAddress(
            anotherRewardFunctionAddress,
          ),
        ).to.be.revertedWithCustomError(
          rewardPool,
          'AccessControlUnauthorizedAccount',
        )
      })
    })
  })
})
