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
    for (const approvalRequired of [true, false]) {
      it(`should register the caller as a new entity with ${approvalRequired ? 'approval' : 'no approval'} requirement`, async function () {
        const { registry, provider } = await deployDivviRegistryContract()

        // Connect as the provider to register themselves
        const registryAsProvider = registry.connect(provider) as typeof registry

        await expect(registryAsProvider.registerRewardsEntity(approvalRequired))
          .to.emit(registry, 'RewardsEntityRegistered')
          .withArgs(provider.address, approvalRequired)

        expect(await registry.isEntityRegistered(provider.address)).to.be.true
        expect(
          await registry.requiresApprovalForAgreements(provider.address),
        ).to.equal(approvalRequired)
      })
    }

    it('should revert when registering an existing entity', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      // Register entity first
      const registryAsProvider = registry.connect(provider) as typeof registry
      await registryAsProvider.registerRewardsEntity(false)

      // Try to register again
      await expect(registryAsProvider.registerRewardsEntity(false))
        .to.be.revertedWithCustomError(registry, 'EntityAlreadyExists')
        .withArgs(provider.address)
    })
  })

  describe('Agreement Management', function () {
    let registry: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['registry']
    let provider: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['provider']
    let consumer: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['consumer']
    let extraUser: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['extraUser']

    beforeEach(async function () {
      const deployed = await deployDivviRegistryContract()
      registry = deployed.registry
      provider = deployed.provider
      consumer = deployed.consumer
      extraUser = deployed.extraUser

      // Register entities
      const registryAsProvider = registry.connect(provider) as typeof registry
      const registryAsConsumer = registry.connect(consumer) as typeof registry

      await registryAsProvider.registerRewardsEntity(false)
      await registryAsConsumer.registerRewardsEntity(false)
    })

    it('should allow the consumer to register an agreement with a provider who does not need approval', async function () {
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

      expect(await registry.hasAgreement(provider.address, consumer.address)).to
        .be.true
    })

    it('should revert when consumer tries to register an agreement with a provider needs approval', async function () {
      // Update provider to require approval
      const registryAsProvider = registry.connect(provider) as typeof registry
      await registryAsProvider.setRequiresApprovalForRewardsAgreements(true)

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
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      await expect(
        registryContractAsConsumer.registerAgreementAsConsumer(
          extraUser.address,
        ),
      )
        .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
        .withArgs(extraUser.address)
    })

    it('should revert when registering duplicate agreement', async function () {
      const registryContractAsConsumer = registry.connect(
        consumer,
      ) as typeof registry

      // Register agreement
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

      expect(await registry.hasAgreement(provider.address, consumer.address)).to
        .be.true
    })
  })

  describe('Agreement Approval Settings', function () {
    it('should update approval requirement', async function () {
      const { registry, provider } = await deployDivviRegistryContract()

      // Register entity
      const registryContractAsProvider = registry.connect(
        provider,
      ) as typeof registry
      await registryContractAsProvider.registerRewardsEntity(false)

      // Update approval requirement
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
