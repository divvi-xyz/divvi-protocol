import hre from 'hardhat'
import yargs from 'yargs'

// Get address and contract name from yargs as CLI args
async function getArgs() {
  const args = await yargs(process.argv.slice(2))
    .env()
    .option('address', {
      type: 'string',
      description: 'The address of the proxy to force import',
      demandOption: true,
    })
    .option('contract-name', {
      type: 'string',
      description: 'The name of the contract to force import',
      demandOption: true,
    })
    .parse()

  return args
}

async function main() {
  const args = await getArgs()
  const ContractFactory = await hre.ethers.getContractFactory(args.contractName)

  // This registers the existing proxy with the upgrades plugin
  await hre.defender.forceImport(args.address, ContractFactory)

  console.log('Force import completed')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
