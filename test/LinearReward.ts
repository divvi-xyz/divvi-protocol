import { expect } from 'chai'
import hre from 'hardhat'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Contract } from 'ethers'

interface Kpi {
  kpi: bigint
  referrer: string
}

describe('LinearReward', function () {
  let testContract: Contract
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let user3: HardhatEthersSigner

  before(async function () {
    // Deploy the LinearReward library first
    const LinearReward = await hre.ethers.getContractFactory('LinearReward')
    const linearReward = await LinearReward.deploy()
    await linearReward.waitForDeployment()

    // Deploy the test contract with the library linked
    const TestContract = await hre.ethers.getContractFactory('TestRewardPool')
    testContract = await TestContract.deploy(await linearReward.getAddress())
    await testContract.waitForDeployment()

    // Get signers
    ;[user1, user2, user3] = await hre.ethers.getSigners()
  })

  describe('calculateReward function', function () {
    it('should calculate linear rewards correctly for KPIs', async function () {
      const kpis = [
        {
          kpi: 100n,
          referrer: user1.address,
        },
        {
          kpi: 200n,
          referrer: user2.address,
        },
        {
          kpi: 300n,
          referrer: user3.address,
        },
      ]
      const totalRewardAmount = 600n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(3)
      expect(rewards[0].reward).to.equal(100n) // 600 * 100 / 600
      expect(rewards[0].referrer).to.equal(user1.address)
      expect(rewards[1].reward).to.equal(200n) // 600 * 200 / 600
      expect(rewards[1].referrer).to.equal(user2.address)
      expect(rewards[2].reward).to.equal(300n) // 600 * 300 / 600
      expect(rewards[2].referrer).to.equal(user3.address)
    })

    it('should handle single KPI', async function () {
      const kpis = [
        {
          kpi: 500n,
          referrer: user1.address,
        },
      ]
      const totalRewardAmount = 1000n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(1)
      expect(rewards[0].reward).to.equal(1000n)
      expect(rewards[0].referrer).to.equal(user1.address)
    })

    it('should handle zero total reward amount', async function () {
      const kpis = [
        {
          kpi: 100n,
          referrer: user1.address,
        },
        {
          kpi: 200n,
          referrer: user2.address,
        },
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
        {
          kpi: 0n,
          referrer: user1.address,
        },
        {
          kpi: 100n,
          referrer: user2.address,
        },
      ]
      const totalRewardAmount = 100n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(2)
      expect(rewards[0].reward).to.equal(0n) // 100 * 0 / 100
      expect(rewards[1].reward).to.equal(100n) // 100 * 100 / 100
    })

    it('should handle large numbers', async function () {
      const kpis = [
        {
          kpi: 1000000n,
          referrer: user1.address,
        },
        {
          kpi: 2000000n,
          referrer: user2.address,
        },
      ]
      const totalRewardAmount = 1500000n

      const rewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )

      expect(rewards).to.have.length(2)
      expect(rewards[0].reward).to.equal(500000n) // 1500000 * 1000000 / 3000000
      expect(rewards[1].reward).to.equal(1000000n) // 1500000 * 2000000 / 3000000
    })

    it('should handle empty KPI array', async function () {
      const kpis: Kpi[] = []
      const totalRewardAmount = 100n

      const linearRewards = await testContract.testCalculateReward(
        kpis,
        totalRewardAmount,
      )
      expect(linearRewards).to.have.length(0)
    })
  })
})
