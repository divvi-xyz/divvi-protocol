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

const DIVVI_REGISTRY_CONTRACT_ADDRESS =
  '0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277'
const DIVVI_INTEGRATION_REWARDS_ENTITY =
  '0xf4cfa55b561b089cca3114f0d8ad1ae0d8b2c0ee'

// RewardPool was deployed on base:
//  https://basescan.org/tx/0xd295cdc3a680cf197c478d7cc49c0fb375f6019c0befe685040fa0a4a1be6a50
// but this is the earliest block number on Optimism that we'd expect ReferralRegistered
// events to be emitted.
const APPROXIMATE_DIVVI_REWARD_POOL_DEPLOY_BLOCK = 137569508
const DIVVI_REWARD_POOL_ADDRESS = '0xEd5527Cac28C4CEe3dab472b1f9F80D30Cf0D277'

// TODO(sbw): hardcoded for 10 EURC for now. We should look at the RewardPool,
// look at the reward token, and get the correct decimals.
const DIVVI_REWARD_AMOUNT = parseUnits('10', 6)

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('write', {
      description: 'Submit a transaction to add rewards',
      type: 'boolean',
      default: false,
    })
    .option('private-key', {
      description: 'private key to use for the transaction',
      type: 'string',
      demandOption: true,
    }).argv

  return {
    write: argv['write'],
    privateKey: argv['private-key'] as Hex,
  }
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
async function main() {
  const args = await getArgs()

  const referralConsumers = await getReferralConsumers()
  console.log('referralConsumers', referralConsumers)

  const referralConsumersThatReceivedRewards =
    await getReferralConsumersThatReceivedRewards()
  console.log(
    'referralConsumersThatReceivedRewards',
    referralConsumersThatReceivedRewards,
  )

  const referralConsumersThatNeedRewards = [...referralConsumers].filter(
    (consumer) => !referralConsumersThatReceivedRewards.has(consumer),
  )
  console.log(
    'referralConsumersThatNeedRewards',
    referralConsumersThatNeedRewards,
  )

  const rewardAmounts = new Array(referralConsumersThatNeedRewards.length).fill(
    DIVVI_REWARD_AMOUNT,
  )

  const privateKey = args.privateKey
  const account = privateKeyToAccount(privateKey)

  if (args.write) {
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    })
    const txHash = await walletClient.writeContract({
      address: DIVVI_REWARD_POOL_ADDRESS,
      abi: rewardPoolAbi,
      functionName: 'addRewards',
      args: [referralConsumersThatNeedRewards, rewardAmounts, [0n]],
    })
    console.log('writeContract successful', txHash)
  } else {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    })
    await publicClient.simulateContract({
      address: DIVVI_REWARD_POOL_ADDRESS,
      account,
      abi: rewardPoolAbi,
      functionName: 'addRewards',
      args: [referralConsumersThatNeedRewards, rewardAmounts, [0n]],
    })
    console.log('simulateContract successful')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
