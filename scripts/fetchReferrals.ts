import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { supportedNetworkIds } from './utils/networks'
import { protocolFilters } from './protocolFilters'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'
import { Protocol, protocols } from './types'

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('protocol', {
      description: 'protocol that the referrals are for',
      demandOption: true,
      choices: protocols,
    })
    .option('output-file', {
      alias: 'o',
      description: 'output file',
      type: 'string',
    }).argv

  return {
    protocol: argv['protocol'] as Protocol,
    protocolFilter: protocolFilters[argv['protocol'] as Protocol],
    output: argv['output-file'] ?? `${argv['protocol']}-referrals.csv`,
  }
}

async function main() {
  const args = await getArgs()

  const referralEvents = await fetchReferralEvents(
    supportedNetworkIds,
    args.protocol,
  )
  const uniqueEvents = removeDuplicates(referralEvents)

  const filteredEvents = await args.protocolFilter(uniqueEvents)
  const output = filteredEvents
    .map(
      (event) => `${event.referrerId},${event.userAddress},${event.timestamp}`,
    )
    .join('\n')

  writeFileSync(args.output, output)
  console.log(`Wrote results to ${args.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
