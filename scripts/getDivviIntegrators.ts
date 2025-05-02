import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { Address } from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from './utils/hypersyncPagination'
import { getHyperSyncClient } from './utils'
import { NetworkId } from './types'

async function getArgs() {
  const argv = await yargs.env('').option('output-file', {
    alias: 'o',
    description: 'output file',
    type: 'string',
  }).argv

  return {
    output: argv['output-file'] ?? `${argv['protocol']}-referrals.csv`,
  }
}

function removeDuplicates<T>(arr: T[]): T[] {
  const seen = new Set<T>()
  return arr.filter((item) => {
    if (seen.has(item)) {
      return false
    }
    seen.add(item)
    return true
  })
}

async function getDivviIntegrators(): Promise<Address[]> {
  const usersThatHaveIntegrated: Address[] = []
  const usersThatHaveReceivedRewards = new Set<Address>()

  const queryForIntegrators = {
    logs: [
      {
        topics: [
          [
            '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0', // ReferralRegistered topic
          ],
        ],
      },
    ],
    transactions: [{ from: ['0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'] }], // DivviRegistry production contract
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2, LogField.Topic3],
    },
    fromBlock: 0,
  }

  const queryForRewardsReceivers = {
    logs: [{ topics: [['0x123']] }], // TODO: Replace with the actual topic for AddReward
    transactions: [{ from: ['0x123'] }], // TODO: Replace with the actual contract address
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1],
    },
    fromBlock: 0,
  }

  const client = getHyperSyncClient(NetworkId['op-mainnet'])

  await Promise.all([
    paginateQuery(client, queryForIntegrators, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveIntegrated.push(transaction.topics[3] as Address)
      }
    }),
    paginateQuery(client, queryForRewardsReceivers, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveReceivedRewards.add(transaction.topics[1] as Address)
      }
    }),
  ])

  const deduplicatedUsersThatHaveIntegrated = removeDuplicates(
    usersThatHaveIntegrated,
  )

  // TODO: Also filter for if the user is whitelisted
  const userToReceiveRewards = deduplicatedUsersThatHaveIntegrated.filter(
    (user: Address) => !usersThatHaveReceivedRewards.has(user),
  )

  return userToReceiveRewards
}

async function main() {
  const args = await getArgs()

  const integratorAddresses = await getDivviIntegrators()

  writeFileSync(args.output, integratorAddresses.join('\n'))
  console.log(`Wrote results to ${args.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
