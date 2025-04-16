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

  describe('Agreement Approval Settings', function () {
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

  describe('Batch Referral Registration', function () {
    const mockUserAddress = '0x1234567890123456789012345678901234567890'
    const mockUserAddress2 = '0x1234567890123456789012345678901234567891'
    const chainId = 1
    const txHash1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('test-tx-1'))
    const txHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('test-tx-2'))

    it('should register multiple referrals in a single transaction', async function () {
      const { registry, owner, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false)
      await registry.registerRewardsEntity(consumer.address, false)

      // Register agreement
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )

      // Grant registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register multiple referrals
      await expect(
        registry.batchRegisterReferral([
          {
            user: mockUserAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash1,
            chainId,
          },
          {
            user: mockUserAddress2,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash2,
            chainId,
          },
        ]),
      )
        .to.emit(registry, 'ReferralRegistered')
        .withArgs(
          mockUserAddress,
          provider.address,
          consumer.address,
          chainId,
          txHash1,
        )
        .to.emit(registry, 'ReferralRegistered')
        .withArgs(
          mockUserAddress2,
          provider.address,
          consumer.address,
          chainId,
          txHash2,
        )

      expect(
        await registry.isUserReferredToProvider(
          mockUserAddress,
          provider.address,
        ),
      ).to.be.true
      expect(
        await registry.isUserReferredToProvider(
          mockUserAddress2,
          provider.address,
        ),
      ).to.be.true
    })

    it('should handle mixed success and failure in batch registration', async function () {
      const { registry, owner, provider, consumer } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false)
      await registry.registerRewardsEntity(consumer.address, false)

      // Register agreement
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry
      await registryContractAsConsumer.registerAgreementAsConsumer(
        provider.address,
      )

      // Grant registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Register first referral
      await registry.batchRegisterReferral([
        {
          user: mockUserAddress,
          rewardsProvider: provider.address,
          rewardsConsumer: consumer.address,
          txHash: txHash1,
          chainId,
        },
      ])

      // Try to register both a new referral and a duplicate
      await expect(
        registry.batchRegisterReferral([
          {
            user: mockUserAddress2,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash2,
            chainId,
          },
          {
            user: mockUserAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash1,
            chainId,
          },
        ]),
      )
        .to.emit(registry, 'ReferralRegistered')
        .withArgs(
          mockUserAddress2,
          provider.address,
          consumer.address,
          chainId,
          txHash2,
        )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          mockUserAddress,
          provider.address,
          consumer.address,
          chainId,
          txHash1,
          'User has already been referred to this rewards provider',
        )

      expect(
        await registry.isUserReferredToProvider(
          mockUserAddress,
          provider.address,
        ),
      ).to.be.true
      expect(
        await registry.isUserReferredToProvider(
          mockUserAddress2,
          provider.address,
        ),
      ).to.be.true
    })

    it('should emit ReferralSkipped when either provider or consumer entity does not exist', async function () {
      const { registry, owner, provider, consumer, extraUser } =
        await deployDivviRegistryContract()

      // Register only the provider
      await registry.registerRewardsEntity(provider.address, false)

      // Grant registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Try to register referral with non-existent consumer
      await expect(
        registry.batchRegisterReferral([
          {
            user: extraUser.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash1,
            chainId,
          },
        ]),
      )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          extraUser.address,
          provider.address,
          consumer.address,
          chainId,
          txHash1,
          'One or both rewards entities do not exist',
        )

      expect(
        await registry.isUserReferredToProvider(
          extraUser.address,
          provider.address,
        ),
      ).to.be.false
    })

    it('should emit ReferralSkipped when agreement does not exist', async function () {
      const { registry, owner, provider, consumer, extraUser } =
        await deployDivviRegistryContract()

      // Register entities
      await registry.registerRewardsEntity(provider.address, false)
      await registry.registerRewardsEntity(consumer.address, false)

      // Grant registrar role
      await registry.grantRole(
        await registry.REFERRAL_REGISTRAR_ROLE(),
        owner.address,
      )

      // Try to register referral without agreement
      await expect(
        registry.batchRegisterReferral([
          {
            user: extraUser.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash1,
            chainId,
          },
        ]),
      )
        .to.emit(registry, 'ReferralSkipped')
        .withArgs(
          extraUser.address,
          provider.address,
          consumer.address,
          chainId,
          txHash1,
          'Agreement does not exist between rewards provider and rewards consumer',
        )

      expect(
        await registry.isUserReferredToProvider(
          extraUser.address,
          provider.address,
        ),
      ).to.be.false
    })

    it('should revert when caller does not have REFERRAL_REGISTRAR_ROLE', async function () {
      const { registry, provider, consumer, extraUser } =
        await deployDivviRegistryContract()

      // Try to register referral without role
      await expect(
        registry.batchRegisterReferral([
          {
            user: extraUser.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            txHash: txHash1,
            chainId,
          },
        ]),
      ).to.be.revertedWithCustomError(
        registry,
        'AccessControlUnauthorizedAccount',
      )

      expect(
        await registry.isUserReferredToProvider(
          extraUser.address,
          provider.address,
        ),
      ).to.be.false
    })
  })
})
