import { expect } from 'chai'
import hre from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { DataAvailabilityInterface } from '../typechain-types/contracts/DataAvailability'

const CONTRACT_NAME = 'DataAvailability'

describe('DataAvailability', () => {
  let dataAvailability: DataAvailabilityInterface
  let owner: SignerWithAddress
  let uploader: SignerWithAddress
  let extraUser: SignerWithAddress

  const UPLOADER_ROLE = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes('UPLOADER_ROLE'),
  )

  async function deployDataAvailabilityContract() {
    const [owner, uploader, extraUser] = await hre.ethers.getSigners()

    // Deploy the DataAvailability contract
    const DataAvailability = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const dataAvailability = await DataAvailability.deploy()
    await dataAvailability.waitForDeployment()

    return { dataAvailability, owner, uploader, extraUser }
  }
  beforeEach(async () => {
    const deployed = await deployDataAvailabilityContract()
    dataAvailability = deployed.dataAvailability
    owner = deployed.owner
    uploader = deployed.uploader
    extraUser = deployed.extraUser
  })

  describe('Deployment', () => {
    it('should set the deployer as the default admin', async () => {
      expect(
        await dataAvailability.hasRole(
          await dataAvailability.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
    })

    it('should set the deployer as an uploader', async () => {
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, owner.address)).to.be
        .true
    })
  })

  describe('Role Management', () => {
    it('should allow admin to grant uploader role', async () => {
      await dataAvailability.grantUploaderRole(uploader.address)
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, uploader.address)).to
        .be.true
    })

    it('should allow admin to revoke uploader role', async () => {
      await dataAvailability.grantUploaderRole(uploader.address)
      await dataAvailability.revokeUploaderRole(uploader.address)
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, uploader.address)).to
        .be.false
    })

    it('should not allow non-admin to grant uploader role', async () => {
      await expect(
        dataAvailability.connect(uploader).grantUploaderRole(extraUser.address),
      ).to.be.revertedWithCustomError(
        dataAvailability,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('should not allow revoking uploader role from creator', async () => {
      await expect(
        dataAvailability.revokeUploaderRole(owner.address),
      ).to.be.revertedWith('Cannot revoke uploader role from creator')
    })
  })

  describe('Data Upload', () => {
    beforeEach(async () => {
      await dataAvailability.grantUploaderRole(uploader.address)
    })

    it('should allow uploader to upload data', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await expect(
        dataAvailability.connect(uploader).uploadData(timestamp, users, values),
      ).to.not.be.reverted
    })

    it('should allow multiple uploads for different users at the same timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000)

      // First upload for user1
      const users1 = [extraUser.address]
      const values1 = [100]
      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users1, values1)

      // Second upload for user2 at the same timestamp
      const users2 = [uploader.address]
      const values2 = [200]
      await expect(
        dataAvailability
          .connect(uploader)
          .uploadData(timestamp, users2, values2),
      ).to.not.be.reverted

      // Verify both users have the timestamp as their last timestamp
      expect(
        await dataAvailability.getLastTimestamp(extraUser.address),
      ).to.equal(timestamp)
      expect(
        await dataAvailability.getLastTimestamp(uploader.address),
      ).to.equal(timestamp)

      // Verify the hash is non-zero (indicating data was stored)
      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.not.equal(hre.ethers.ZeroHash)
    })

    it('should not allow duplicate uploads for the same user at the same timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000)

      // First upload for the user
      const users = [extraUser.address]
      const values1 = [100]
      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users, values1)

      // Attempt to upload again for the same user at the same timestamp
      const values2 = [200]
      await expect(
        dataAvailability
          .connect(uploader)
          .uploadData(timestamp, users, values2),
      ).to.be.revertedWith('User already has data at this timestamp')

      // Verify the user's last timestamp is still correct
      expect(
        await dataAvailability.getLastTimestamp(extraUser.address),
      ).to.equal(timestamp)
    })

    it('should not allow non-uploader to upload data', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await expect(
        dataAvailability
          .connect(extraUser)
          .uploadData(timestamp, users, values),
      ).to.be.revertedWithCustomError(
        dataAvailability,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('should require timestamp to be greater than most recent', async () => {
      const timestamp1 = Math.floor(Date.now() / 1000)
      const timestamp2 = timestamp1 - 1
      const users = [extraUser.address]
      const values = [100]

      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp1, users, values)
      await expect(
        dataAvailability
          .connect(uploader)
          .uploadData(timestamp2, users, values),
      ).to.be.revertedWith(
        'Timestamp must be greater than or equal to most recent timestamp',
      )
    })

    it('should calculate correct rolling hash', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address, uploader.address]
      const values = [100, 200]
      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users, values)

      // keccak256(encodePacked(['address', 'uint256'], ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 100]))
      // > '0x0ff61c877bedc316874733e2574c5da6869d40d55e5cde4bcb053218179de1e3'
      // keccak256(encodePacked(['address', 'uint256'], ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 200]))
      // > '0x2ed43a94c31997930a2c6fe97caf231eb915ef2b55b3477460f52c5648326b3b'
      // XOR of the two:
      // '0x21222613b8f454858d6b5c0b2be37eb83f88affe0bef993fabf01e4e5faf8ad8'

      const expectedHash =
        '0x21222613b8f454858d6b5c0b2be37eb83f88affe0bef993fabf01e4e5faf8ad8'
      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.equal(expectedHash)
    })
    it('hash calculation should be commutative', async () => {
      // Same as above, but in reverse order
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [uploader.address, extraUser.address]
      const values = [200, 100]
      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users, values)

      const expectedHash =
        '0x21222613b8f454858d6b5c0b2be37eb83f88affe0bef993fabf01e4e5faf8ad8'
      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.equal(expectedHash)
    })
  })

  describe('Data Retrieval', () => {
    beforeEach(async () => {
      await dataAvailability.grantUploaderRole(uploader.address)
    })

    it('should return zero hash for non-existent timestamp', async () => {
      const hash = await dataAvailability.getHash(1234567890)
      expect(hash).to.equal(hre.ethers.ZeroHash)
    })

    it('should return correct hash for existing timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users, values)
      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.not.equal(hre.ethers.ZeroHash)
    })

    it('should track user last timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp, users, values)
      expect(
        await dataAvailability.getLastTimestamp(extraUser.address),
      ).to.equal(timestamp)
    })
  })

  describe('Timestamp Management', () => {
    beforeEach(async () => {
      await dataAvailability.grantUploaderRole(uploader.address)
    })

    it('should maintain timestamps in ascending order', async () => {
      const timestamp1 = Math.floor(Date.now() / 1000)
      const timestamp2 = timestamp1 + 100
      const users = [extraUser.address]
      const values = [100]

      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp1, users, values)
      await dataAvailability
        .connect(uploader)
        .uploadData(timestamp2, users, values)

      const allTimestamps = await dataAvailability.getAllTimestamps()
      expect(allTimestamps[0]).to.equal(timestamp1)
      expect(allTimestamps[1]).to.equal(timestamp2)
    })
  })
})
