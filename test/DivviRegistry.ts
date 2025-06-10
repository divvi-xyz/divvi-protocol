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
              'batchRegisterReferral',
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
            'batchRegisterReferral',
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
              'batchRegisterReferral',
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
              'batchRegisterReferral',
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
              'batchRegisterReferral',
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
              'batchRegisterReferral',
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

  describe('Referrals with Offchain Signature', function () {
    let provider: HardhatEthersSigner
    let consumer: HardhatEthersSigner
    let user: HardhatEthersSigner
    let extraUser: HardhatEthersSigner
    let registry: Awaited<
      ReturnType<typeof deployDivviRegistryContract>
    >['registry']
    let owner: HardhatEthersSigner

    beforeEach(async function () {
      const deployed = await deployDivviRegistryContract()
      registry = deployed.registry
      owner = deployed.owner
      provider = deployed.provider
      consumer = deployed.consumer
      user = deployed.extraUser
      extraUser = deployed.provider // Use provider as second user for testing

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

    describe('EIP-712 Domain Functions', function () {
      it('should return correct domain separator and type hash', async function () {
        const domainSeparator = await registry.getDomainSeparator()
        const typeHash = await registry.getReferralTypeHash()

        expect(domainSeparator).to.be.a('string')
        expect(typeHash).to.be.a('string')
        expect(typeHash).to.equal(
          ethers.keccak256(
            ethers.toUtf8Bytes(
              'DivviReferral(address user,address rewardsConsumer)',
            ),
          ),
        )
      })

      it('should return correct EIP-712 domain info', async function () {
        const domain = await registry.eip712Domain()
        expect(domain.name).to.equal('DivviRegistry')
        expect(domain.version).to.equal('1')
        expect(domain.chainId).to.equal(31337n) // Default hardhat network chainId
        expect(domain.verifyingContract).to.equal(await registry.getAddress())
      })
    })

    describe('Signature Verification', function () {
      describe('EOA Signatures', function () {
        it('should verify valid ECDSA signatures from EOAs', async function () {
          // Create signature
          const domain = {
            name: 'DivviRegistry',
            version: '1',
            chainId: 31337,
            verifyingContract: await registry.getAddress(),
          }

          const types = {
            DivviReferral: [
              { name: 'user', type: 'address' },
              { name: 'rewardsConsumer', type: 'address' },
            ],
          }

          const message = {
            user: user.address,
            rewardsConsumer: consumer.address,
          }

          const signature = await user.signTypedData(domain, types, message)

          const isValid = await registry.verifyReferralSignature(
            user.address,
            consumer.address,
            signature,
          )

          expect(isValid).to.be.true
        })

        it('should reject invalid signatures', async function () {
          // Create signature with wrong user
          const domain = {
            name: 'DivviRegistry',
            version: '1',
            chainId: 31337,
            verifyingContract: await registry.getAddress(),
          }

          const types = {
            DivviReferral: [
              { name: 'user', type: 'address' },
              { name: 'rewardsConsumer', type: 'address' },
            ],
          }

          const message = {
            user: extraUser.address, // Wrong user
            rewardsConsumer: consumer.address,
          }

          const signature = await user.signTypedData(domain, types, message)

          const isValid = await registry.verifyReferralSignature(
            user.address, // Correct user but wrong signature
            consumer.address,
            signature,
          )

          expect(isValid).to.be.false
        })
      })

      describe('Smart Contract Signatures (EIP-1271)', function () {
        it('should verify valid signatures from smart contracts', async function () {
          // Deploy a mock EIP-1271 contract that always validates signatures
          const MockEIP1271 = await hre.ethers.getContractFactory(
            'contracts/mocks/MockEIP1271.sol:MockEIP1271',
          )
          const mockContract = await MockEIP1271.deploy(true) // alwaysValid = true
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          // Test signature verification
          const isValid = await registry.verifyReferralSignature(
            smartContractAddress,
            consumer.address,
            '0x' + '00'.repeat(65), // Any signature should work with our mock
          )

          expect(isValid).to.be.true
        })

        it('should reject invalid signatures from smart contracts', async function () {
          // Deploy a mock EIP-1271 contract that never validates signatures
          const MockEIP1271 = await hre.ethers.getContractFactory(
            'contracts/mocks/MockEIP1271.sol:MockEIP1271',
          )
          const mockContract = await MockEIP1271.deploy(false) // alwaysValid = false
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          // Test signature verification
          const isValid = await registry.verifyReferralSignature(
            smartContractAddress,
            consumer.address,
            '0x' + '00'.repeat(65), // Any signature should be rejected
          )

          expect(isValid).to.be.false
        })

        it('should handle smart contracts that do not implement EIP-1271', async function () {
          // Deploy a contract that doesn't implement EIP-1271
          const MockNonEIP1271 = await hre.ethers.getContractFactory(
            'contracts/mocks/MockEIP1271.sol:MockNonEIP1271',
          )
          const mockContract = await MockNonEIP1271.deploy()
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          // Test signature verification - should return false when contract doesn't implement EIP-1271
          const isValid = await registry.verifyReferralSignature(
            smartContractAddress,
            consumer.address,
            '0x' + '00'.repeat(65),
          )

          expect(isValid).to.be.false
        })

        it('should handle smart contracts with selective hash validation', async function () {
          // Deploy a mock EIP-1271 contract that validates specific hashes
          const MockEIP1271 = await hre.ethers.getContractFactory(
            'contracts/mocks/MockEIP1271.sol:MockEIP1271',
          )
          const mockContract = await MockEIP1271.deploy(false) // alwaysValid = false
          await mockContract.waitForDeployment()
          const smartContractAddress = await mockContract.getAddress()

          // Calculate the message hash for this specific message
          const domain = {
            name: 'DivviRegistry',
            version: '1',
            chainId: 31337,
            verifyingContract: await registry.getAddress(),
          }

          const types = {
            DivviReferral: [
              { name: 'user', type: 'address' },
              { name: 'rewardsConsumer', type: 'address' },
            ],
          }

          const message = {
            user: smartContractAddress,
            rewardsConsumer: consumer.address,
          }

          const messageHash = ethers.TypedDataEncoder.hash(
            domain,
            types,
            message,
          )

          // Set this specific hash as valid in the mock contract
          await mockContract.setValidHash(messageHash, true)

          // Test signature verification - should now return true
          const isValid = await registry.verifyReferralSignature(
            smartContractAddress,
            consumer.address,
            '0x' + '00'.repeat(65),
          )

          expect(isValid).to.be.true

          // Test with a different rewardsConsumer (different hash) - should return false
          const [, , , extraUser] = await hre.ethers.getSigners()
          const isValidDifferentHash = await registry.verifyReferralSignature(
            smartContractAddress,
            extraUser.address,
            '0x' + '00'.repeat(65),
          )

          expect(isValidDifferentHash).to.be.false
        })
      })
    })

    describe('Batch Referral Registration V2', function () {
      for (const useMetaTx of [false, true]) {
        describe(`via ${useMetaTx ? 'meta-transaction' : 'direct call'}`, function () {
          it('should process signature-based referrals', async function () {
            // Create signature
            const domain = {
              name: 'DivviRegistry',
              version: '1',
              chainId: 31337,
              verifyingContract: await registry.getAddress(),
            }

            const types = {
              DivviReferral: [
                { name: 'user', type: 'address' },
                { name: 'rewardsConsumer', type: 'address' },
              ],
            }

            const message = {
              user: user.address,
              rewardsConsumer: consumer.address,
            }

            const signature = await user.signTypedData(domain, types, message)

            const referralV2 = {
              user: user.address,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: ethers.ZeroHash,
              chainId: '',
              offchainSignature: signature,
            }

            await expect(
              executeAs(
                registry,
                owner,
                'batchRegisterReferralV2',
                [[referralV2]],
                useMetaTx,
              ),
            )
              .to.emit(registry, 'ReferralRegistered')
              .withArgs(
                user.address,
                provider.address,
                consumer.address,
                '', // Empty chainId for signature-based
                ethers.ZeroHash, // Zero txHash for signature-based
              )

            expect(
              await registry.isUserReferredToProvider(
                user.address,
                provider.address,
              ),
            ).to.be.true
          })

          it('should process mixed tx-based and signature-based referrals', async function () {
            // Create signature for user
            const domain = {
              name: 'DivviRegistry',
              version: '1',
              chainId: 31337,
              verifyingContract: await registry.getAddress(),
            }

            const types = {
              DivviReferral: [
                { name: 'user', type: 'address' },
                { name: 'rewardsConsumer', type: 'address' },
              ],
            }

            const message = {
              user: user.address,
              rewardsConsumer: consumer.address,
            }

            const signature = await user.signTypedData(domain, types, message)

            const referrals = [
              // Signature-based referral
              {
                user: user.address,
                rewardsProvider: provider.address,
                rewardsConsumer: consumer.address,
                txHash: ethers.ZeroHash,
                chainId: '',
                offchainSignature: signature,
              },
              // Traditional tx-based referral (empty signature)
              {
                user: extraUser.address,
                rewardsProvider: provider.address,
                rewardsConsumer: consumer.address,
                txHash:
                  '0x1234567890123456789012345678901234567890123456789012345678901234',
                chainId: 'ethereum',
                offchainSignature: '0x',
              },
            ]

            await expect(
              executeAs(
                registry,
                owner,
                'batchRegisterReferralV2',
                [referrals],
                useMetaTx,
              ),
            )
              .to.emit(registry, 'ReferralRegistered')
              .withArgs(
                user.address,
                provider.address,
                consumer.address,
                '', // Empty for signature-based
                ethers.ZeroHash,
              )
              .to.emit(registry, 'ReferralRegistered')
              .withArgs(
                extraUser.address,
                provider.address,
                consumer.address,
                'ethereum', // Real chainId for tx-based
                '0x1234567890123456789012345678901234567890123456789012345678901234',
              )

            expect(
              await registry.isUserReferredToProvider(
                user.address,
                provider.address,
              ),
            ).to.be.true
            expect(
              await registry.isUserReferredToProvider(
                extraUser.address,
                provider.address,
              ),
            ).to.be.true
          })

          it('should skip referrals with invalid signatures', async function () {
            const referralV2 = {
              user: user.address,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash: ethers.ZeroHash,
              chainId: '',
              offchainSignature: '0x' + '00'.repeat(65), // Invalid signature of correct length
            }

            await expect(
              executeAs(
                registry,
                owner,
                'batchRegisterReferralV2',
                [[referralV2]],
                useMetaTx,
              ),
            )
              .to.emit(registry, 'ReferralSkipped')
              .withArgs(
                user.address,
                provider.address,
                consumer.address,
                '',
                ethers.ZeroHash,
                4, // INVALID_SIGNATURE
              )

            expect(
              await registry.isUserReferredToProvider(
                user.address,
                provider.address,
              ),
            ).to.be.false
          })

          it('should maintain backward compatibility with traditional flow', async function () {
            // Use V2 function with empty signature (traditional flow)
            const referralV2 = {
              user: user.address,
              rewardsProvider: provider.address,
              rewardsConsumer: consumer.address,
              txHash:
                '0x1234567890123456789012345678901234567890123456789012345678901234',
              chainId: 'ethereum',
              offchainSignature: '0x', // Empty signature triggers traditional flow
            }

            await expect(
              executeAs(
                registry,
                owner,
                'batchRegisterReferralV2',
                [[referralV2]],
                useMetaTx,
              ),
            )
              .to.emit(registry, 'ReferralRegistered')
              .withArgs(
                user.address,
                provider.address,
                consumer.address,
                'ethereum',
                '0x1234567890123456789012345678901234567890123456789012345678901234',
              )

            expect(
              await registry.isUserReferredToProvider(
                user.address,
                provider.address,
              ),
            ).to.be.true
          })
        })
      }
    })
  })
})
