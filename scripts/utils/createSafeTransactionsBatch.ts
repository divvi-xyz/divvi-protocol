import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { keccak256, toBytes } from 'viem'

// ABI definitions for both versions of addRewards
const LEGACY_ADD_REWARDS_ABI = {
  inputs: [
    { internalType: 'address[]', name: 'users', type: 'address[]' },
    { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    {
      internalType: 'uint256[]',
      name: 'rewardFunctionArgs',
      type: 'uint256[]',
    },
  ],
  name: 'addRewards',
  payable: false,
} as const

const IDEMPOTENT_ADD_REWARDS_ABI = {
  inputs: [
    {
      components: [
        { internalType: 'address', name: 'user', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
        { internalType: 'bytes32', name: 'idempotencyKey', type: 'bytes32' },
      ],
      internalType: 'struct RewardPool.RewardData[]',
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
  payable: false,
} as const

export const createAddRewardSafeTransactionJSON = ({
  filePath,
  rewardPoolAddress,
  rewards,
  startTimestamp,
  endTimestampExclusive,
  useIdempotency = false,
}: {
  filePath: string
  rewardPoolAddress: string
  rewards: {
    referrerId: string
    rewardAmount: string // in smallest unit of reward token
  }[]
  startTimestamp: Date
  endTimestampExclusive: Date
  useIdempotency?: boolean // Use new addRewards(RewardData[]) format with idempotency keys
}) => {
  const users: string[] = []
  const amounts: string[] = []
  const rewardDataItems: string[] = []

  for (const reward of rewards) {
    if (BigInt(reward.rewardAmount) > 0n) {
      if (useIdempotency) {
        // Generate idempotency key from referrer and reward period
        const idempotencyKey = keccak256(
          toBytes(
            `${reward.referrerId}-${startTimestamp.toISOString()}-${endTimestampExclusive.toISOString()}`,
          ),
        )
        rewardDataItems.push(
          `"${reward.referrerId}", "${reward.rewardAmount}", "${idempotencyKey}"`,
        )
      } else {
        users.push(reward.referrerId)
        amounts.push(reward.rewardAmount)
      }
    }
  }

  const contractMethod = useIdempotency
    ? IDEMPOTENT_ADD_REWARDS_ABI
    : LEGACY_ADD_REWARDS_ABI

  // Convert timestamps to seconds for rewardFunctionArgs
  const rewardFunctionArgs = `[${BigInt(startTimestamp.getTime() / 1000)}, ${BigInt(
    endTimestampExclusive.getTime() / 1000,
  )}]`

  const contractInputsValues = useIdempotency
    ? {
        rewards: `[${rewardDataItems.map((item) => `[${item}]`).join(', ')}]`,
        rewardFunctionArgs,
      }
    : {
        users: `[${users.join(', ')}]`,
        amounts: `[${amounts.join(', ')}]`,
        rewardFunctionArgs,
      }

  const transactionsBatch = {
    // The Safe UI will throw a warning about some missing properties, but will
    // fill in the correct values...

    // ..but the meta property required by the Safe UI, even if the value is an
    // empty object.
    meta: {},
    transactions: [
      {
        to: rewardPoolAddress,
        value: '0',
        data: null,
        contractMethod,
        contractInputsValues,
      },
    ],
  }

  // Create directory if it doesn't exist
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(transactionsBatch, null, 2) + '\n', {
    encoding: 'utf-8',
  })
}
