/* eslint no-console: 0 */
import hre from 'hardhat'
import { loadSecret } from '@valora/secrets-loader'
import '@nomicfoundation/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import yargs from 'yargs'

async function getConfig() {
  //
  // Load secrets from Secrets Manager and inject into process.env.
  //
  const secretNames = process.env.SECRET_NAMES?.split(',') ?? []
  for (const secretName of secretNames) {
    Object.assign(process.env, await loadSecret(secretName))
  }

  const argv = await yargs
    .env('')
    .option('deploy-salt', {
      description: 'Salt to use for CREATE2 deployments',
      type: 'string',
      demandOption: true,
    }).argv

  return {
    deploySalt: argv['deploy-salt'],
  }
}

const CONTRACT_NAME = 'Example'

async function main() {
  const config = await getConfig()
  const Contract = await hre.ethers.getContractFactory(CONTRACT_NAME)

  let address: string

  const constructorArgs = ['FOO', 'BAR']
  if (hre.network.name === 'celo') {
    console.log(`Deploying ${CONTRACT_NAME} with OpenZeppelin Defender`)
    const result = await hre.defender.deployContract(
        Contract,
      constructorArgs,
      { salt: config.deploySalt },
    )
    address = await result.getAddress()
  } else {
    console.log(`Deploying ${CONTRACT_NAME} with local signer`)
    const result = await Contract.deploy(...constructorArgs)
    address = await result.getAddress()
  }

  console.log('\nTo verify the contract, run:')
  console.log(
    `yarn hardhat verify ${address} --network ${hre.network.name} ${constructorArgs.join(' ')}`,
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})