import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { Address, encodeEventTopics } from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from './utils/hypersyncPagination'
import { getHyperSyncClient } from './utils'
import { NetworkId } from './types'
import { divviRegistryAbi } from '../abis/DivviRegistry'
import { rewardPoolAbi } from '../abis/RewardPool'
import { fetchWithTimeout } from './utils/fetchWithTimeout'

const DIVVI_REGISTRY_CONTRACT_ADDRESS =
  '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'
const DIVVI_INTEGRATION_REWARDS_ENTITY =
  '0x6226ddE08402642964f9A6de844ea3116F0dFc7e'

const ALLOWLIST_URL =
  'https://raw.githubusercontent.com/divvi-xyz/integration-list/main/src/integration-list.json'
type AllowlistedUser = {
  entityAddress: string
  githubUsername: string
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
    }).argv

  return {
    output: argv['output-file'] ?? 'divvi-integrator-rewards.csv',
    rewardPoolContractAddress: argv['reward-pool'],
    rewardAmount: argv['reward-amount'],
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
    const allowlistedUserObjects =
      (await fetchAllowlistResponse.json()) as AllowlistedUser[]
    const allowlistedUsers = new Set(
      allowlistedUserObjects.map(({ entityAddress }) =>
        entityAddress.toLowerCase(),
      ),
    )
    return allowlistedUsers
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
}: {
  rewardPoolContractAddress: string
}): Promise<Address[]> {
  const usersThatHaveIntegrated: Address[] = []
  const usersThatHaveReceivedRewards = new Set<Address>()
  const usersThatHaveRegisteredAgreements = new Set<Address>()

  const REFERRAL_REGISTERED_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'ReferralRegistered',
  })[0]

  const queryForIntegrators = {
    logs: [
      {
        address: [DIVVI_REGISTRY_CONTRACT_ADDRESS],
        topics: [[REFERRAL_REGISTERED_TOPIC]],
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

  const REWARDS_AGREEMENT_REGISTERES_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'RewardsAgreementRegistered',
  })[0]

  const queryForRegisteredAgreements = {
    logs: [
      {
        address: [DIVVI_REGISTRY_CONTRACT_ADDRESS],
        topics: [
          [REWARDS_AGREEMENT_REGISTERES_TOPIC],
          [DIVVI_INTEGRATION_REWARDS_ENTITY],
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2],
    },
    fromBlock: 0,
  }

  const client = getHyperSyncClient(NetworkId['op-mainnet'])

  const [_void1, _void2, _void3, allowlistedUsers] = await Promise.all([
    paginateQuery(client, queryForIntegrators, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveIntegrated.push(
          transaction.topics[3]?.toLowerCase() as Address,
        )
      }
    }),
    paginateQuery(client, queryForRewardsReceivers, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveReceivedRewards.add(
          transaction.topics[1]?.toLowerCase() as Address,
        )
      }
    }),
    paginateQuery(client, queryForRegisteredAgreements, async (response) => {
      for (const transaction of response.data.logs) {
        usersThatHaveRegisteredAgreements.add(
          transaction.topics[2]?.toLowerCase() as Address,
        )
      }
    }),
    getAllowlist(),
  ])

  const deduplicatedUsersThatHaveIntegrated = removeDuplicates(
    usersThatHaveIntegrated,
  )

  const userToReceiveRewards = deduplicatedUsersThatHaveIntegrated.filter(
    (user: Address) =>
      !usersThatHaveReceivedRewards.has(user) &&
      usersThatHaveRegisteredAgreements.has(user) &&
      allowlistedUsers.has(user),
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
