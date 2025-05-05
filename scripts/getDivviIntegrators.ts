import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { Address, encodeEventTopics } from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from './utils/hypersyncPagination'
import { getHyperSyncClient } from './utils'
import { NetworkId } from './types'

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('output-file', {
      alias: 'o',
      description: 'output file',
      type: 'string',
    })
    .option('reward-pool', {
      description: 'RewardPool contract address',
      type: 'string',
      demandOption: true,
    })
    .option('reward-amount', {
      description: 'reward amount for integration',
      type: 'string',
    }).argv

  return {
    output: argv['output-file'] ?? 'divvi-integrator-rewards.csv',
    rewardPoolContractAddress: argv['reward-pool'],
    rewardAmount: argv['reward-amount'],
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

async function getDivviIntegrators({
  rewardPoolContractAddress,
}: {
  rewardPoolContractAddress: string
}): Promise<Address[]> {
  const usersThatHaveIntegrated: Address[] = []
  const usersThatHaveReceivedRewards = new Set<Address>()
  const usersThatHaveRegisteredAgreements = new Set<Address>()

  const queryForIntegrators = {
    logs: [
      {
        address: ['0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'], // DivviRegistry production contract
        topics: [
          [
            '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0', // ReferralRegistered topic
          ],
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2, LogField.Topic3],
    },
    fromBlock: 0,
  }

  const ADD_REWARD_TOPIC = encodeEventTopics({
    abi: rewardPoolAbi,
    eventName: 'AddReward',
  })[0]

  const queryForRewardsReceivers = {
    logs: [
      { address: [rewardPoolContractAddress], topics: [[ADD_REWARD_TOPIC]] },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1],
    },
    fromBlock: 0,
  }

  const queryForRegisteredAgreements = {
    logs: [
      {
        address: ['0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'], // DivviRegistry production contract
        topics: [
          [
            '0x71ca44fbbd43371f6298c2bef5521b2ade5a42b3239e920cb28a5af430be9bf0', // RewardsAgreementRegistered topic
          ],
          ['0x6226ddE08402642964f9A6de844ea3116F0dFc7e'], // Divvi Integration Rewards entity
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2],
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
    paginateQuery(client, queryForRegisteredAgreements, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveRegisteredAgreements.add(transaction.topics[2] as Address)
      }
    }),
  ])

  const deduplicatedUsersThatHaveIntegrated = removeDuplicates(
    usersThatHaveIntegrated,
  )

  // TODO(ENG-345): Also filter for if the user is whitelisted
  const userToReceiveRewards = deduplicatedUsersThatHaveIntegrated.filter(
    (user: Address) =>
      !usersThatHaveReceivedRewards.has(user) &&
      usersThatHaveRegisteredAgreements.has(user),
  )

  return userToReceiveRewards
}

async function main() {
  const args = await getArgs()

  const integratorAddresses = await getDivviIntegrators({
    rewardPoolContractAddress: args.rewardPoolContractAddress,
  })

  writeFileSync(
    args.output,
    integratorAddresses
      .map((address) => `${address},${args.rewardAmount}`)
      .join('\n'),
  )
  console.log(`Wrote results to ${args.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
