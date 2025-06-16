import { expect } from 'chai'
import hre from 'hardhat'
import {
  setBalance,
  impersonateAccount,
} from '@nomicfoundation/hardhat-network-helpers'
import { type HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'ethers'

const CONTRACT_NAME = 'DivviRegistry'

// Trusted forwarder for meta-transactions
const TRUSTED_FORWARDER = '0x0000000000000000000000072057edf0200a2de2'

// Function signatures for overloaded function
const BATCH_REGISTER_REFERRAL_V1 =
  'batchRegisterReferral((address,address,address,bytes32,string)[])'
const BATCH_REGISTER_REFERRAL_V2 =
  'batchRegisterReferral((address,address,address,(bytes32,string),(uint8,bytes,bytes))[])'

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

    await impersonateAccount(TRUSTED_FORWARDER)
    await setBalance(TRUSTED_FORWARDER, hre.ethers.parseEther('1.0'))
    // Grant TRUSTED_FORWARDER_ROLE to TRUSTED_FORWARDER
    const TRUSTED_FORWARDER_ROLE = await registry.TRUSTED_FORWARDER_ROLE()
    await (registry.connect(owner) as typeof registry).grantRole(
      TRUSTED_FORWARDER_ROLE,
      TRUSTED_FORWARDER,
    )

    return { registry, owner, provider, consumer, extraUser }
  }

  // This helper function is used to execute a function as a specific signer
  // It can be used to execute a function directly or via a meta-transaction
  async function executeAs(
    registry: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['registry'],
    signer: HardhatEthersSigner,
    functionName: string,
    // TODO: would be nice to fully type args
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[],
    useMetaTx: boolean = false,
  ) {
    const targetAddress = await registry.getAddress()
    const encodedData = registry.interface.encodeFunctionData(
      functionName,
      args,
    )

    if (!useMetaTx) {
      // Direct Call: msg.sender is the signer
      const contractAsSigner = registry.connect(signer) as typeof registry
      // Dynamically call the function
      return contractAsSigner[functionName](...args)
    } else {
      // Meta-Transaction (simulated via impersonated trusted forwarder):
      // msg.sender is TRUSTED_FORWARDER
      // _msgSender() should extract signer.address from calldata suffix
      const forwarderSigner = await hre.ethers.getSigner(TRUSTED_FORWARDER)

      const dataWithAppendedSigner = hre.ethers.concat([
        encodedData,
        signer.address, // Append original signer address
      ])

      return forwarderSigner.sendTransaction({
        to: targetAddress,
        data: dataWithAppendedSigner,
      })
    }
  }

  describe('Entity Registration', function () {
    for (const useMetaTx of [false, true]) {
      describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
        for (const approvalRequired of [true, false]) {
          it(`should register the caller as a new entity with ${approvalRequired ? 'approval' : 'no approval'} requirement`, async function () {
            const { registry, provider } = await deployDivviRegistryContract()

            // Register the entity
            await expect(
              executeAs(
                registry,
                provider,
                'registerRewardsEntity',
                [approvalRequired],
                useMetaTx,
              ),
            )
              .to.emit(registry, 'RewardsEntityRegistered')
              .withArgs(provider.address, approvalRequired)

            expect(await registry.isEntityRegistered(provider.address)).to.be
              .true
            expect(
              await registry.requiresApprovalForAgreements(provider.address),
            ).to.equal(approvalRequired)
          })
        }

        it('should revert when registering an existing entity', async function () {
          const { registry, provider } = await deployDivviRegistryContract()

          // Register entity first
          await executeAs(
            registry,
            provider,
            'registerRewardsEntity',
            [false],
            useMetaTx,
          )

          // Try to register again
          await expect(
            executeAs(
              registry,
              provider,
              'registerRewardsEntity',
              [false],
              useMetaTx,
            ),
          )
            .to.be.revertedWithCustomError(registry, 'EntityAlreadyExists')
            .withArgs(provider.address)
        })
      })
    }
  })

  describe('Agreement Management', function () {
    for (const useMetaTx of [false, true]) {
      describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
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
          await executeAs(
            registry,
            provider,
            'registerRewardsEntity',
            [false],
            useMetaTx,
          )
          await executeAs(
            registry,
            consumer,
            'registerRewardsEntity',
            [false],
            useMetaTx,
          )
        })

        it('should allow the consumer to register an agreement with a provider who does not need approval', async function () {
          // Register agreement
          await expect(
            executeAs(
              registry,
              consumer,
              'registerAgreementAsConsumer',
              [provider.address],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'RewardsAgreementRegistered')
            .withArgs(provider.address, consumer.address)

          expect(
            await registry.hasAgreement(provider.address, consumer.address),
          ).to.be.true
        })

        it('should revert when consumer tries to register an agreement with a provider needs approval', async function () {
          // Update provider to require approval
          await executeAs(
            registry,
            provider,
            'setRequiresApprovalForRewardsAgreements',
            [true],
            useMetaTx,
          )

          // Attempt to register agreement (should revert)
          await expect(
            executeAs(
              registry,
              consumer,
              'registerAgreementAsConsumer',
              [provider.address],
              useMetaTx,
            ),
          )
            .to.be.revertedWithCustomError(registry, 'ProviderRequiresApproval')
            .withArgs(provider.address)
        })

        it('should revert when registering agreement with unregistered entity', async function () {
          // Attempt to register agreement with unregistered entity
          await expect(
            executeAs(
              registry,
              consumer,
              'registerAgreementAsConsumer',
              [extraUser.address],
              useMetaTx,
            ),
          )
            .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
            .withArgs(extraUser.address)
        })

        it('should revert when registering duplicate agreement', async function () {
          // Register agreement first
          await executeAs(
            registry,
            consumer,
            'registerAgreementAsConsumer',
            [provider.address],
            useMetaTx,
          )

          // Try to register again
          await expect(
            executeAs(
              registry,
              consumer,
              'registerAgreementAsConsumer',
              [provider.address],
              useMetaTx,
            ),
          )
            .to.be.revertedWithCustomError(registry, 'AgreementAlreadyExists')
            .withArgs(provider.address, consumer.address)
        })

        it('should allow the provider to register an agreement with a consumer', async function () {
          // Register agreement
          await expect(
            executeAs(
              registry,
              provider,
              'registerAgreementAsProvider',
              [consumer.address],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'RewardsAgreementRegistered')
            .withArgs(provider.address, consumer.address)

          expect(
            await registry.hasAgreement(provider.address, consumer.address),
          ).to.be.true
        })
      })
    }
  })

  describe('Agreement Approval Settings', function () {
    for (const useMetaTx of [false, true]) {
      describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
        it('should update approval requirement', async function () {
          const { registry, provider } = await deployDivviRegistryContract()

          // Register entity first
          await executeAs(
            registry,
            provider,
            'registerRewardsEntity',
            [false],
            useMetaTx, // Apply useMetaTx here as well for consistency in setup
          )

          // Update approval requirement
          await expect(
            executeAs(
              registry,
              provider,
              'setRequiresApprovalForRewardsAgreements',
              [true],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'RequiresApprovalForRewardsAgreements')
            .withArgs(provider.address, true)

          expect(await registry.requiresApprovalForAgreements(provider.address))
            .to.be.true
        })

        it('should revert when non-entity tries to update approval requirement', async function () {
          const { registry, provider } = await deployDivviRegistryContract()
          // Note: The test aims to call setRequiresApprovalForRewardsAgreements
          // *before* the provider is registered as an entity.

          // Attempt to update approval requirement when provider is not registered
          await expect(
            executeAs(
              registry,
              provider, // Still acting as provider
              'setRequiresApprovalForRewardsAgreements',
              [true],
              useMetaTx,
            ),
          )
            .to.be.revertedWithCustomError(registry, 'EntityDoesNotExist')
            .withArgs(provider.address) // The error checks _msgSender() which executeAs provides
        })
      })
    }
  })

  describe('Batch Referral Registration', function () {
    const mockUserAddress = '0x1234567890123456789012345678901234567890'
    const mockUserAddress2 = '0x1234567890123456789012345678901234567891'
    const chainId = 'eip155:1'
    const txHash1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('test-tx-1'))
    const txHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('test-tx-2'))

    for (const useMetaTx of [false, true]) {
      describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
        let registry: Awaited<
          ReturnType<typeof deployDivviRegistryContract>
        >['registry']
        let owner: Awaited<
          ReturnType<typeof deployDivviRegistryContract>
        >['owner']
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
          owner = deployed.owner
          registry = deployed.registry
          provider = deployed.provider
          consumer = deployed.consumer
          extraUser = deployed.extraUser

          // Register entities and agreement using executeAs for consistency within the meta-tx context
          await executeAs(
            registry,
            provider,
            'registerRewardsEntity',
            [false],
            useMetaTx, // Use meta-tx setting for setup consistency
          )
          await executeAs(
            registry,
            consumer,
            'registerRewardsEntity',
            [false],
            useMetaTx, // Use meta-tx setting for setup consistency
          )
          await executeAs(
            registry,
            provider,
            'registerAgreementAsProvider',
            [consumer.address],
            useMetaTx, // Use meta-tx setting for setup consistency
          )
        })

        it('should register multiple referrals in a single transaction', async function () {
          const registrarRole = await registry.REFERRAL_REGISTRAR_ROLE()
          // Grant registrar role
          await executeAs(
            registry,
            owner,
            'grantRole',
            [registrarRole, owner.address],
            useMetaTx,
          )

          const referrals = [
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
          ]

          // Register multiple referrals
          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V1,
              [referrals],
              useMetaTx,
            ),
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
          const registrarRole = await registry.REFERRAL_REGISTRAR_ROLE()
          // Grant registrar role
          await executeAs(
            registry,
            owner,
            'grantRole',
            [registrarRole, owner.address],
            useMetaTx,
          )

          const initialReferral = [
            {
              user: mockUserAddress,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: txHash1,
              chainId,
            },
          ]

          // Register first referral
          await executeAs(
            registry,
            owner,
            BATCH_REGISTER_REFERRAL_V1,
            [initialReferral],
            useMetaTx,
          )

          const mixedReferrals = [
            {
              user: mockUserAddress2,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: txHash2,
              chainId,
            },
            {
              user: mockUserAddress, // Duplicate
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: txHash1,
              chainId,
            },
          ]

          // Try to register both a new referral and a duplicate
          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V1,
              [mixedReferrals],
              useMetaTx,
            ),
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
              3n, // USER_ALREADY_REFERRED
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
          const registrarRole = await registry.REFERRAL_REGISTRAR_ROLE()
          // Grant registrar role
          await executeAs(
            registry,
            owner,
            'grantRole',
            [registrarRole, owner.address],
            useMetaTx,
          )

          const invalidConsumerReferral = [
            {
              user: mockUserAddress,
              rewardsProvider: provider.address,
              rewardsConsumer: mockUserAddress2, // Non-existent consumer
              txHash: txHash1,
              chainId,
            },
          ]

          // Try to register referral with non-existent consumer
          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V1,
              [invalidConsumerReferral],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              mockUserAddress,
              provider.address,
              mockUserAddress2,
              chainId,
              txHash1,
              1n, // ENTITY_NOT_FOUND
            )

          expect(
            await registry.isUserReferredToProvider(
              mockUserAddress,
              provider.address,
            ),
          ).to.be.false
        })

        it('should emit ReferralSkipped when agreement does not exist', async function () {
          // Register extraUser as an entity
          await executeAs(
            registry,
            extraUser,
            'registerRewardsEntity',
            [false],
            useMetaTx,
          )

          const registrarRole = await registry.REFERRAL_REGISTRAR_ROLE()
          // Grant registrar role
          await executeAs(
            registry,
            owner,
            'grantRole',
            [registrarRole, owner.address],
            useMetaTx,
          )

          const noAgreementReferral = [
            {
              user: mockUserAddress,
              rewardsProvider: provider.address,
              rewardsConsumer: extraUser.address, // No agreement between provider and extraUser
              txHash: txHash1,
              chainId,
            },
          ]

          // Try to register referral without agreement
          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V1,
              [noAgreementReferral],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              mockUserAddress,
              provider.address,
              extraUser.address,
              chainId,
              txHash1,
              2n, // AGREEMENT_NOT_FOUND
            )

          expect(
            await registry.isUserReferredToProvider(
              mockUserAddress,
              provider.address,
            ),
          ).to.be.false
        })

        it('should revert when caller does not have REFERRAL_REGISTRAR_ROLE', async function () {
          const referrals = [
            {
              user: mockUserAddress,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: txHash1,
              chainId,
            },
          ]

          // Try to register referral without role (caller is owner)
          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V1,
              [referrals],
              useMetaTx,
            ),
          ).to.be.revertedWithCustomError(
            registry,
            'AccessControlUnauthorizedAccount',
          )
          // Note: The error check inside AccessControl uses _msgSender().
          // executeAs ensures _msgSender() returns the owner's address when useMetaTx is true.

          expect(
            await registry.isUserReferredToProvider(
              mockUserAddress,
              provider.address,
            ),
          ).to.be.false
        })
      })
    }
  })

  describe('Batch Referral Registration (V2 Structs)', function () {
    let provider: HardhatEthersSigner
    let consumer: HardhatEthersSigner
    let user: HardhatEthersSigner
    let registry: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['registry']
    let owner: Awaited<ReturnType<typeof deployDivviRegistryContract>>['owner']

    const user2 = ethers.Wallet.createRandom()

    beforeEach(async function () {
      const deployed = await deployDivviRegistryContract()
      registry = deployed.registry
      owner = deployed.owner
      provider = deployed.provider
      consumer = deployed.consumer
      user = deployed.extraUser

      // Setup entities and agreement
      await (
        registry.connect(provider) as typeof registry
      ).registerRewardsEntity(false)
      await (
        registry.connect(consumer) as typeof registry
      ).registerRewardsEntity(false)
      await (
        registry.connect(provider) as typeof registry
      ).registerAgreementAsProvider(consumer.address)

      // Grant registrar role to owner
      const registrarRole = await registry.REFERRAL_REGISTRAR_ROLE()
      await (registry.connect(owner) as typeof registry).grantRole(
        registrarRole,
        owner.address,
      )
    })

    for (const useMetaTx of [false, true]) {
      describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
        it('should register a mixed batch of on-chain, EOA, and EIP-1271 referrals', async function () {
          // 1. EOA-signed referral
          const eoaMessage = `referral for ${user.address}`
          const eoaSignature = await user.signMessage(eoaMessage)
          const eoaReferral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(eoaMessage),
              signature: eoaSignature,
            },
          }

          // 2. EIP-1271-signed referral
          const MockEIP1271 = await hre.ethers.getContractFactory('MockEIP1271')
          const mockContract = await MockEIP1271.deploy(true) // alwaysValid
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()
          const scwMessage = `referral for ${smartContractAddress}`
          const scwSignature = '0x' + '00'.repeat(65) // Dummy signature
          const scwReferral = {
            user: smartContractAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(scwMessage),
              signature: scwSignature,
            },
          }

          // 3. On-chain (tx-based) referral
          const txHash =
            '0x1234567890123456789012345678901234567890123456789012345678901234'
          const onChainReferral = {
            user: user2.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: txHash, chainId: 'eip155:1' },
            offchainMessage: {
              messageType: 0, // NONE
              message: '0x',
              signature: '0x',
            },
          }

          const referrals = [eoaReferral, scwReferral, onChainReferral]

          // Execute and check events
          const tx = executeAs(
            registry,
            owner,
            BATCH_REGISTER_REFERRAL_V2,
            [referrals],
            useMetaTx,
          )

          await expect(tx)
            .to.emit(registry, 'ReferralRegistered')
            .withArgs(
              user.address,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
            )
          await expect(tx)
            .to.emit(registry, 'ReferralRegistered')
            .withArgs(
              smartContractAddress,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
            )
          await expect(tx)
            .to.emit(registry, 'ReferralRegistered')
            .withArgs(
              user2.address,
              provider.address,
              consumer.address,
              'eip155:1',
              txHash,
            )

          // Check final state
          expect(
            await registry.isUserReferredToProvider(
              user.address,
              provider.address,
            ),
          ).to.be.true
          expect(
            await registry.isUserReferredToProvider(
              smartContractAddress,
              provider.address,
            ),
          ).to.be.true
          expect(
            await registry.isUserReferredToProvider(
              user2.address,
              provider.address,
            ),
          ).to.be.true
        })

        it('should handle a mixed batch of success, duplicate, and invalid signatures', async function () {
          // 1. Pre-register `user` to test duplication
          const initialMessage = `initial referral for ${user.address}`
          const initialSignature = await user.signMessage(initialMessage)
          const initialReferral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(initialMessage),
              signature: initialSignature,
            },
          }
          await executeAs(
            registry,
            owner,
            BATCH_REGISTER_REFERRAL_V2,
            [[initialReferral]],
            useMetaTx,
          )

          // 2. Prepare the mixed batch
          // a. Successful new referral
          const successMessage = `new referral for ${user2.address}`
          const successSignature = await user2.signMessage(successMessage)
          const successReferral = {
            user: user2.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(successMessage),
              signature: successSignature,
            },
          }

          // b. Duplicate referral (using initial data)
          const duplicateReferral = initialReferral

          // c. Invalid EOA signature
          const invalidEoaMessage = 'a message with a bad signature'
          const invalidEoaReferral = {
            user: user.address, // Arbitrary user
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(invalidEoaMessage),
              signature: '0x' + '11'.repeat(65), // Bad signature
            },
          }

          // d. Invalid EIP-1271 signature
          const MockEIP1271 = await hre.ethers.getContractFactory('MockEIP1271')
          const mockContract = await MockEIP1271.deploy(false) // alwaysValid = false
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()
          const invalidScwMessage = `referral for ${smartContractAddress} that will fail`
          const invalidScwReferral = {
            user: smartContractAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(invalidScwMessage),
              signature: '0x' + '22'.repeat(65), // Dummy signature, will be rejected
            },
          }

          const mixedReferrals = [
            successReferral,
            duplicateReferral,
            invalidEoaReferral,
            invalidScwReferral,
          ]

          // Execute and check events
          const tx = executeAs(
            registry,
            owner,
            BATCH_REGISTER_REFERRAL_V2,
            [mixedReferrals],
            useMetaTx,
          )

          await expect(tx)
            .to.emit(registry, 'ReferralRegistered')
            .withArgs(
              user2.address,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
            )
          await expect(tx).to.emit(registry, 'ReferralSkipped').withArgs(
            user.address,
            provider.address,
            consumer.address,
            'offchain',
            ethers.ZeroHash,
            3, // USER_ALREADY_REFERRED
          )
          await expect(tx).to.emit(registry, 'ReferralSkipped').withArgs(
            user.address,
            provider.address,
            consumer.address,
            'offchain',
            ethers.ZeroHash,
            4, // INVALID_SIGNATURE
          )
          await expect(tx).to.emit(registry, 'ReferralSkipped').withArgs(
            smartContractAddress,
            provider.address,
            consumer.address,
            'offchain',
            ethers.ZeroHash,
            4, // INVALID_SIGNATURE
          )

          // Check final state
          expect(
            await registry.isUserReferredToProvider(
              user2.address,
              provider.address,
            ),
          ).to.be.true // The new one is registered
          expect(
            await registry.isUserReferredToProvider(
              user.address,
              provider.address,
            ),
          ).to.be.true // The old one is still registered
        })

        it('should skip a referral with an invalid EOA signature', async function () {
          const message = 'a message'
          const referral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: '0x' + '11'.repeat(65), // Invalid signature
            },
          }

          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              user.address,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
              4, // INVALID_SIGNATURE
            )
        })

        it('should skip a referral with a rejecting signature from an EIP-1271 contract', async function () {
          const MockEIP1271 = await hre.ethers.getContractFactory('MockEIP1271')
          const mockContract = await MockEIP1271.deploy(false) // alwaysValid = false
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          const message = `referral for ${smartContractAddress}`
          const referral = {
            user: smartContractAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: '0x' + '22'.repeat(65), // Dummy signature, will be rejected
            },
          }

          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              smartContractAddress,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
              4, // INVALID_SIGNATURE
            )
        })

        it('should skip a referral from a smart contract that lacks the EIP-1271 interface', async function () {
          const MockNonEIP1271 =
            await hre.ethers.getContractFactory('MockNonEIP1271')
          const mockContract = await MockNonEIP1271.deploy()
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          const message = `referral for ${smartContractAddress}`
          const referral = {
            user: smartContractAddress,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: '0x' + '33'.repeat(65), // Dummy signature
            },
          }

          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              smartContractAddress,
              provider.address,
              consumer.address,
              'offchain',
              ethers.ZeroHash,
              4, // INVALID_SIGNATURE
            )
        })

        it('should skip a referral if an entity does not exist', async function () {
          const unregisteredConsumer = ethers.Wallet.createRandom()
          const message = `referral for ${user.address}`
          const signature = await user.signMessage(message)

          const referral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: unregisteredConsumer.address, // Not registered
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: signature,
            },
          }

          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              user.address,
              provider.address,
              unregisteredConsumer.address,
              'offchain',
              ethers.ZeroHash,
              1, // ENTITY_NOT_FOUND
            )

          expect(
            await registry.isUserReferredToProvider(
              user.address,
              provider.address,
            ),
          ).to.be.false
        })

        it('should skip a referral if an agreement does not exist', async function () {
          // Register extraUser as an entity but create no agreement with provider
          const otherConsumer = ethers.Wallet.createRandom()
          await setBalance(otherConsumer.address, hre.ethers.parseEther('1.0'))
          const otherConsumerSigner = await hre.ethers.getImpersonatedSigner(
            otherConsumer.address,
          )
          await (
            registry.connect(otherConsumerSigner) as typeof registry
          ).registerRewardsEntity(false)

          const message = `referral for ${user.address}`
          const signature = await user.signMessage(message)

          const referral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: otherConsumer.address, // No agreement
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: signature,
            },
          }

          await expect(
            executeAs(
              registry,
              owner,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          )
            .to.emit(registry, 'ReferralSkipped')
            .withArgs(
              user.address,
              provider.address,
              otherConsumer.address,
              'offchain',
              ethers.ZeroHash,
              2, // AGREEMENT_NOT_FOUND
            )

          expect(
            await registry.isUserReferredToProvider(
              user.address,
              provider.address,
            ),
          ).to.be.false
        })

        it('should revert when caller does not have REFERRAL_REGISTRAR_ROLE', async function () {
          const message = 'a message'
          const signature = await user.signMessage(message)
          const referral = {
            user: user.address,
            rewardsProvider: provider.address,
            rewardsConsumer: consumer.address,
            onchainTx: { txHash: ethers.ZeroHash, chainId: '' },
            offchainMessage: {
              messageType: 1, // ETH_SIGNED_MESSAGE
              message: ethers.toUtf8Bytes(message),
              signature: signature,
            },
          }

          // Attemp call from `user` who does not have the role
          await expect(
            executeAs(
              registry,
              user,
              BATCH_REGISTER_REFERRAL_V2,
              [[referral]],
              useMetaTx,
            ),
          ).to.be.revertedWithCustomError(
            registry,
            'AccessControlUnauthorizedAccount',
          )
        })
      })
    }
  })

  describe('Meta-Transaction Security', function () {
    it('should correctly identify the trusted forwarder', async function () {
      const { registry, extraUser } = await deployDivviRegistryContract()
      expect(await registry.isTrustedForwarder(TRUSTED_FORWARDER)).to.be.true
      expect(await registry.isTrustedForwarder(extraUser.address)).to.be.false

      const TRUSTED_FORWARDER_ROLE = await registry.TRUSTED_FORWARDER_ROLE()
      expect(await registry.hasRole(TRUSTED_FORWARDER_ROLE, TRUSTED_FORWARDER))
        .to.be.true
      expect(await registry.hasRole(TRUSTED_FORWARDER_ROLE, extraUser.address))
        .to.be.false
    })

    it('should revert if meta-transaction is sent via an untrusted forwarder', async function () {
      const { registry, owner, provider, extraUser } =
        await deployDivviRegistryContract()

      // Prepare calldata for owner granting provider a role
      const roleToGrant = await registry.REFERRAL_REGISTRAR_ROLE()
      const intendedSigner = owner // Owner has DEFAULT_ADMIN_ROLE to grant roles
      const untrustedForwarder = extraUser // extraUser is not the TRUSTED_FORWARDER

      const encodedData = registry.interface.encodeFunctionData('grantRole', [
        roleToGrant,
        provider.address,
      ])

      // Append the intended signer's address (owner)
      const dataWithAppendedSigner = hre.ethers.concat([
        encodedData,
        intendedSigner.address,
      ])

      // Send the transaction FROM the untrustedForwarder (extraUser)
      const txPromise = untrustedForwarder.sendTransaction({
        to: await registry.getAddress(),
        data: dataWithAppendedSigner,
      })

      // Assert that it reverts because _msgSender() returns untrustedForwarder.address,
      // which does not have the necessary DEFAULT_ADMIN_ROLE to call grantRole.
      const adminRole = await registry.DEFAULT_ADMIN_ROLE()
      await expect(txPromise)
        .to.be.revertedWithCustomError(
          registry,
          'AccessControlUnauthorizedAccount',
        )
        .withArgs(untrustedForwarder.address, adminRole)

      // Double-check that the role was not granted
      expect(await registry.hasRole(roleToGrant, provider.address)).to.be.false
    })
  })
})
