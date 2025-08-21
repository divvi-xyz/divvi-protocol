import { expect } from 'chai'
import { Contract } from 'ethers'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

const CONTRACT_NAME = 'BuilderStaking'
const INITIAL_THRESHOLD = hre.ethers.parseEther('100')

describe(CONTRACT_NAME, function () {
  async function deployBuilderStakingContract() {
    const [deployer, admin, staker1, staker2, beneficiary1, beneficiary2] =
      await hre.ethers.getSigners()

    // Deploy mock $DIVVI token
    const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
    const mockDivviToken = await MockERC20.deploy('Divvi Token', 'DIVVI')
    await mockDivviToken.waitForDeployment()

    // Deploy BuilderStaking using upgrades
    const BuilderStaking = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const builderStaking = await hre.upgrades.deployProxy(
      BuilderStaking,
      [await mockDivviToken.getAddress(), admin.address, INITIAL_THRESHOLD],
      { kind: 'uups' },
    )
    await builderStaking.waitForDeployment()

    // Mint tokens to stakers
    const stakerCapital = hre.ethers.parseEther('1000')
    await mockDivviToken.mint(staker1.address, stakerCapital)
    await mockDivviToken.mint(staker2.address, stakerCapital)

    return {
      builderStaking,
      mockDivviToken,
      deployer,
      admin,
      staker1,
      staker2,
      beneficiary1,
      beneficiary2,
    }
  }

  let builderStaking: Contract
  let mockDivviToken: Contract
  let admin: HardhatEthersSigner
  let staker1: HardhatEthersSigner
  let staker2: HardhatEthersSigner
  let beneficiary1: HardhatEthersSigner
  let beneficiary2: HardhatEthersSigner

  beforeEach(async function () {
    const deployment = await loadFixture(deployBuilderStakingContract)
    builderStaking = deployment.builderStaking
    mockDivviToken = deployment.mockDivviToken
    admin = deployment.admin
    staker1 = deployment.staker1
    staker2 = deployment.staker2
    beneficiary1 = deployment.beneficiary1
    beneficiary2 = deployment.beneficiary2
  })

  describe('Initialization', function () {
    it('initializes correctly with provided parameters', async function () {
      expect(await builderStaking.divviToken()).to.equal(
        await mockDivviToken.getAddress(),
      )
      expect(await builderStaking.stakingThreshold()).to.equal(
        INITIAL_THRESHOLD,
      )
      expect(
        await builderStaking.hasRole(
          await builderStaking.DEFAULT_ADMIN_ROLE(),
          admin.address,
        ),
      ).to.be.true
    })

    it('reverts when trying to initialize with zero address for token', async function () {
      const [admin] = await hre.ethers.getSigners()

      const BuilderStaking = await hre.ethers.getContractFactory(CONTRACT_NAME)

      await expect(
        hre.upgrades.deployProxy(
          BuilderStaking,
          [hre.ethers.ZeroAddress, admin.address, INITIAL_THRESHOLD],
          { kind: 'uups' },
        ),
      ).to.be.revertedWithCustomError(BuilderStaking, 'ZeroAddressNotAllowed')
    })

    it('reverts when trying to initialize with zero address for admin', async function () {
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockDivviToken = await MockERC20.deploy('Divvi Token', 'DIVVI')
      await mockDivviToken.waitForDeployment()

      const BuilderStaking = await hre.ethers.getContractFactory(CONTRACT_NAME)

      await expect(
        hre.upgrades.deployProxy(
          BuilderStaking,
          [
            await mockDivviToken.getAddress(),
            hre.ethers.ZeroAddress,
            INITIAL_THRESHOLD,
          ],
          { kind: 'uups' },
        ),
      ).to.be.revertedWithCustomError(BuilderStaking, 'ZeroAddressNotAllowed')
    })
  })

  describe('Threshold Management', function () {
    it('allows admin to set threshold', async function () {
      const newThreshold = hre.ethers.parseEther('200')
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(builderStakingWithAdmin.setThreshold(newThreshold))
        .to.emit(builderStaking, 'ThresholdUpdated')
        .withArgs(newThreshold, INITIAL_THRESHOLD)

      expect(await builderStaking.stakingThreshold()).to.equal(newThreshold)
    })

    it('allows admin to set threshold to zero', async function () {
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(builderStakingWithAdmin.setThreshold(0))
        .to.emit(builderStaking, 'ThresholdUpdated')
        .withArgs(0, INITIAL_THRESHOLD)

      expect(await builderStaking.stakingThreshold()).to.equal(0)
    })

    it('reverts when non-admin tries to set threshold', async function () {
      const newThreshold = hre.ethers.parseEther('200')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.setThreshold(newThreshold),
      ).to.be.revertedWithCustomError(
        builderStaking,
        'AccessControlUnauthorizedAccount',
      )
    })
  })

  describe('Staking', function () {
    it('allows staking tokens on behalf of beneficiary', async function () {
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )

      // Stake tokens
      await expect(
        builderStakingWithStaker.stake(stakeAmount, beneficiary1.address),
      )
        .to.emit(builderStaking, 'Staked')
        .withArgs(staker1.address, beneficiary1.address, stakeAmount)

      // Check stake amounts
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker1.address,
        ),
      ).to.equal(stakeAmount)
      expect(
        await builderStaking.beneficiariesForStaker(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(stakeAmount)
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(stakeAmount)
      expect(
        await builderStaking.getStakeAmount(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(stakeAmount)
    })

    it('allows multiple stakes from same staker for same beneficiary', async function () {
      const stakeAmount1 = hre.ethers.parseEther('30')
      const stakeAmount2 = hre.ethers.parseEther('20')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount1 + stakeAmount2,
      )

      // First stake
      await builderStakingWithStaker.stake(stakeAmount1, beneficiary1.address)

      // Second stake
      await builderStakingWithStaker.stake(stakeAmount2, beneficiary1.address)

      // Check total stake amount
      const totalStake = stakeAmount1 + stakeAmount2
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker1.address,
        ),
      ).to.equal(totalStake)
      expect(
        await builderStaking.beneficiariesForStaker(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(totalStake)
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(totalStake)
    })

    it('allows multiple stakers to stake for same beneficiary', async function () {
      const stakeAmount1 = hre.ethers.parseEther('40')
      const stakeAmount2 = hre.ethers.parseEther('60')
      const builderStakingWithStaker1 = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const builderStakingWithStaker2 = builderStaking.connect(
        staker2,
      ) as typeof builderStaking

      // Approve tokens
      const mockDivviTokenWithStaker1 = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      const mockDivviTokenWithStaker2 = mockDivviToken.connect(
        staker2,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker1.approve(
        await builderStaking.getAddress(),
        stakeAmount1,
      )
      await mockDivviTokenWithStaker2.approve(
        await builderStaking.getAddress(),
        stakeAmount2,
      )

      // Stake tokens
      await builderStakingWithStaker1.stake(stakeAmount1, beneficiary1.address)
      await builderStakingWithStaker2.stake(stakeAmount2, beneficiary1.address)

      // Check individual stakes
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker1.address,
        ),
      ).to.equal(stakeAmount1)
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker2.address,
        ),
      ).to.equal(stakeAmount2)

      // Check total stake for beneficiary
      const totalStake = stakeAmount1 + stakeAmount2
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(totalStake)
    })

    it('reverts when staking zero amount', async function () {
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.stake(0, beneficiary1.address),
      ).to.be.revertedWithCustomError(
        builderStaking,
        'AmountMustBeGreaterThanZero',
      )
    })

    it('reverts when staking for zero address beneficiary', async function () {
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.stake(stakeAmount, hre.ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(builderStaking, 'ZeroAddressNotAllowed')
    })

    it('reverts when staker has insufficient allowance', async function () {
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Don't approve tokens
      await expect(
        builderStakingWithStaker.stake(stakeAmount, beneficiary1.address),
      ).to.be.reverted
    })
  })

  describe('Unstaking', function () {
    it('allows unstaking tokens', async function () {
      const stakeAmount = hre.ethers.parseEther('100')
      const unstakeAmount = hre.ethers.parseEther('30')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Get balance before unstaking
      const balanceBefore = await mockDivviToken.balanceOf(staker1.address)

      // Unstake tokens
      await expect(
        builderStakingWithStaker.unstake(unstakeAmount, beneficiary1.address),
      )
        .to.emit(builderStaking, 'Unstaked')
        .withArgs(staker1.address, beneficiary1.address, unstakeAmount)

      // Check balances
      const balanceAfter = await mockDivviToken.balanceOf(staker1.address)
      expect(balanceAfter).to.equal(balanceBefore + unstakeAmount)

      // Check remaining stake
      const remainingStake = stakeAmount - unstakeAmount
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker1.address,
        ),
      ).to.equal(remainingStake)
      expect(
        await builderStaking.beneficiariesForStaker(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(remainingStake)
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(remainingStake)
    })

    it('allows unstaking entire stake', async function () {
      const stakeAmount = hre.ethers.parseEther('100')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Unstake entire amount
      await builderStakingWithStaker.unstake(stakeAmount, beneficiary1.address)

      // Check that stake is zero
      expect(
        await builderStaking.stakersForBeneficiary(
          beneficiary1.address,
          staker1.address,
        ),
      ).to.equal(0)
      expect(
        await builderStaking.beneficiariesForStaker(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(0)
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(0)
    })

    it('reverts when unstaking more than staked amount', async function () {
      const stakeAmount = hre.ethers.parseEther('100')
      const unstakeAmount = hre.ethers.parseEther('150')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Try to unstake more than staked
      await expect(
        builderStakingWithStaker.unstake(unstakeAmount, beneficiary1.address),
      )
        .to.be.revertedWithCustomError(
          builderStaking,
          'InsufficientStakeBalance',
        )
        .withArgs(unstakeAmount, stakeAmount)
    })

    it('reverts when unstaking zero amount', async function () {
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.unstake(0, beneficiary1.address),
      ).to.be.revertedWithCustomError(
        builderStaking,
        'AmountMustBeGreaterThanZero',
      )
    })

    it('reverts when unstaking for zero address beneficiary', async function () {
      const unstakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.unstake(unstakeAmount, hre.ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(builderStaking, 'ZeroAddressNotAllowed')
    })
  })

  describe('Query Functions', function () {
    it('returns correct staked balance for beneficiary', async function () {
      const stakeAmount1 = hre.ethers.parseEther('40')
      const stakeAmount2 = hre.ethers.parseEther('60')
      const builderStakingWithStaker1 = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const builderStakingWithStaker2 = builderStaking.connect(
        staker2,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker1 = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      const mockDivviTokenWithStaker2 = mockDivviToken.connect(
        staker2,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker1.approve(
        await builderStaking.getAddress(),
        stakeAmount1,
      )
      await mockDivviTokenWithStaker2.approve(
        await builderStaking.getAddress(),
        stakeAmount2,
      )

      await builderStakingWithStaker1.stake(stakeAmount1, beneficiary1.address)
      await builderStakingWithStaker2.stake(stakeAmount2, beneficiary1.address)

      // Check total staked balance
      const totalStake = stakeAmount1 + stakeAmount2
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(totalStake)
    })

    it('returns zero for beneficiary with no stakes', async function () {
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(0)
    })

    it('returns correct stake amount for specific staker-beneficiary pair', async function () {
      const stakeAmount = hre.ethers.parseEther('75')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Check specific stake amount
      expect(
        await builderStaking.getStakeAmount(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(stakeAmount)
    })

    it('returns zero for non-existent staker-beneficiary pair', async function () {
      expect(
        await builderStaking.getStakeAmount(
          staker1.address,
          beneficiary1.address,
        ),
      ).to.equal(0)
    })

    it('correctly checks if beneficiary meets threshold', async function () {
      // Initially, beneficiary should not meet threshold (threshold is 100, no stakes)
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .false

      // Stake exactly the threshold amount
      const thresholdAmount = INITIAL_THRESHOLD
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        thresholdAmount,
      )
      await builderStakingWithStaker.stake(
        thresholdAmount,
        beneficiary1.address,
      )

      // Now beneficiary should meet threshold
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .true
    })

    it('correctly checks if beneficiary exceeds threshold', async function () {
      // Stake more than the threshold amount
      const stakeAmount = INITIAL_THRESHOLD + hre.ethers.parseEther('50') // 150 total
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Beneficiary should meet threshold
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .true
    })

    it('correctly handles beneficiary below threshold', async function () {
      // Stake less than the threshold amount
      const stakeAmount = INITIAL_THRESHOLD - hre.ethers.parseEther('10') // 90 total
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Beneficiary should not meet threshold
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .false
    })

    it('correctly handles zero threshold', async function () {
      // Set threshold to zero
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking
      await builderStakingWithAdmin.setThreshold(0)

      // Any beneficiary should meet zero threshold
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .true
    })

    it('correctly handles multiple stakers for same beneficiary', async function () {
      // Stake amounts that individually don't meet threshold but together do
      const stakeAmount1 = hre.ethers.parseEther('40') // 40
      const stakeAmount2 = hre.ethers.parseEther('70') // 70, total = 110 > 100
      const builderStakingWithStaker1 = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const builderStakingWithStaker2 = builderStaking.connect(
        staker2,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker1 = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      const mockDivviTokenWithStaker2 = mockDivviToken.connect(
        staker2,
      ) as typeof mockDivviToken

      await mockDivviTokenWithStaker1.approve(
        await builderStaking.getAddress(),
        stakeAmount1,
      )
      await mockDivviTokenWithStaker2.approve(
        await builderStaking.getAddress(),
        stakeAmount2,
      )

      // First stake - should not meet threshold
      await builderStakingWithStaker1.stake(stakeAmount1, beneficiary1.address)
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .false

      // Second stake - should now meet threshold
      await builderStakingWithStaker2.stake(stakeAmount2, beneficiary1.address)
      expect(await builderStaking.meetsThreshold(beneficiary1.address)).to.be
        .true
    })

    it('returns correct stakers for a beneficiary', async function () {
      const stakeAmount1 = hre.ethers.parseEther('40')
      const stakeAmount2 = hre.ethers.parseEther('60')
      const builderStakingWithStaker1 = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const builderStakingWithStaker2 = builderStaking.connect(
        staker2,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker1 = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      const mockDivviTokenWithStaker2 = mockDivviToken.connect(
        staker2,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker1.approve(
        await builderStaking.getAddress(),
        stakeAmount1,
      )
      await mockDivviTokenWithStaker2.approve(
        await builderStaking.getAddress(),
        stakeAmount2,
      )

      await builderStakingWithStaker1.stake(stakeAmount1, beneficiary1.address)
      await builderStakingWithStaker2.stake(stakeAmount2, beneficiary1.address)

      // Get stakers for beneficiary
      const result = await builderStaking.getStakers(beneficiary1.address)
      const stakers = result[0]
      const amounts = result[1]

      // Check that both stakers are returned
      expect(stakers.length).to.equal(2)
      expect(amounts.length).to.equal(2)

      // Check that both stakers are in the array
      const stakerAddresses = [staker1.address, staker2.address]
      const stakeAmounts = [stakeAmount1, stakeAmount2]

      for (let i = 0; i < stakers.length; i++) {
        expect(stakerAddresses).to.include(stakers[i])
        const stakerIndex = stakerAddresses.indexOf(stakers[i])
        expect(amounts[i]).to.equal(stakeAmounts[stakerIndex])
      }
    })

    it('returns empty arrays for beneficiary with no stakers', async function () {
      const result = await builderStaking.getStakers(beneficiary1.address)
      const stakers = result[0]
      const amounts = result[1]

      expect(stakers.length).to.equal(0)
      expect(amounts.length).to.equal(0)
    })

    it('returns correct stakes for a staker', async function () {
      const stakeAmount1 = hre.ethers.parseEther('50')
      const stakeAmount2 = hre.ethers.parseEther('75')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount1 + stakeAmount2,
      )

      await builderStakingWithStaker.stake(stakeAmount1, beneficiary1.address)
      await builderStakingWithStaker.stake(stakeAmount2, beneficiary2.address)

      // Get stakes for staker
      const result = await builderStaking.getStakes(staker1.address)
      const beneficiaries = result[0]
      const amounts = result[1]

      // Check that both beneficiaries are returned
      expect(beneficiaries.length).to.equal(2)
      expect(amounts.length).to.equal(2)

      // Check that both beneficiaries are in the array
      const beneficiaryAddresses = [beneficiary1.address, beneficiary2.address]
      const stakeAmounts = [stakeAmount1, stakeAmount2]

      for (let i = 0; i < beneficiaries.length; i++) {
        expect(beneficiaryAddresses).to.include(beneficiaries[i])
        const beneficiaryIndex = beneficiaryAddresses.indexOf(beneficiaries[i])
        expect(amounts[i]).to.equal(stakeAmounts[beneficiaryIndex])
      }
    })

    it('returns empty arrays for staker with no stakes', async function () {
      const result = await builderStaking.getStakes(staker1.address)
      const beneficiaries = result[0]
      const amounts = result[1]

      expect(beneficiaries.length).to.equal(0)
      expect(amounts.length).to.equal(0)
    })

    it('handles multiple stakes from same staker for same beneficiary correctly', async function () {
      const stakeAmount1 = hre.ethers.parseEther('30')
      const stakeAmount2 = hre.ethers.parseEther('20')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      // Approve and stake tokens
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount1 + stakeAmount2,
      )

      // First stake
      await builderStakingWithStaker.stake(stakeAmount1, beneficiary1.address)

      // Check arrays after first stake
      let result = await builderStaking.getStakers(beneficiary1.address)
      let stakers = result[0]
      let amounts = result[1]
      expect(stakers.length).to.equal(1)
      expect(amounts[0]).to.equal(stakeAmount1)

      // Second stake
      await builderStakingWithStaker.stake(stakeAmount2, beneficiary1.address)

      // Check arrays after second stake (should still have only one entry)
      result = await builderStaking.getStakers(beneficiary1.address)
      stakers = result[0]
      amounts = result[1]
      expect(stakers.length).to.equal(1)
      expect(amounts[0]).to.equal(stakeAmount1 + stakeAmount2)

      // Check staker's stakes
      result = await builderStaking.getStakes(staker1.address)
      const beneficiaries = result[0]
      const beneficiaryAmounts = result[1]
      expect(beneficiaries.length).to.equal(1)
      expect(beneficiaryAmounts[0]).to.equal(stakeAmount1 + stakeAmount2)
    })
  })

  describe('Access Control', function () {
    it('has correct admin role', async function () {
      expect(
        await builderStaking.hasRole(
          await builderStaking.DEFAULT_ADMIN_ROLE(),
          admin.address,
        ),
      ).to.be.true
    })

    it('allows admin to grant and revoke roles', async function () {
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking
      const customRole = hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes('CUSTOM_ROLE'),
      )

      // Grant role
      await builderStakingWithAdmin.grantRole(customRole, staker1.address)
      expect(await builderStaking.hasRole(customRole, staker1.address)).to.be
        .true

      // Revoke role
      await builderStakingWithAdmin.revokeRole(customRole, staker1.address)
      expect(await builderStaking.hasRole(customRole, staker1.address)).to.be
        .false
    })
  })

  describe('Token Rescue', function () {
    it('allows admin to rescue non-DIVVI tokens', async function () {
      // Deploy additional token to rescue
      const OtherToken = await hre.ethers.getContractFactory('MockERC20')
      const otherToken = await OtherToken.deploy('Other Token', 'OTHER')
      await otherToken.waitForDeployment()
      const rescueAmount = hre.ethers.parseEther('100')
      await otherToken.mint(await builderStaking.getAddress(), rescueAmount)
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Rescue tokens
      await expect(
        builderStakingWithAdmin.rescueToken(
          await otherToken.getAddress(),
          admin.address,
          rescueAmount,
        ),
      )
        .to.emit(builderStaking, 'RescueToken')
        .withArgs(await otherToken.getAddress(), rescueAmount)

      expect(await otherToken.balanceOf(admin.address)).to.equal(rescueAmount)
    })

    it('allows admin to rescue native tokens', async function () {
      // Force send native tokens to contract
      await hre.ethers.provider.send('hardhat_setBalance', [
        await builderStaking.getAddress(),
        '0x8AC7230489E80000', // 10 ETH in hex
      ])
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      const balanceBefore = await hre.ethers.provider.getBalance(admin.address)

      // Rescue tokens
      const tx = await builderStakingWithAdmin.rescueToken(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // NATIVE_TOKEN_ADDRESS
        admin.address,
        hre.ethers.parseEther('10'),
      )
      const receipt = await tx.wait()

      // Calculate gas used
      const gasCost = receipt.gasUsed * receipt.gasPrice
      const balanceAfter = await hre.ethers.provider.getBalance(admin.address)

      // Check balance (accounting for gas cost)
      expect(balanceAfter).to.equal(
        balanceBefore + hre.ethers.parseEther('10') - BigInt(gasCost),
      )
    })

    it('allows admin to rescue excess DIVVI tokens', async function () {
      // First stake some tokens
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Send additional DIVVI tokens to the contract (excess)
      const excessAmount = hre.ethers.parseEther('30')
      await mockDivviToken.mint(await builderStaking.getAddress(), excessAmount)

      // Get staker's balance before rescue
      const balanceBefore = await mockDivviToken.balanceOf(staker1.address)

      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Rescue excess tokens
      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockDivviToken.getAddress(),
          staker1.address,
          excessAmount,
        ),
      ).to.not.be.reverted

      // Check that excess tokens were transferred
      const balanceAfter = await mockDivviToken.balanceOf(staker1.address)
      expect(balanceAfter).to.equal(balanceBefore + excessAmount)
      // Check that staked tokens remain
      expect(
        await builderStaking.getStakedBalance(beneficiary1.address),
      ).to.equal(stakeAmount)
    })

    it('reverts when trying to rescue more DIVVI tokens than excess', async function () {
      // First stake some tokens
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Send some excess tokens
      const excessAmount = hre.ethers.parseEther('30')
      await mockDivviToken.mint(await builderStaking.getAddress(), excessAmount)

      const rescueAmount = hre.ethers.parseEther('100') // More than excess
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockDivviToken.getAddress(),
          staker1.address,
          rescueAmount,
        ),
      )
        .to.be.revertedWithCustomError(
          builderStaking,
          'CannotRescueStakedTokens',
        )
        .withArgs(rescueAmount, stakeAmount)
    })

    it('allows rescuing all excess DIVVI tokens when no tokens are staked', async function () {
      // Send some DIVVI tokens to the contract without staking
      const excessAmount = hre.ethers.parseEther('100')
      await mockDivviToken.mint(await builderStaking.getAddress(), excessAmount)

      // Get staker's balance before rescue
      const balanceBefore = await mockDivviToken.balanceOf(staker1.address)

      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Rescue all excess tokens
      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockDivviToken.getAddress(),
          staker1.address,
          excessAmount,
        ),
      ).to.not.be.reverted

      // Check that all tokens were transferred
      const balanceAfter = await mockDivviToken.balanceOf(staker1.address)
      expect(balanceAfter).to.equal(balanceBefore + excessAmount)
      expect(
        await mockDivviToken.balanceOf(await builderStaking.getAddress()),
      ).to.equal(0)
    })

    it('prevents rescuing when contract balance equals total staked', async function () {
      // Stake tokens (this will increase totalStaked and contract balance)
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Try to rescue any amount (should fail since no excess)
      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockDivviToken.getAddress(),
          staker1.address,
          hre.ethers.parseEther('1'),
        ),
      )
        .to.be.revertedWithCustomError(
          builderStaking,
          'CannotRescueStakedTokens',
        )
        .withArgs(hre.ethers.parseEther('1'), stakeAmount)
    })

    it('allows partial rescue of excess DIVVI tokens', async function () {
      // First stake some tokens
      const stakeAmount = hre.ethers.parseEther('50')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Send excess tokens
      const totalExcess = hre.ethers.parseEther('100')
      await mockDivviToken.mint(await builderStaking.getAddress(), totalExcess)

      const rescueAmount = hre.ethers.parseEther('30') // Partial rescue
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Get balances before rescue
      const staker1BalanceBefore = await mockDivviToken.balanceOf(
        staker1.address,
      )
      const staker2BalanceBefore = await mockDivviToken.balanceOf(
        staker2.address,
      )

      // Rescue partial amount
      await builderStakingWithAdmin.rescueToken(
        await mockDivviToken.getAddress(),
        staker1.address,
        rescueAmount,
      )

      // Check that partial amount was transferred
      const staker1BalanceAfter = await mockDivviToken.balanceOf(
        staker1.address,
      )
      expect(staker1BalanceAfter).to.equal(staker1BalanceBefore + rescueAmount)

      // Check that remaining excess can still be rescued
      const remainingExcess = totalExcess - rescueAmount
      await builderStakingWithAdmin.rescueToken(
        await mockDivviToken.getAddress(),
        staker2.address,
        remainingExcess,
      )
      const staker2BalanceAfter = await mockDivviToken.balanceOf(
        staker2.address,
      )
      expect(staker2BalanceAfter).to.equal(
        staker2BalanceBefore + remainingExcess,
      )
    })

    it('reverts when non-admin tries to rescue tokens', async function () {
      // Deploy a mock token
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockToken = await MockERC20.deploy('Mock Token', 'MOCK')
      await mockToken.waitForDeployment()

      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking

      await expect(
        builderStakingWithStaker.rescueToken(
          await mockToken.getAddress(),
          staker1.address,
          hre.ethers.parseEther('100'),
        ),
      ).to.be.revertedWithCustomError(
        builderStaking,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('reverts when trying to rescue zero amount', async function () {
      // Deploy a mock token
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockToken = await MockERC20.deploy('Mock Token', 'MOCK')
      await mockToken.waitForDeployment()

      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockToken.getAddress(),
          staker1.address,
          0,
        ),
      ).to.be.revertedWithCustomError(builderStaking, 'CannotRescueZeroAmount')
    })

    it('reverts when trying to rescue to zero address', async function () {
      // Deploy a mock token
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockToken = await MockERC20.deploy('Mock Token', 'MOCK')
      await mockToken.waitForDeployment()

      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockToken.getAddress(),
          hre.ethers.ZeroAddress,
          hre.ethers.parseEther('100'),
        ),
      ).to.be.revertedWithCustomError(builderStaking, 'ZeroAddressNotAllowed')
    })

    it('reverts when trying to rescue from zero address token', async function () {
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(
        builderStakingWithAdmin.rescueToken(
          hre.ethers.ZeroAddress,
          staker1.address,
          hre.ethers.parseEther('100'),
        ),
      ).to.be.revertedWithCustomError(builderStaking, 'ZeroAddressNotAllowed')
    })

    it('reverts when trying to rescue more than available balance for non-DIVVI tokens', async function () {
      // Deploy a mock token
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockToken = await MockERC20.deploy('Mock Token', 'MOCK')
      await mockToken.waitForDeployment()

      // Mint some tokens to the contract
      const availableAmount = hre.ethers.parseEther('50')
      await mockToken.mint(await builderStaking.getAddress(), availableAmount)

      const rescueAmount = hre.ethers.parseEther('100') // More than available
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      await expect(
        builderStakingWithAdmin.rescueToken(
          await mockToken.getAddress(),
          staker1.address,
          rescueAmount,
        ),
      )
        .to.be.revertedWithCustomError(
          builderStaking,
          'InsufficientStakeBalance',
        )
        .withArgs(rescueAmount, availableAmount)
    })

    it('allows partial rescue of available tokens', async function () {
      // Deploy a mock token
      const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
      const mockToken = await MockERC20.deploy('Mock Token', 'MOCK')
      await mockToken.waitForDeployment()

      // Mint tokens to the contract
      const totalAmount = hre.ethers.parseEther('100')
      await mockToken.mint(await builderStaking.getAddress(), totalAmount)

      const rescueAmount = hre.ethers.parseEther('30')
      const builderStakingWithAdmin = builderStaking.connect(
        admin,
      ) as typeof builderStaking

      // Rescue partial amount
      await builderStakingWithAdmin.rescueToken(
        await mockToken.getAddress(),
        staker1.address,
        rescueAmount,
      )

      // Check balances
      expect(await mockToken.balanceOf(staker1.address)).to.equal(rescueAmount)
      expect(
        await mockToken.balanceOf(await builderStaking.getAddress()),
      ).to.equal(totalAmount - rescueAmount)
    })

    it('correctly tracks totalStaked when staking and unstaking', async function () {
      // Initial state
      expect(await builderStaking.totalStaked()).to.equal(0)

      // Stake tokens
      const stakeAmount = hre.ethers.parseEther('100')
      const builderStakingWithStaker = builderStaking.connect(
        staker1,
      ) as typeof builderStaking
      const mockDivviTokenWithStaker = mockDivviToken.connect(
        staker1,
      ) as typeof mockDivviToken
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        stakeAmount,
      )
      await builderStakingWithStaker.stake(stakeAmount, beneficiary1.address)

      // Check totalStaked increased
      expect(await builderStaking.totalStaked()).to.equal(stakeAmount)

      // Stake more tokens
      const additionalStake = hre.ethers.parseEther('50')
      await mockDivviTokenWithStaker.approve(
        await builderStaking.getAddress(),
        additionalStake,
      )
      await builderStakingWithStaker.stake(
        additionalStake,
        beneficiary2.address,
      )

      // Check totalStaked increased again
      expect(await builderStaking.totalStaked()).to.equal(
        stakeAmount + additionalStake,
      )

      // Unstake some tokens
      const unstakeAmount = hre.ethers.parseEther('30')
      await builderStakingWithStaker.unstake(
        unstakeAmount,
        beneficiary1.address,
      )

      // Check totalStaked decreased
      expect(await builderStaking.totalStaked()).to.equal(
        stakeAmount + additionalStake - unstakeAmount,
      )
    })
  })
})
