import { expect } from 'chai'
import hre from 'hardhat'

const CONTRACT_NAME = 'DivviRegistry'

describe(CONTRACT_NAME, function () {
  async function deployDivviRegistryContract() {
    const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners()

    // Deploy the DivviRegistry contract
    const DivviRegistry = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const registry = await hre.upgrades.deployProxy(
      DivviRegistry,
      [owner.address, 0],
      { kind: 'uups' },
    )
    await registry.waitForDeployment()

    return { registry, owner, addr1, addr2, addr3 }
  }

  describe('Entity Registration', function () {
    it('should register a new entity', async function () {
      const { registry, addr1 } = await deployDivviRegistryContract()

      await expect(registry.registerRewardsEntity(addr1.address, false))
        .to.emit(registry, 'RewardsEntityRegistered')
        .withArgs(addr1.address, false)

      expect(await registry.isEntityRegistered(addr1.address)).to.be.true
      expect(await registry.requiresApprovalForAgreements(addr1.address)).to.be
        .false
    })

    it('should register a new entity with approval required', async function () {
      const { registry, addr1 } = await deployDivviRegistryContract()

      await expect(registry.registerRewardsEntity(addr1.address, true))
        .to.emit(registry, 'RewardsEntityRegistered')
        .withArgs(addr1.address, true)

      expect(await registry.isEntityRegistered(addr1.address)).to.be.true
      expect(await registry.requiresApprovalForAgreements(addr1.address)).to.be
        .true
    })

    it('should revert when registering zero address', async function () {
      const { registry } = await deployDivviRegistryContract()

      await expect(
        registry.registerRewardsEntity(hre.ethers.ZeroAddress, false),
      )
        .to.be.revertedWithCustomError(registry, 'InvalidEntityAddress')
        .withArgs(hre.ethers.ZeroAddress)
    })

    it('should revert when registering an existing entity', async function () {
      const { registry, addr1 } = await deployDivviRegistryContract()

      await registry.registerRewardsEntity(addr1.address, false)

      await expect(registry.registerRewardsEntity(addr1.address, false))
        .to.be.revertedWithCustomError(registry, 'EntityAlreadyExists')
        .withArgs(addr1.address)
    })
  })

  describe('Agreement Management', function () {
    it('should register an agreement when approval not required', async function () {
      const { registry, addr1, addr2 } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, false) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry

      // Register agreement
      await expect(
        registryContractAsConsumer.registerRewardsAgreement(addr1.address),
      )
        .to.emit(registry, 'RewardsAgreementRegistered')
        .withArgs(addr1.address, addr2.address)

      expect(await registry.agreementExists(addr2.address, addr1.address)).to.be
        .true
    })

    it('should register and approve an agreement when approval required', async function () {
      const { registry, addr1, addr2 } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, true) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer

      // Register agreement as consumer reverts
      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry
      await expect(
        registryContractAsConsumer.registerRewardsAgreement(addr1.address),
      )
        .to.be.revertedWithCustomError(registry, 'ProviderRequiresApproval')
        .withArgs(addr1.address)

      // Approving agreement succeeds
      const registryContractAsProvider = registry.connect(
        addr1,
      ) as typeof registry
      await expect(
        registryContractAsProvider.approveRewardsAgreement(addr2.address),
      )
        .to.emit(registry, 'RewardsAgreementApproved')
        .withArgs(addr1.address, addr2.address)

      expect(await registry.agreementExists(addr2.address, addr1.address)).to.be
        .true
    })

    it('should revert when registering agreement with unregistered entity', async function () {
      const { registry, addr1, addr2 } = await deployDivviRegistryContract()

      await registry.registerRewardsEntity(addr1.address, false) // Provider only
      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry

      await expect(
        registryContractAsConsumer.registerRewardsAgreement(addr1.address),
      )
        .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
        .withArgs(addr2.address)
    })

    it('should revert when registering duplicate agreement', async function () {
      const { registry, addr1, addr2 } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, false) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer

      // Register agreement
      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry
      await registryContractAsConsumer.registerRewardsAgreement(addr1.address)

      // Try to register again
      await expect(
        registryContractAsConsumer.registerRewardsAgreement(addr1.address),
      )
        .to.be.revertedWithCustomError(registry, 'AgreementAlreadyExists')
        .withArgs(addr1.address, addr2.address)
    })
  })

  describe('Referral Management', function () {
    it('should register a referral', async function () {
      const { registry, owner, addr1, addr2, addr3 } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, false) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry

      // Register agreement
      await registryContractAsConsumer.registerRewardsAgreement(addr1.address)

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral
      await expect(
        registry.registerReferral(addr3.address, addr2.address, addr1.address),
      )
        .to.emit(registry, 'ReferralRegistered')
        .withArgs(addr3.address, addr2.address, addr1.address)

      expect(
        await registry.getReferringConsumer(addr3.address, addr1.address),
      ).to.equal(addr2.address)
    })

    it('should revert when registering referral without role', async function () {
      const { registry, addr1, addr2, addr3 } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, false) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        addr2,
      ) as typeof registry

      // Register agreement
      await registryContractAsConsumer.registerRewardsAgreement(addr1.address)

      await expect(
        registryContractAsConsumer.registerReferral(
          addr3.address,
          addr2.address,
          addr1.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'MissingReferralRegistrarRole')
        .withArgs(addr2.address)
    })

    it('should revert when registering duplicate referral', async function () {
      const mockUserAddress = '0x1234567890123456789012345678901234567890'
      const { registry, owner, addr1, addr2, addr3 } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(addr1.address, false) // Provider
      await registry.registerRewardsEntity(addr2.address, false) // Consumer1
      await registry.registerRewardsEntity(addr3.address, false) // Consumer2

      const registryContractAsConsumer1 = registry.connect(
        addr2,
      ) as typeof registry
      const registryContractAsConsumer2 = registry.connect(
        addr3,
      ) as typeof registry

      // Register agreements
      await registryContractAsConsumer1.registerRewardsAgreement(addr1.address)
      await registryContractAsConsumer2.registerRewardsAgreement(addr1.address)

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral of user to provider with consumer1
      await registry.registerReferral(
        mockUserAddress,
        addr2.address,
        addr1.address,
      )

      // Try to register the user to the provider with consumer2
      await expect(
        registry.registerReferral(
          mockUserAddress,
          addr3.address,
          addr1.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'UserAlreadyReferred')
        .withArgs(mockUserAddress, addr1.address)
    })
  })

  describe('Approval Settings', function () {
    it('should update approval requirement', async function () {
      const { registry, addr1 } = await deployDivviRegistryContract()

      // Register entity
      await registry.registerRewardsEntity(addr1.address, false)

      // Update approval requirement
      const registryContractAsProvider = registry.connect(
        addr1,
      ) as typeof registry
      await expect(
        registryContractAsProvider.setRequiresApprovalForRewardsAgreements(
          true,
        ),
      )
        .to.emit(registry, 'RequiresApprovalForRewardsAgreements')
        .withArgs(addr1.address, true)

      expect(await registry.requiresApprovalForAgreements(addr1.address)).to.be
        .true
    })

    it('should revert when non-entity tries to update approval requirement', async function () {
      const { registry, addr1 } = await deployDivviRegistryContract()

      const registryContractAsUnkownAddress = registry.connect(
        addr1,
      ) as typeof registry
      await expect(
        registryContractAsUnkownAddress.setRequiresApprovalForRewardsAgreements(
          true,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
        .withArgs(addr1.address)
    })
  })
})
