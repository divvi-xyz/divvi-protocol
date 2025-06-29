import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  DivviEntityVerification,
  MockIdentityVerificationHubV2,
} from '../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('DivviEntityVerification', function () {
  let contract: DivviEntityVerification
  let mockHub: MockIdentityVerificationHubV2
  let owner: HardhatEthersSigner
  let entity1: HardhatEthersSigner
  let entity2: HardhatEthersSigner

  const TEST_SCOPE =
    '0x1234567890123456789012345678901234567890123456789012345678901234'
  const TRANSFER_DELAY = 3 * 24 * 60 * 60 // 3 days

  beforeEach(async function () {
    ;[owner, entity1, entity2] = await ethers.getSigners()

    // Deploy mock Self protocol hub
    const MockIdentityVerificationHubV2 = await ethers.getContractFactory(
      'MockIdentityVerificationHubV2',
    )
    mockHub = await MockIdentityVerificationHubV2.deploy()
    await mockHub.waitForDeployment()
    const mockHubAddress = await mockHub.getAddress()

    // Deploy the DivviEntityVerification contract with the mock hub
    const DivviEntityVerification = await ethers.getContractFactory(
      'DivviEntityVerification',
    )
    contract = await DivviEntityVerification.deploy(
      mockHubAddress,
      TEST_SCOPE,
      owner.address,
      TRANSFER_DELAY,
    )
    await contract.waitForDeployment()
  })

  describe('Deployment', function () {
    it('Should deploy with correct initial values', async function () {
      expect(await contract.scope()).to.equal(TEST_SCOPE)
      expect(
        await contract.hasRole(
          await contract.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
    })

    it('Should have the correct Self hub address (private variable)', async function () {
      // We can't directly check the private _identityVerificationHubV2 variable,
      // but we can verify deployment succeeded which means the constructor worked
      expect(await contract.getAddress()).to.not.be.empty
    })
  })

  describe('Query Functions', function () {
    it('Should return false for unverified entities', async function () {
      expect(await contract.isEntityVerified(entity1.address)).to.be.false
      expect(await contract.isEntityVerified(entity2.address)).to.be.false
    })

    it('Should return zero timestamp for unverified entities', async function () {
      expect(await contract.getVerificationTimestamp(entity1.address)).to.equal(
        0,
      )
    })

    it('Should return zero nullifier for unverified entities', async function () {
      expect(await contract.getEntityNullifier(entity1.address)).to.equal(0)
    })

    it('Should return correct verification details for unverified entities', async function () {
      const details = await contract.getVerificationDetails(entity1.address)
      expect(details.isVerified).to.be.false
      expect(details.timestamp).to.equal(0)
      expect(details.nullifier).to.equal(0)
    })

    it('Should handle batch verification checks', async function () {
      const entities = [entity1.address, entity2.address]
      const results = await contract.areEntitiesVerified(entities)
      expect(results).to.deep.equal([false, false])
    })

    it('Should return all entities when verification not required', async function () {
      const entities = [entity1.address, entity2.address]
      const eligible = await contract.getEligibleEntities(entities, false)
      expect(eligible).to.deep.equal(entities)
    })

    it('Should return empty array when verification required but no entities verified', async function () {
      const entities = [entity1.address, entity2.address]
      const eligible = await contract.getEligibleEntities(entities, true)
      expect(eligible).to.deep.equal([])
    })
  })

  describe('Access Control', function () {
    it('Should allow admin to query nullifier mappings', async function () {
      // This should return zero address for non-existent nullifier
      const result = await contract.getEntityByNullifier(123)
      expect(result).to.equal(ethers.ZeroAddress)
    })

    it('Should prevent non-admin from querying nullifier mappings', async function () {
      await expect(
        contract.connect(entity1).getEntityByNullifier(123),
      ).to.be.revertedWithCustomError(
        contract,
        'AccessControlUnauthorizedAccount',
      )
    })
  })

  describe('Config ID Generation', function () {
    it('Should generate consistent config IDs', async function () {
      const destChainId = ethers.encodeBytes32String('celo')
      const userIdentifier = ethers.ZeroHash
      const userData = ethers.toUtf8Bytes('test-data')

      const configId1 = await contract.getConfigId(
        destChainId,
        userIdentifier,
        userData,
      )
      const configId2 = await contract.getConfigId(
        destChainId,
        userIdentifier,
        userData,
      )

      expect(configId1).to.equal(configId2)
      expect(configId1).to.not.equal(ethers.ZeroHash)
    })

    it('Should generate same config ID for different inputs (hardcoded config)', async function () {
      const destChainId = ethers.encodeBytes32String('celo')
      const userIdentifier1 = ethers.ZeroHash
      const userIdentifier2 = ethers.keccak256(ethers.toUtf8Bytes('different'))
      const userData = ethers.toUtf8Bytes('test-data')

      const configId1 = await contract.getConfigId(
        destChainId,
        userIdentifier1,
        userData,
      )
      const configId2 = await contract.getConfigId(
        destChainId,
        userIdentifier2,
        userData,
      )

      // Since we're using a hardcoded config, both calls should return the same config ID
      expect(configId1).to.equal(configId2)
    })

    it('Should use mock hub to generate config ID', async function () {
      const destChainId = ethers.encodeBytes32String('celo')
      const userIdentifier = ethers.ZeroHash
      const userData = ethers.toUtf8Bytes('test-data')

      // Call the contract's getConfigId function
      const configId = await contract.getConfigId(
        destChainId,
        userIdentifier,
        userData,
      )

      // Verify that we can also call the mock hub directly with the same config
      const expectedConfigId = await mockHub.generateConfigId({
        olderThanEnabled: false, // Updated to match contract
        olderThan: 18,
        forbiddenCountriesEnabled: false,
        forbiddenCountriesListPacked: [0, 0, 0, 0],
        ofacEnabled: [false, false, false],
      })

      expect(configId).to.equal(expectedConfigId)
      expect(configId).to.not.equal(ethers.ZeroHash)
    })
  })

  describe('Integration Helpers', function () {
    it('Should handle empty entity arrays', async function () {
      const results = await contract.areEntitiesVerified([])
      expect(results).to.deep.equal([])

      const eligible = await contract.getEligibleEntities([], true)
      expect(eligible).to.deep.equal([])
    })

    it('Should handle single entity queries', async function () {
      const results = await contract.areEntitiesVerified([entity1.address])
      expect(results).to.deep.equal([false])

      const eligible = await contract.getEligibleEntities(
        [entity1.address],
        false,
      )
      expect(eligible).to.deep.equal([entity1.address])
    })
  })

  // Note: We can't easily test the actual verification flow without mocking the Self protocol hub
  // This would require more complex test setup with mock contracts
  describe('Verification Flow (Limited Testing)', function () {
    it('Should have the customVerificationHook function (not directly callable)', async function () {
      // We can't call customVerificationHook directly as it's internal
      // But we can verify the contract has the required interface
      expect(contract.interface.getFunction('isEntityVerified')).to.not.be
        .undefined
      expect(contract.interface.getFunction('verifySelfProof')).to.not.be
        .undefined
    })

    it('Should have proper inheritance from SelfVerificationRoot', async function () {
      // Verify that scope function exists (inherited from SelfVerificationRoot)
      expect(await contract.scope()).to.equal(TEST_SCOPE)
    })
  })
})
