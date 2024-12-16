import { expect } from 'chai'
import hre from 'hardhat'

const REGISTRY_CONTRACT_NAME = 'Registry'

describe(REGISTRY_CONTRACT_NAME, function () {
  let Registry
  let registry
  let owner
  let addr1
  let addr2
  let token

  beforeEach(async () => {
    // Get the signers
    ;[owner, addr1, addr2] = await hre.ethers.getSigners()

    // Deploy the Registry contract
    Registry = await hre.ethers.getContractFactory(REGISTRY_CONTRACT_NAME)
    registry = await Registry.deploy(owner.address, 0)

    // Create a mock ERC20 token to use as reward token
    const ERC20 = await hre.ethers.getContractFactory('ERC20')
    token = await ERC20.deploy('Mock Token', 'MTK', 1000000)
  })

  describe('Referrer Registration', function () {
    it('should register a referrer correctly', async function () {
      const referrerId = 'referrer1'
      const protocolIds = ['protocol1']
      const rewardRates = [10]
      const rewardAddress = token.address

      await expect(
        await registry
          .registerReferrer(referrerId, protocolIds, rewardRates, rewardAddress)

          .to.emit(registry, 'ReferrerRegistered')
          .withArgs(referrerId, protocolIds, rewardRates, rewardAddress),
      )

      // Check that the referrer was registered correctly
      const referrer = await registry.getRewardRate('protocol1', referrerId)
      expect(referrer).to.equal(10)

      const referrers = await registry.getReferrers('protocol1')
      expect(referrers).to.deep.equal([referrerId])
    })
    it('should allow only the owner to register a referrer', async function () {
      const referrerId = 'referrer1'
      const protocolIds = ['protocol1']
      const rewardRates = [10]
      const rewardAddress = token.address

      // Non-owner (addr1) should not be able to register the referrer
      await expect(
        await registry
          .connect(addr1)
          .registerReferrer(referrerId, protocolIds, rewardRates, rewardAddress)
          .to.be.rejectedWith('AccessControlUnauthorizedAccount'),
      )
    })
  })

  describe('Referral Registration', function () {
    it('should register a referral when referrer exists', async function () {
      const referrerId = 'referrer1'
      const protocolId = 'protocol1'
      const rewardAddress = token.address
      const rewardRates = [10]

      await registry.registerReferrer(
        referrerId,
        [protocolId],
        rewardRates,
        rewardAddress,
      )

      await expect(
        await registry
          .connect(addr1)
          .registerReferral(referrerId, protocolId)
          .to.emit(registry, 'ReferralRegistered')
          .withArgs(protocolId, referrerId, addr1.address),
      )

      const [userAddresses, timestamps] = await registry.getUsers(
        protocolId,
        referrerId,
      )
      expect(userAddresses).to.include(addr1.address)
      expect(timestamps[0]).to.be.above(0)
    })

    it('should skip referral if the referrer does not exist', async function () {
      const referrerId = 'referrerNotExist'
      const protocolId = 'protocol1'

      await expect(
        await registry
          .connect(addr1)
          .registerReferral(referrerId, protocolId)
          .to.emit(registry, 'ReferralSkipped')
          .withArgs(protocolId, referrerId, addr1.address),
      )
    })

    it('should skip referral if the user is already registered', async function () {
      const referrerId = 'referrer1'
      const protocolId = 'protocol1'
      const rewardAddress = token.address
      const rewardRates = [10]

      await registry.registerReferrer(
        referrerId,
        [protocolId],
        rewardRates,
        rewardAddress,
      )
      await registry.connect(addr1).registerReferral(referrerId, protocolId)

      // Trying to register again should emit "ReferralSkipped"
      await expect(
        await registry
          .connect(addr1)
          .registerReferral(referrerId, protocolId)
          .to.emit(registry, 'ReferralSkipped')
          .withArgs(protocolId, referrerId, addr1.address),
      )
    })
  })

  describe('Getters', function () {
    it('should return referrers for a protocol', async function () {
      const referrerId = 'referrer1'
      const protocolIds = ['protocol1']
      const rewardRates = [10]
      const rewardAddress = token.address

      await registry.registerReferrer(
        referrerId,
        protocolIds,
        rewardRates,
        rewardAddress,
      )

      const referrers = await registry.getReferrers('protocol1')
      expect(referrers).to.deep.equal([referrerId])
    })

    it('should return users and their timestamps', async function () {
      const referrerId = 'referrer1'
      const protocolId = 'protocol1'
      const rewardAddress = token.address
      const rewardRates = [10]

      await registry.registerReferrer(
        referrerId,
        [protocolId],
        rewardRates,
        rewardAddress,
      )

      await registry.connect(addr1).registerReferral(referrerId, protocolId)
      const [userAddresses, timestamps] = await registry.getUsers(
        protocolId,
        referrerId,
      )

      expect(userAddresses).to.include(addr1.address)
      expect(timestamps[0]).to.be.above(0)
    })

    it('should return the correct reward rate', async function () {
      const referrerId = 'referrer1'
      const protocolId = 'protocol1'
      const rewardAddress = token.address
      const rewardRates = [10]

      await registry.registerReferrer(
        referrerId,
        [protocolId],
        rewardRates,
        rewardAddress,
      )

      const rewardRate = await registry.getRewardRate(protocolId, referrerId)
      expect(rewardRate).to.equal(10)
    })
  })
})
