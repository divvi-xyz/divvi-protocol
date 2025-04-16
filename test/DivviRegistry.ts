import { expect } from 'chai'
import hre from 'hardhat'

const CONTRACT_NAME = 'DivviRegistry'

describe(CONTRACT_NAME, function () {
  async function deployDivviRegistryContract() {
    const [owner, provider, consumer, extraUser] = await hre.ethers.getSigners()

    // Deploy the DivviRegistry contract
    const DivviRegistry = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const registry = await hre.upgrades.deployProxy(
      DivviRegistry,
      [owner.address, 0],
      { kind: 'uups' },
    )
    await registry.waitForDeployment()

    return { registry, owner, provider, consumer, extraUser }
  }

  describe('Entity Registration', function () {
    it('should register a new entity', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      await expect(registry.registerRewardsEntity(provider.address, false))
        .to.emit(registry, 'RewardsEntityRegistered')
        .withArgs(provider.address, false)

      expect(await registry.isEntityRegistered(provider.address)).to.be.true
      expect(await registry.requiresApprovalForAgreements(provider.address)).to
        .be.false
    })

    it('should register a new entity with approval required', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      await expect(registry.registerRewardsEntity(provider.address, true))
        .to.emit(registry, 'RewardsEntityRegistered')
        .withArgs(provider.address, true)

      expect(await registry.isEntityRegistered(provider.address)).to.be.true
      expect(await registry.requiresApprovalForAgreements(provider.address)).to
        .be.true
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
      const { registry, provider } = await deployDivviRegistryContract()

      await registry.registerRewardsEntity(provider.address, false)

      await expect(registry.registerRewardsEntity(provider.address, false))
        .to.be.revertedWithCustomError(registry, 'EntityAlreadyExists')
        .withArgs(provider.address)
    })
  })

  describe('Agreement Management', function () {
    it('should allow the consumer to register an agreement with a provider who does not need approval', async function () {
      const { registry, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      // Register agreement
      await expect(
        registryContractAsConsumer.registerAgreementAsConsumer(
          provider.address,
        ),
      )
        .to.emit(registry, 'RewardsAgreementRegistered')
        .withArgs(provider.address, consumer.address)

      expect(await registry.agreementExists(provider.address, consumer.address))
        .to.be.true
    })

    it('should revert when consumer tries to register an agreement with a provider needs approval', async function () {
      const { registry, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, true) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      // Register agreement as consumer reverts
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry
      await expect(
        registryContractAsConsumer.registerAgreementAsConsumer(
          provider.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'ProviderRequiresApproval')
        .withArgs(provider.address)
    })

    it('should revert when registering agreement with unregistered entity', async function () {
      const { registry, provider, consumer } =
        await deployDivviRegistryContract()

      await registry.registerRewardsEntity(provider.address, false) // Provider only
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      await expect(
        registryContractAsConsumer.registerAgreementAsConsumer(
          provider.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
        .withArgs(consumer.address)
    })

    it('should revert when registering duplicate agreement', async function () {
      const { registry, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      // Register agreement
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )

      // Try to register again
      await expect(
        registryContractAsConsumer.registerAgreementAsConsumer(
          provider.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'AgreementAlreadyExists')
        .withArgs(provider.address, consumer.address)
    })

    it('should allow the provider to register an agreement with a consumer', async function () {
      const { registry, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      const registryContractAsProvider = registry.connect(
        provider,
      ) as typeof registry

      // Register agreement
      await expect(
        registryContractAsProvider.registerAgreementAsProvider(
          consumer.address,
        ),
      )
        .to.emit(registry, 'RewardsAgreementRegistered')
        .withArgs(provider.address, consumer.address)

      expect(await registry.agreementExists(provider.address, consumer.address))
        .to.be.true
    })
  })

  describe('Referral Management', function () {
    const mockUserAddress = '0x1234567890123456789012345678901234567890'
    const txHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('test-tx'))
    const chainId = 1

    it('should register a referral', async function () {
      const {
        registry,
        owner,
        provider,
        consumer,
        extraUser: user,
      } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      // Register agreement
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral
      await expect(
        registry.registerReferral(
          user.address,
          provider.address,
          consumer.address,
          txHash,
          chainId,
        ),
      )
        .to.emit(registry, 'ReferralRegistered')
        .withArgs(
          user.address,
          provider.address,
          consumer.address,
          chainId,
          txHash,
        )

      expect(
        await registry.getReferringConsumer(user.address, provider.address),
      ).to.equal(consumer.address)
    })

    for (const entityType of ['provider', 'consumer']) {
      it(`should emit ReferralSkipped when ${entityType} entity does not exist`, async function () {
        const {
          registry,
          owner,
          provider,
          consumer,
          extraUser: user,
        } = await deployDivviRegistryContract()

        // Register only provider entity
        await registry.registerRewardsEntity(
          entityType === 'provider' ? provider.address : consumer.address,
          false,
        )

        // Grant referral registrar role
        await registry.grantRole(
          await registry.REFERRAL_REGISTRAR_ROLE(),
          owner.address,
        )

        // Register referral
        await expect(
          registry.registerReferral(
            user.address,
            provider.address,
            consumer.address,
            txHash,
            chainId,
          ),
        )
          .to.emit(registry, 'ReferralSkipped')
          .withArgs(
            user.address,
            provider.address,
            consumer.address,
            chainId,
            txHash,
            'One or both rewards entities do not exist',
          )

        expect(
          await registry.getReferringConsumer(user.address, provider.address),
        ).to.equal(hre.ethers.ZeroAddress)
      })
    }

    it('should emit ReferralSkipped when agreement does not exist', async function () {
      const {
        registry,
        owner,
        provider,
        consumer,
        extraUser: user,
      } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false)
      await registry.registerRewardsEntity(consumer.address, false)

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral
      await expect(
        registry.registerReferral(
          user.address,
          provider.address,
          consumer.address,
          txHash,
          chainId,
        ),
      )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          user.address,
          provider.address,
          consumer.address,
          chainId,
          txHash,
          'Agreement does not exist between rewards provider and rewards consumer',
        )

      expect(
        await registry.getReferringConsumer(user.address, provider.address),
      ).to.equal(hre.ethers.ZeroAddress)
    })

    it('should revert when registering referral without role', async function () {
      const {
        registry,
        provider,
        consumer,
        extraUser: user,
      } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer.address, false) // Consumer

      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      // Register agreement
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )

      await expect(
        registryContractAsConsumer.registerReferral(
          user.address,
          provider.address,
          consumer.address,
          txHash,
          chainId,
        ),
      ).to.be.revertedWithCustomError(
        registry,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('should emit ReferralSkipped when registering duplicate referral', async function () {
      const {
        registry,
        owner,
        provider,
        consumer: consumer1,
        extraUser: consumer2,
      } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false) // Provider
      await registry.registerRewardsEntity(consumer1.address, false) // Consumer1
      await registry.registerRewardsEntity(consumer2.address, false) // Consumer2

      const registryContractAsConsumer1 = registry.connect(
        consumer1,
      ) as typeof registry
      const registryContractAsConsumer2 = registry.connect(
        consumer2,
      ) as typeof registry

      // Register agreements
      await registryContractAsConsumer1.registerAgreementAsConsumer(
        provider.address,
      )
      await registryContractAsConsumer2.registerAgreementAsConsumer(
        provider.address,
      )

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral of user to provider with consumer1
      await registry.registerReferral(
        mockUserAddress,
        provider.address,
        consumer1.address,
        txHash,
        chainId,
      )

      // Try to register the user to the provider with consumer2
      await expect(
        registry.registerReferral(
          mockUserAddress,
          provider.address,
          consumer2.address,
          txHash,
          chainId,
        ),
      )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          mockUserAddress,
          provider.address,
          consumer2.address,
          chainId,
          txHash,
          'User has already been referred to this rewards provider',
        )

      expect(
        await registry.getReferringConsumer(mockUserAddress, provider.address),
      ).to.equal(consumer1.address)
    })

    it('should emit ReferralSkipped when transaction has already been used', async function () {
      const {
        registry,
        owner,
        provider,
        consumer,
        extraUser: provider1,
      } = await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false)
      await registry.registerRewardsEntity(provider1.address, false)
      await registry.registerRewardsEntity(consumer.address, false)

      // Register agreements
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider1.address,
      )

      // Grant referral registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register referral first time
      await registry.registerReferral(
        mockUserAddress,
        provider.address,
        consumer.address,
        txHash,
        chainId,
      )

      // Try to register with the same transaction hash to a different provider
      await expect(
        registry.registerReferral(
          mockUserAddress,
          provider1.address,
          consumer.address,
          txHash,
          chainId,
        ),
      )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          mockUserAddress,
          provider1.address,
          consumer.address,
          chainId,
          txHash,
          'Transaction has already been used to register a referral',
        )

      expect(
        await registry.getReferringConsumer(mockUserAddress, provider.address),
      ).to.equal(consumer.address)
    })
  })

  describe('Approval Settings', function () {
    it('should update approval requirement', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      // Register entity
      await registry.registerRewardsEntity(provider.address, false)

      // Update approval requirement
      const registryContractAsProvider = registry.connect(
        provider,
      ) as typeof registry
      await expect(
        registryContractAsProvider.setRequiresApprovalForRewardsAgreements(
          true,
        ),
      )
        .to.emit(registry, 'RequiresApprovalForRewardsAgreements')
        .withArgs(provider.address, true)

      expect(await registry.requiresApprovalForAgreements(provider.address)).to
        .be.true
    })

    it('should revert when non-entity tries to update approval requirement', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      const registryContractAsUnkownAddress = registry.connect(
        provider,
      ) as typeof registry
      await expect(
        registryContractAsUnkownAddress.setRequiresApprovalForRewardsAgreements(
          true,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
        .withArgs(provider.address)
    })
  })
})
