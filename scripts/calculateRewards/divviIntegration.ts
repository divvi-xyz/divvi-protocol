import { mkdirSync } from 'fs'
import yargs from 'yargs'
import {
  Address,
  encodeEventTopics,
  pad,
  sliceHex,
  isAddress,
  parseUnits,
} from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getHyperSyncClient } from '../utils'
import { NetworkId } from '../types'
import { divviRegistryAbi } from '../../abis/DivviRegistry'
import { rewardPoolAbi } from '../../abis/RewardPool'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { getBlockRange } from '../calculateRevenue/protocols/utils/events'
import { createAddRewardSafeTransactionJSON } from '../utils/createSafeTransactionsBatch'
import { toPeriodFolderName } from '../utils/dateFormatting'
import { dirname, join } from 'path'

const DIVVI_REGISTRY_CONTRACT_ADDRESS =
  '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'
const DIVVI_INTEGRATION_REWARDS_ENTITY =
  '0x6226ddE08402642964f9A6de844ea3116F0dFc7e'

// TODO(sbw): hardcoded for now, but if we launch more campaings we can address TODOs
// to take this as a CLI argument.
const DIVVI_REWARD_POOL_ADDRESS = '0x326161d68c05bE55367a0041b9C8f68082C04863'
// TODO(sbw): hardcoded for 200 USDT for now. We should look at the RewardPool,
// look at the reward token, and get the correct decimals.
const DIVVI_REWARD_AMOUNT = parseUnits('200', 6)

const ALLOWLIST_URL =
  'https://raw.githubusercontent.com/divvi-xyz/integration-list/main/src/integration-list.json'
type AllowlistedConsumer = {
  entityAddress: Address
  githubConsumername: string
}

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('datadir', {
      description: 'data directory',
      type: 'string',
      default: 'rewards',
    })
    .option('start-timestamp', {
      alias: 's',
      description:
        'inclusive timestamp at which to start checking for integrators (new Date() compatible)',
      type: 'string',
      demandOption: true,
    })
    .option('end-timestamp', {
      alias: 'e',
      description:
        'exclusive timestamp at which to stop checking for integrators (new Date() compatible)',
      type: 'string',
      demandOption: true,
    }).argv

  return {
    datadir: argv['datadir'],
    startTimestamp: new Date(argv['start-timestamp']),
    endTimestampExclusive: new Date(argv['end-timestamp']),
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
  endTimestampExclusive,
}: {
  rewardPoolContractAddress: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<Address[]> {
  const consumersThatHaveIntegrated: Address[] = []
  const consumersThatHaveReceivedRewards = new Set<Address>()
  const consumersWithDivviIntegrationAgreement = new Set<Address>()

  const REFERRAL_REGISTERED_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'ReferralRegistered',
  })[0]

  const { startBlock, endBlockExclusive } = await getBlockRange({
    networkId: NetworkId['op-mainnet'],
    startTimestamp,
    endTimestampExclusive,
  })

  const queryForIntegrators = {
    fromBlock: startBlock,
    toBlock: endBlockExclusive,
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

  return consumerToReceiveRewards.map((address) => {
    const stripped = sliceHex(address, -20)
    if (isAddress(stripped)) {
      return stripped
    }
    throw new Error(`Unexpected address value: ${stripped}`)
  })
}

async function main() {
  const args = await getArgs()

  const integratorAddresses: Address[] = await getDivviIntegrators({
    rewardPoolContractAddress: DIVVI_REWARD_POOL_ADDRESS,
    startTimestamp: args.startTimestamp,
    endTimestampExclusive: args.endTimestampExclusive,
  })

  const datadirPath = join(
    args.datadir,
    'divvi-integrators',
    toPeriodFolderName({
      startTimestamp: args.startTimestamp,
      endTimestampExclusive: args.endTimestampExclusive,
    }),
  )
  const outputPath = join(datadirPath, 'safe-transactions.json')
  mkdirSync(dirname(outputPath), { recursive: true })

  console.log(`Results:`, integratorAddresses)
  createAddRewardSafeTransactionJSON({
    filePath: outputPath,
    rewardPoolAddress: DIVVI_REWARD_POOL_ADDRESS,
    rewards: integratorAddresses.map((address) => ({
      referrerId: address,
      rewardAmount: DIVVI_REWARD_AMOUNT.toString(),
    })),
    startTimestamp: args.startTimestamp,
    endTimestampExclusive: args.endTimestampExclusive,
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
