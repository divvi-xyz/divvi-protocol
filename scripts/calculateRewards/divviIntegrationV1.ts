import yargs from 'yargs'
import {
  Address,
  encodeEventTopics,
  pad,
  sliceHex,
  parseUnits,
  http,
  Hex,
  createPublicClient,
  createWalletClient,
} from 'viem'
import { LogField } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../utils/hypersyncPagination'
import { getHyperSyncClient } from '../utils'
import { NetworkId } from '../types'
import { divviRegistryAbi } from '../../abis/DivviRegistry'
import { rewardPoolAbi } from '../../abis/RewardPool'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import axios from 'axios'

const DIVVI_REGISTRY_CONTRACT_ADDRESS =
  '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'
const DIVVI_INTEGRATION_REWARDS_ENTITY =
  '0xf4cfa55b561b089cca3114f0d8ad1ae0d8b2c0ee'

// This is when we registered the rewards entity:
//   https://optimistic.etherscan.io/tx/0x831e09593105967387657dcfa3528d33a7c3242036ce1bd33358e26a149b9c8b
const APPROXIMATE_DIVVI_REWARD_POOL_DEPLOY_BLOCK = 137599785
const DIVVI_REWARD_POOL_ADDRESS = '0xf4fB5Ff2baf6B33dbd92659a88c6EE927B2C88A0'

// TODO(sbw): hardcoded for 10 EURC for now. We should look at the RewardPool,
// look at the reward token, and get the correct decimals.
const DIVVI_REWARD_AMOUNT = parseUnits('10', 6)

const IDEMPOTENT_REWARD_POOL_ABI = [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'user',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'idempotencyKey',
            type: 'bytes32',
          },
        ],
        internalType: 'struct IdempotentRewardPool.RewardData[]',
        name: 'rewards',
        type: 'tuple[]',
      },
      {
        internalType: 'uint256[]',
        name: 'rewardFunctionArgs',
        type: 'uint256[]',
      },
    ],
    name: 'addRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const ALLOWLIST_URL =
  'https://raw.githubusercontent.com/divvi-xyz/integration-list/main/src/integration-list.json'

interface AllowlistedConsumer {
  entityAddress: Address
  githubUsername: string
}

export interface DivviRewardsConfig {
  dryRun: boolean
  privateKey: Hex
  useAllowList: boolean
}

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('dry-run', {
      description: 'Simulate the transaction to add rewards',
      type: 'boolean',
      default: true,
    })
    .option('private-key', {
      description: 'private key to use for the transaction',
      type: 'string',
      demandOption: true,
    })
    .option('use-allow-list', {
      description: 'Use the allow list to filter consumers',
      type: 'boolean',
      default: false,
    }).argv

  return {
    dryRun: argv['dry-run'],
    privateKey: argv['private-key'] as Hex,
    useAllowList: argv['use-allow-list'],
  }
}

async function getAllowListedConsumers() {
  const response = await axios.get(ALLOWLIST_URL)
  const data = response.data
  return new Set(
    data.map((consumer: AllowlistedConsumer) => consumer.entityAddress),
  )
}

async function getReferralConsumers() {
  const referralConsumers = new Set<Address>()
  const client = getHyperSyncClient(NetworkId['op-mainnet'])

  const REFERRAL_REGISTERED_TOPIC = encodeEventTopics({
    abi: divviRegistryAbi,
    eventName: 'ReferralRegistered',
  })[0]

  const queryForIntegrators = {
    fromBlock: APPROXIMATE_DIVVI_REWARD_POOL_DEPLOY_BLOCK,
    logs: [
      {
        address: [DIVVI_REGISTRY_CONTRACT_ADDRESS],
        topics: [
          [REFERRAL_REGISTERED_TOPIC],
          [],
          [pad(DIVVI_INTEGRATION_REWARDS_ENTITY)],
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2, LogField.Topic3],
    },
  }

  await paginateQuery(client, queryForIntegrators, async (response) => {
    for (const transaction of response.data.logs) {
      const address = sliceHex(
        transaction.topics[3]?.toLowerCase() as Address,
        -20,
      )
      referralConsumers.add(address)
    }
  })

  return referralConsumers
}

async function getReferralConsumersThatReceivedRewards() {
  const referralConsumersRewards = new Set<Address>()

  const client = getHyperSyncClient(NetworkId['op-mainnet'])

  // TODO(sbw): should probably update this to use the new RewardPool ABI.
  const ADD_REWARD_TOPIC = encodeEventTopics({
    abi: rewardPoolAbi,
    eventName: 'AddReward',
  })[0]

  const queryForRewardsReceivers = {
    fromBlock: APPROXIMATE_DIVVI_REWARD_POOL_DEPLOY_BLOCK,
    logs: [
      { address: [DIVVI_REWARD_POOL_ADDRESS], topics: [[ADD_REWARD_TOPIC]] },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1],
    },
  }

  await paginateQuery(client, queryForRewardsReceivers, async (response) => {
    for (const transaction of response.data.logs) {
      const address = sliceHex(
        transaction.topics[1]?.toLowerCase() as Address,
        -20,
      )
      referralConsumersRewards.add(address)
    }
  })

  return referralConsumersRewards
}

export async function runDivviRewards(config: DivviRewardsConfig) {
  const allowListedConsumers = config.useAllowList
    ? await getAllowListedConsumers()
    : new Set<Address>()
  console.log('allowListedConsumers', allowListedConsumers)

  const referralConsumers = await getReferralConsumers()
  console.log('referralConsumers', referralConsumers)

  const referralConsumersThatReceivedRewards =
    await getReferralConsumersThatReceivedRewards()
  console.log(
    'referralConsumersThatReceivedRewards',
    referralConsumersThatReceivedRewards,
  )

  const referralConsumersThatNeedRewards = [...referralConsumers].filter(
    (consumer) => {
      if (config.useAllowList && !allowListedConsumers.has(consumer)) {
        return false
      }
      return !referralConsumersThatReceivedRewards.has(consumer)
    },
  )
  console.log(
    'referralConsumersThatNeedRewards',
    referralConsumersThatNeedRewards,
  )

  const privateKey = config.privateKey
  const account = privateKeyToAccount(privateKey)
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  })

  if (!config.dryRun) {
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    })
    const txHash = await walletClient.writeContract({
      address: DIVVI_REWARD_POOL_ADDRESS,
      abi: IDEMPOTENT_REWARD_POOL_ABI,
      functionName: 'addRewards',
      args: [
        referralConsumersThatNeedRewards.map((consumer) => ({
          user: consumer,
          amount: DIVVI_REWARD_AMOUNT,
          idempotencyKey: pad(consumer, { size: 32 }),
        })),
        [],
      ],
    })
    console.log('writeContract successful', txHash)
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log('transaction confirmed')
  } else {
    await publicClient.simulateContract({
      address: DIVVI_REWARD_POOL_ADDRESS,
      account,
      abi: IDEMPOTENT_REWARD_POOL_ABI,
      functionName: 'addRewards',
      args: [
        referralConsumersThatNeedRewards.map((consumer) => ({
          user: consumer,
          amount: DIVVI_REWARD_AMOUNT,
          idempotencyKey: pad(consumer, { size: 32 }),
        })),
        [],
      ],
    })
    console.log('simulateContract successful')
  }
}

async function main() {
  const args = await getArgs()
  await runDivviRewards(args)
}

// Only run main() if this is being executed as a CLI script (not imported)
if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
