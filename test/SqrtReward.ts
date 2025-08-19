import { expect } from 'chai'
import hre from 'hardhat'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Contract } from 'ethers'

interface Kpi {
  kpi: bigint
  referrerAddress: string
}

describe('SqrtReward', function () {
  let testContract: Contract
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let user3: HardhatEthersSigner

  before(async function () {
    // Deploy the SqrtReward library first
    const SqrtReward = await hre.ethers.getContractFactory('SqrtReward')
    const sqrtReward = await SqrtReward.deploy()
    await sqrtReward.waitForDeployment()

    // Deploy the test contract with the library linked
    const TestContract = await hre.ethers.getContractFactory('TestRewardPool')
    testContract = await TestContract.deploy(await sqrtReward.getAddress())
    await testContract.waitForDeployment()

    // Get signers
    ;[user1, user2, user3] = await hre.ethers.getSigners()
  })

  describe('calculateReward function', function () {
    it('should calculate sqrt rewards correctly for KPIs', async function () {
      const kpis = [
        { kpi: 100n, referrerAddress: user1.address }, // sqrt = 10
        { kpi: 400n, referrerAddress: user2.address }, // sqrt = 20
        { kpi: 900n, referrerAddress: user3.address }, // sqrt = 30
      ]
      const totalRewardAmount = 600n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(3)
      // total sqrt = 10 + 20 + 30 = 60
      expect(rewards[0].reward).to.equal(100n) // 600 * 10 / 60
      expect(rewards[0].referrerAddress).to.equal(user1.address)
      expect(rewards[1].reward).to.equal(200n) // 600 * 20 / 60
      expect(rewards[1].referrerAddress).to.equal(user2.address)
      expect(rewards[2].reward).to.equal(300n) // 600 * 30 / 60
      expect(rewards[2].referrerAddress).to.equal(user3.address)
    })

    it('should handle single KPI', async function () {
      const kpis = [
        { kpi: 400n, referrerAddress: user1.address }, // sqrt = 20
      ]
      const totalRewardAmount = 1000n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(1)
      expect(rewards[0].reward).to.equal(1000n) // 1000 * 20 / 20
      expect(rewards[0].referrerAddress).to.equal(user1.address)
    })

    it('should handle zero total reward amount', async function () {
      const kpis = [
        { kpi: 100n, referrerAddress: user1.address },
        { kpi: 400n, referrerAddress: user2.address },
      ]
      const totalRewardAmount = 0n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(2)
      expect(rewards[0].reward).to.equal(0n)
      expect(rewards[1].reward).to.equal(0n)
    })

    it('should handle zero KPI values', async function () {
      const kpis = [
        { kpi: 0n, referrerAddress: user1.address }, // sqrt = 0
        { kpi: 100n, referrerAddress: user2.address }, // sqrt = 10
      ]
      const totalRewardAmount = 100n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(2)
      expect(rewards[0].reward).to.equal(0n) // 100 * 0 / 10
      expect(rewards[1].reward).to.equal(100n) // 100 * 10 / 10
    })

    it('should handle non-perfect squares', async function () {
      const kpis = [
        { kpi: 2n, referrerAddress: user1.address }, // sqrt ≈ 1
        { kpi: 5n, referrerAddress: user2.address }, // sqrt ≈ 2
        { kpi: 10n, referrerAddress: user3.address }, // sqrt ≈ 3
      ]
      const totalRewardAmount = 60n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(3)
      // total sqrt = 1 + 2 + 3 = 6
      expect(rewards[0].reward).to.equal(10n) // 60 * 1 / 6
      expect(rewards[1].reward).to.equal(20n) // 60 * 2 / 6
      expect(rewards[2].reward).to.equal(30n) // 60 * 3 / 6
    })

    it('should handle empty KPI array', async function () {
      const kpis: Kpi[] = []
      const totalRewardAmount = 100n

      const sqrtRewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )
      expect(sqrtRewards).to.have.length(0)
    })
  })
})
