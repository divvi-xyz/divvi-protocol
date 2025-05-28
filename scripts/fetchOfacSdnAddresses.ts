import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import yargs from 'yargs'
import { stringify } from 'csv-stringify/sync'
import { getOfacSdnAddresses } from './utils/ofacSdnAddresses'

async function getArgs() {
  const argv = await yargs.env('').option('output', {
    description: 'Output file',
    default: 'ofac-sdn-addresses.csv',
  }).argv

  return {
    output: argv['output'],
  }
}

async function main() {
  const args = await getArgs()

  const ofacSdnAddresses = await getOfacSdnAddresses()

  const data = ofacSdnAddresses.map((address) => ({ referrerId: address }))

  // Create directory if it doesn't exist
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, stringify(data, { header: true }), {
    encoding: 'utf-8',
  })

  console.log(
    `Wrote ${ofacSdnAddresses.length} OFAC SDN addresses to ${args.output}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
