import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

// Self protocol Identity Verification Hub addresses
const SELF_HUB_ADDRESSES = {
  celo: '0x77117D60eaB7C044e785D68edB6C7E0e134970Ea', // Celo mainnet
  alfajores: '0x3e2487a250e2A7b56c7ef5307Fb591Cc8C83623D', // Celo testnet
}

// Helper function to calculate scope (simplified version for demo)
function calculateScope(contractAddress: string, appName: string): string {
  const keccak256 = require('js-sha3').keccak256
  const encoded = `${contractAddress}${appName}`
  return `0x${keccak256(encoded)}`
}

task(
  'deploy-entity-verification',
  'Deploy the DivviEntityVerification contract',
)
  .addOptionalParam('admin', 'Admin address (defaults to deployer)')
  .addOptionalParam(
    'transferDelay',
    'Admin role transfer delay in seconds',
    '259200',
  ) // 3 days default
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre
    const [deployer] = await ethers.getSigners()

    console.log('Deploying DivviEntityVerification contract...')
    console.log('Network:', network.name)
    console.log('Deployer:', deployer.address)

    // Get the appropriate Self hub address for the network
    const hubAddress =
      SELF_HUB_ADDRESSES[network.name as keyof typeof SELF_HUB_ADDRESSES]
    if (!hubAddress) {
      throw new Error(
        `No Self hub address configured for network: ${network.name}`,
      )
    }

    // Calculate the future contract address to generate scope
    const nonce = await ethers.provider.getTransactionCount(deployer.address)
    const futureAddress = ethers.getCreateAddress({
      from: deployer.address,
      nonce: nonce,
    })

    // Generate scope for this contract
    const scope = calculateScope(
      futureAddress,
      'Divvi-Entity-Verification-Demo',
    )

    console.log('Future contract address:', futureAddress)
    console.log('Generated scope:', scope)
    console.log('Self hub address:', hubAddress)

    // Deploy the contract
    const DivviEntityVerification = await ethers.getContractFactory(
      'DivviEntityVerification',
    )

    const admin = taskArgs.admin || deployer.address
    const transferDelay = parseInt(taskArgs.transferDelay)

    console.log('Admin address:', admin)
    console.log('Transfer delay:', transferDelay, 'seconds')

    const contract = await DivviEntityVerification.deploy(
      hubAddress,
      scope,
      admin,
      transferDelay,
    )

    await contract.waitForDeployment()
    const contractAddress = await contract.getAddress()

    console.log('✅ DivviEntityVerification deployed to:', contractAddress)
    console.log('Scope used:', scope)

    // Verify the deployment
    console.log('\n🔍 Verifying deployment...')
    const deployedScope = await contract.scope()
    console.log('Deployed scope:', deployedScope)
    console.log('Scope matches:', deployedScope === scope)

    // Save deployment info
    console.log('\n📋 Deployment Summary:')
    console.log('Contract Address:', contractAddress)
    console.log('Network:', network.name)
    console.log('Admin:', admin)
    console.log('Self Hub:', hubAddress)
    console.log('Scope:', scope)

    return contractAddress
  })

task('verify-entity', 'Check if an entity is verified')
  .addParam('contract', 'DivviEntityVerification contract address')
  .addParam('entity', 'Entity address to check')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre

    console.log('Checking entity verification status...')
    console.log('Contract:', taskArgs.contract)
    console.log('Entity:', taskArgs.entity)

    const DivviEntityVerification = await ethers.getContractFactory(
      'DivviEntityVerification',
    )
    const contract = DivviEntityVerification.attach(taskArgs.contract)

    const isVerified = await contract.isEntityVerified(taskArgs.entity)
    console.log('Verified:', isVerified)

    if (isVerified) {
      const details = await contract.getVerificationDetails(taskArgs.entity)
      console.log('Verification timestamp:', details.timestamp.toString())
      console.log('Nullifier:', details.nullifier.toString())
    }
  })

task('batch-verify-entities', 'Check verification status for multiple entities')
  .addParam('contract', 'DivviEntityVerification contract address')
  .addParam('entities', 'Comma-separated list of entity addresses')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre

    const entityAddresses = taskArgs.entities
      .split(',')
      .map((addr: string) => addr.trim())

    console.log(
      'Checking verification status for',
      entityAddresses.length,
      'entities...',
    )
    console.log('Contract:', taskArgs.contract)

    const DivviEntityVerification = await ethers.getContractFactory(
      'DivviEntityVerification',
    )
    const contract = DivviEntityVerification.attach(taskArgs.contract)

    const results = await contract.areEntitiesVerified(entityAddresses)

    console.log('\n📊 Verification Results:')
    entityAddresses.forEach((address, index) => {
      console.log(
        `${address}: ${results[index] ? '✅ Verified' : '❌ Not Verified'}`,
      )
    })

    const verifiedCount = results.filter(Boolean).length
    console.log(
      `\nSummary: ${verifiedCount}/${entityAddresses.length} entities verified`,
    )
  })

task('eligible-entities', 'Get entities eligible for a campaign')
  .addParam('contract', 'DivviEntityVerification contract address')
  .addParam('entities', 'Comma-separated list of entity addresses')
  .addOptionalParam('require', 'Require verification (true/false)', 'true')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre

    const entityAddresses = taskArgs.entities
      .split(',')
      .map((addr: string) => addr.trim())
    const requireVerification = taskArgs.require === 'true'

    console.log('Getting eligible entities for campaign...')
    console.log('Contract:', taskArgs.contract)
    console.log('Require verification:', requireVerification)
    console.log('Total entities:', entityAddresses.length)

    const DivviEntityVerification = await ethers.getContractFactory(
      'DivviEntityVerification',
    )
    const contract = DivviEntityVerification.attach(taskArgs.contract)

    const eligibleEntities = await contract.getEligibleEntities(
      entityAddresses,
      requireVerification,
    )

    console.log('\n🎯 Eligible Entities:')
    if (eligibleEntities.length === 0) {
      console.log('No entities are eligible')
    } else {
      eligibleEntities.forEach((address, index) => {
        console.log(`${index + 1}. ${address}`)
      })
    }

    console.log(
      `\nSummary: ${eligibleEntities.length}/${entityAddresses.length} entities eligible`,
    )
  })
