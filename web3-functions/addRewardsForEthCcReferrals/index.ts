import {
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  Hex,
  http,
  isAddressEqual,
} from 'viem'
import {
  Web3Function,
  Web3FunctionEventContext,
} from '@gelatonetwork/web3-functions-sdk'
import {
  CallWithERC2771Request,
  GelatoRelay,
} from '@gelatonetwork/relay-sdk-viem'
import { mnemonicToAccount } from 'viem/accounts'

const DIVVI_ETHCC2025_REWARDS_ENTITY =
  '0xf4cfa55b561b089cca3114f0d8ad1ae0d8b2c0ee'
// IdempotentRewardPool deployed on Base:
const DIVVI_ETHCC2025_REWARD_POOL_ADDRESS =
  '0x9428e44422c6Fc3d72c9CA78b3293d661EEa590b'

const DIVVI_REGISTRY_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: true,
        internalType: 'address',
        name: 'rewardsProvider',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'rewardsConsumer',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'chainId',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'txHash',
        type: 'bytes32',
      },
    ],
    name: 'ReferralRegistered',
    type: 'event',
  },
] as const

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

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  // Get event log from Web3FunctionEventContext
  const { log, secrets, multiChainProvider } = context

  const gelatoRelayerApiKey = await secrets.get('GELATO_RELAYER_API_KEY')
  if (!gelatoRelayerApiKey) {
    return {
      canExec: false,
      message: `GELATO_RELAYER_API_KEY not set in secrets`,
    }
  }
  const rewardPoolOwnerMnemonic = await secrets.get(
    'REWARD_POOL_OWNER_MNEMONIC',
  )
  if (!rewardPoolOwnerMnemonic) {
    return {
      canExec: false,
      message: `REWARD_POOL_OWNER_MNEMONIC not set in secrets`,
    }
  }

  // Parse event using viem's decodeEventLog
  const event = decodeEventLog({
    abi: DIVVI_REGISTRY_ABI,
    eventName: 'ReferralRegistered',
    topics: log.topics as [Hex, ...Hex[]],
    data: log.data as Hex,
  })

  // Handle event data
  const { user, rewardsProvider, rewardsConsumer, chainId, txHash } = event.args
  console.log(
    `ReferralRegistered: user=${user}, provider=${rewardsProvider}, consumer=${rewardsConsumer}, chainId=${chainId}, txHash=${txHash}`,
  )

  const relay = new GelatoRelay()

  const account = mnemonicToAccount(rewardPoolOwnerMnemonic as Hex)
  const client = createWalletClient({
    account,
    transport: http(multiChainProvider.default().connection.url),
  })
  console.log(account.address)

  if (!isAddressEqual(rewardsProvider, DIVVI_ETHCC2025_REWARDS_ENTITY)) {
    return {
      canExec: false,
      message: `Rewards provider ${rewardsProvider} is not the Divvy EthCC 2025 rewards entity`,
    }
  }

  // TODO limit to first X referrals

  const data = encodeFunctionData({
    abi: IDEMPOTENT_REWARD_POOL_ABI,
    functionName: 'addRewards',
    args: [
      [
        {
          user: rewardsConsumer,
          amount: 1n,
          // The referrer should only get the reward once, so we use the rewardsConsumer as the idempotency key
          idempotencyKey: rewardsConsumer,
        },
      ],
      [],
    ],
  })

  const relayRequest: CallWithERC2771Request = {
    user: account.address,
    chainId: BigInt(await client.getChainId()),
    target: DIVVI_ETHCC2025_REWARD_POOL_ADDRESS,
    data,
  }

  // TODO: handle failures
  const response = await relay.sponsoredCallERC2771(
    relayRequest,
    client as any,
    gelatoRelayerApiKey,
  )

  console.log('Relay response:', response)

  return {
    canExec: false,
    message: `Submitted addRewards for ${rewardsConsumer}, see https://relay.gelato.digital/tasks/status/${response.taskId}`,
  }
})
