import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { Address, encodeEventTopics, pad } from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from './utils/hypersyncPagination'
import { getHyperSyncClient } from './utils'
import { NetworkId } from './types'
import { divviRegistryAbi } from '../abis/DivviRegistry'
import { rewardPoolAbi } from '../abis/RewardPool'
import { fetchWithTimeout } from './utils/fetchWithTimeout'
import { getNearestBlock } from './calculateRevenue/protocols/utils/events'

const DIVVI_REGISTRY_CONTRACT_ADDRESS =
  '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'
const DIVVI_INTEGRATION_REWARDS_ENTITY =
  '0x6226ddE08402642964f9A6de844ea3116F0dFc7e'

const ALLOWLIST_URL =
  'https://raw.githubusercontent.com/divvi-xyz/integration-list/main/src/integration-list.json'
type AllowlistedConsumer = {
  entityAddress: Address
  githubConsumername: string
}

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
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'inclusive timestamp at which to start checking for integrators (new Date() compatible)',
      type: 'number',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'exclusive timestamp at which to stop checking for integrators (new Date() compatible)',
      type: 'number',
      demandOption: true,
    }).argv

  return {
    output: argv['output-file'] ?? 'divvi-integrator-rewards.csv',
    rewardPoolContractAddress: argv['reward-pool'],
    rewardAmount: argv['reward-amount'],
    startTimestamp: new Date(argv['start-timestamp']),
    endTimestamp: new Date(argv['end-timestamp']),
  }
}

async function getAllowlist() {
  try {
    const fetchAllowlistResponse = await fetchWithTimeout(ALLOWLIST_URL)
    if (!fetchAllowlistResponse.ok) {
      throw new Error(
        `Failed to fetch allowlist: ${fetchAllowlistResponse.statusText}`,
      )
    }
    const allowlistedConsumerObjects =
      (await fetchAllowlistResponse.json()) as AllowlistedConsumer[]
    const allowlistedConsumers = new Set(
      allowlistedConsumerObjects.map(({ entityAddress }) =>
        pad(entityAddress).toLowerCase(),
      ),
    )
    return allowlistedConsumers
  } catch (error) {
    console.log('Error fetching allowlist:', error)
    return new Set<string>()
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
  startTimestamp,
  endTimestamp,
}: {
  rewardPoolContractAddress: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<Address[]> {
  const consumersThatHaveIntegrated: Address[] = []
  const consumersThatHaveReceivedRewards = new Set<Address>()
  const consumersWithDivviIntegrationAgreement = new Set<Address>()

  const REFERRAL_REGISTERED_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'ReferralRegistered',
  })[0]

  const [startBlock, endBlock] = await Promise.all([
    getNearestBlock(NetworkId['op-mainnet'], startTimestamp),
    getNearestBlock(NetworkId['op-mainnet'], endTimestamp),
  ])

  const queryForIntegrators = {
    fromBlock: startBlock,
    toBlock: endBlock,
    logs: [
      {
        address: [DIVVI_REGISTRY_CONTRACT_ADDRESS],
        topics: [[REFERRAL_REGISTERED_TOPIC]],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2, LogField.Topic3],
    },
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

  const REWARDS_AGREEMENT_REGISTERED_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'RewardsAgreementRegistered',
  })[0]

  const queryForRegisteredDivviIntegrationAgreement = {
    logs: [
      {
        address: [DIVVI_REGISTRY_CONTRACT_ADDRESS],
        topics: [
          [REWARDS_AGREEMENT_REGISTERED_TOPIC],
          [pad(DIVVI_INTEGRATION_REWARDS_ENTITY)],
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2],
    },
    fromBlock: 0,
  }

  const client = getHyperSyncClient(NetworkId['op-mainnet'])

  console.log('Querying for consumers...')

  const [_void1, _void2, _void3, allowlistedConsumers] = await Promise.all([
    paginateQuery(client, queryForIntegrators, async (response) => {
      for (const transaction of response.data.logs) {
        consumersThatHaveIntegrated.push(
          transaction.topics[3]?.toLowerCase() as Address,
        )
      }
    }),
    paginateQuery(client, queryForRewardsReceivers, async (response) => {
      for (const transaction of response.data.logs) {
        consumersThatHaveReceivedRewards.add(
          transaction.topics[1]?.toLowerCase() as Address,
        )
      }
    }),
    paginateQuery(
      client,
      queryForRegisteredDivviIntegrationAgreement,
      async (response) => {
        for (const transaction of response.data.logs) {
          consumersWithDivviIntegrationAgreement.add(
            transaction.topics[2]?.toLowerCase() as Address,
          )
        }
      },
    ),
    getAllowlist(),
  ])

  const deduplicatedConsumersThatHaveIntegrated = removeDuplicates(
    consumersThatHaveIntegrated,
  )

  console.log(
    `Found ${deduplicatedConsumersThatHaveIntegrated.length} consumers that have integrated`,
  )
  console.log(
    `Found ${consumersThatHaveReceivedRewards.size} consumers that have received rewards`,
  )
  console.log(
    `Found ${consumersWithDivviIntegrationAgreement.size} consumers with Divvi integration agreement`,
  )
  console.log(
    `Found ${allowlistedConsumers.size} consumers that are allowlisted`,
  )

  const consumerToReceiveRewards =
    deduplicatedConsumersThatHaveIntegrated.filter(
      (consumer: Address) =>
        !consumersThatHaveReceivedRewards.has(consumer) &&
        consumersWithDivviIntegrationAgreement.has(consumer) &&
        allowlistedConsumers.has(consumer),
    )

  return consumerToReceiveRewards
}

async function main() {
  const args = await getArgs()

  const integratorAddresses = await getDivviIntegrators({
    rewardPoolContractAddress: args.rewardPoolContractAddress,
    startTimestamp: args.startTimestamp,
    endTimestamp: args.endTimestamp,
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
