import { expect } from 'chai'
import hre from 'hardhat'

const CONTRACT_NAME = 'DataAvailability'

function sumBuffersModulo(buffer1: Buffer, buffer2: Buffer) {
  const buffer1BigInt = BigInt('0x' + buffer1.toString('hex'))
  const buffer2BigInt = BigInt('0x' + buffer2.toString('hex'))

  const result = (buffer1BigInt + buffer2BigInt) % 2n ** 256n

  return Buffer.from(result.toString(16), 'hex')
}

describe('DataAvailability', () => {
  const UPLOADER_ROLE = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes('UPLOADER_ROLE'),
  )

  async function deployDataAvailabilityContract() {
    const [owner, uploader, extraUser] = await hre.ethers.getSigners()

    // Deploy the DataAvailability contract
    const DataAvailability = await hre.ethers.getContractFactory(CONTRACT_NAME)
    const dataAvailability = await DataAvailability.deploy(owner.address)

    return { dataAvailability, owner, uploader, extraUser }
  }

  describe('Deployment', () => {
    it('should set the deployer as the default admin', async () => {
      const { dataAvailability, owner } = await deployDataAvailabilityContract()
      expect(
        await dataAvailability.hasRole(
          await dataAvailability.DEFAULT_ADMIN_ROLE(),
          owner.address,
        ),
      ).to.be.true
    })

    it('should set the deployer as an uploader', async () => {
      const { dataAvailability, owner } = await deployDataAvailabilityContract()
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, owner.address)).to.be
        .true
    })
  })

  describe('Role Management', () => {
    it('should allow admin to grant uploader role', async () => {
      const { dataAvailability, uploader } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, uploader.address)).to
        .be.true
    })

    it('should allow admin to revoke uploader role', async () => {
      const { dataAvailability, uploader } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)
      await dataAvailability.revokeUploaderRole(uploader.address)
      expect(await dataAvailability.hasRole(UPLOADER_ROLE, uploader.address)).to
        .be.false
    })

    it('should not allow non-admin to grant uploader role', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await expect(
        (
          dataAvailability.connect(uploader) as typeof dataAvailability
        ).grantUploaderRole(extraUser.address),
      ).to.be.revertedWithCustomError(
        dataAvailability,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('should not allow revoking uploader role from owner', async () => {
      const { dataAvailability, owner } = await deployDataAvailabilityContract()
      await expect(
        dataAvailability.revokeUploaderRole(owner.address),
      ).to.be.revertedWith('Cannot revoke uploader role from owner')
    })
  })

  describe('Data Upload', () => {
    beforeEach(async () => {})

    it('should allow uploader to upload data', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await expect(
        (
          dataAvailability.connect(uploader) as typeof dataAvailability
        ).uploadData(timestamp, users, values),
      ).to.not.be.reverted
    })

    it('should allow multiple uploads for different users at the same timestamp', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)

      // First upload for user1
      const users1 = [extraUser.address]
      const values1 = [100]
      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users1, values1)

      // Second upload for user2 at the same timestamp
      const users2 = [uploader.address]
      const values2 = [200]
      await expect(
        (
          dataAvailability.connect(uploader) as typeof dataAvailability
        ).uploadData(timestamp, users2, values2),
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
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)

      // First upload for the user
      const users = [extraUser.address]
      const values1 = [100]
      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users, values1)

      // Attempt to upload again for the same user at the same timestamp
      const values2 = [200]
      await expect(
        (
          dataAvailability.connect(uploader) as typeof dataAvailability
        ).uploadData(timestamp, users, values2),
      ).to.be.revertedWith('User already has data at this timestamp')

      // Verify the user's last timestamp is still correct
      expect(
        await dataAvailability.getLastTimestamp(extraUser.address),
      ).to.equal(timestamp)
    })

    it('should not allow non-uploader to upload data', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await expect(
        (
          dataAvailability.connect(extraUser) as typeof dataAvailability
        ).uploadData(timestamp, users, values),
      ).to.be.revertedWithCustomError(
        dataAvailability,
        'AccessControlUnauthorizedAccount',
      )
    })

    it('should require timestamp to be greater than most recent', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp1 = Math.floor(Date.now() / 1000)
      const timestamp2 = timestamp1 - 1
      const users = [extraUser.address]
      const values = [100]

      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp1, users, values)
      await expect(
        (
          dataAvailability.connect(uploader) as typeof dataAvailability
        ).uploadData(timestamp2, users, values),
      ).to.be.revertedWith(
        'Timestamp must be greater than or equal to most recent timestamp',
      )
    })

    it('should calculate correct rolling hash', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address, uploader.address]
      const values = [100, 200]
      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users, values)

      const hash1 = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ['address', 'uint256'],
          [extraUser.address, 100],
        ),
      )
      const hash2 = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ['address', 'uint256'],
          [uploader.address, 200],
        ),
      )
      const expectedHash = `0x${sumBuffersModulo(Buffer.from(hash1.slice(2), 'hex'), Buffer.from(hash2.slice(2), 'hex')).toString('hex')}`

      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.equal(expectedHash)
    })
    it('hash calculation should be commutative', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      // Same as above, but in reverse order
      const timestamp = Math.floor(Date.now() / 1000)
      const users = [uploader.address, extraUser.address]
      const values = [200, 100]
      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users, values)

      const hash1 = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ['address', 'uint256'],
          [extraUser.address, 100],
        ),
      )
      const hash2 = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ['address', 'uint256'],
          [uploader.address, 200],
        ),
      )
      const expectedHash = `0x${sumBuffersModulo(Buffer.from(hash1.slice(2), 'hex'), Buffer.from(hash2.slice(2), 'hex')).toString('hex')}`

      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.equal(expectedHash)
    })
  })

  describe('Data Retrieval', () => {
    it('should return zero hash for non-existent timestamp', async () => {
      const { dataAvailability, uploader } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const hash = await dataAvailability.getHash(1234567890)
      expect(hash).to.equal(hre.ethers.ZeroHash)
    })

    it('should return correct hash for existing timestamp', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users, values)
      const hash = await dataAvailability.getHash(timestamp)
      expect(hash).to.not.equal(hre.ethers.ZeroHash)
    })

    it('should track user last timestamp', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp = Math.floor(Date.now() / 1000)
      const users = [extraUser.address]
      const values = [100]

      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp, users, values)
      expect(
        await dataAvailability.getLastTimestamp(extraUser.address),
      ).to.equal(timestamp)
    })
  })

  describe('Timestamp Management', () => {
    it('should maintain timestamps in ascending order', async () => {
      const { dataAvailability, uploader, extraUser } =
        await deployDataAvailabilityContract()
      await dataAvailability.grantUploaderRole(uploader.address)

      const timestamp1 = Math.floor(Date.now() / 1000)
      const timestamp2 = timestamp1 + 100
      const users = [extraUser.address]
      const values = [100]

      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp1, users, values)
      await (
        dataAvailability.connect(uploader) as typeof dataAvailability
      ).uploadData(timestamp2, users, values)

      const allTimestamps = await dataAvailability.getAllTimestamps()
      expect(allTimestamps[0]).to.equal(timestamp1)
      expect(allTimestamps[1]).to.equal(timestamp2)
    })
  })
})
