import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { keccak256, pad, toBytes } from 'viem'
import { rewardPoolWithKpiAbi } from '../../abis/RewardPoolWithKpi'

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

const IDEMPOTENT_ADD_REWARDS_WITH_CLAIM_DELEGATES_ABI = {
  inputs: [
    {
      components: [
        { internalType: 'address', name: 'referrer', type: 'address' },
        { internalType: 'address', name: 'claimDelegate', type: 'address' },
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

export const createAddRewardSafeTransactionJSON = async ({
  filePath,
  rewardPoolAddress,
  rewards,
  startTimestamp,
  endTimestampExclusive,
  claimDelegates,
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
  claimDelegates?: Record<string, string> // Mapping from referrerId to claimDelegate address
  useIdempotency?: boolean // Use new addRewards(RewardData[]) format with idempotency keys
}) => {
  const users: string[] = []
  const amounts: string[] = []
  const rewardDataItems: string[] = []

  // Determine if we should use claim delegates based on whether the mapping is provided
  const useClaimDelegates = claimDelegates !== undefined

  for (const reward of rewards) {
    if (BigInt(reward.rewardAmount) > 0n) {
      if (useIdempotency) {
        // Generate idempotency key from referrer and reward period
        const idempotencyKey = keccak256(
          toBytes(
            `${reward.referrerId}-${startTimestamp.toISOString()}-${endTimestampExclusive.toISOString()}`,
          ),
        )
        if (useClaimDelegates && claimDelegates) {
          const claimDelegate =
            claimDelegates[reward.referrerId] || reward.referrerId
          rewardDataItems.push(
            `"${reward.referrerId}", "${claimDelegate}", "${reward.rewardAmount}", "${idempotencyKey}"`,
          )
        } else {
          rewardDataItems.push(
            `"${reward.referrerId}", "${reward.rewardAmount}", "${idempotencyKey}"`,
          )
        }
      } else {
        users.push(reward.referrerId)
        amounts.push(reward.rewardAmount)
      }
    }
  }

  const contractMethod = useIdempotency
    ? useClaimDelegates
      ? IDEMPOTENT_ADD_REWARDS_WITH_CLAIM_DELEGATES_ABI
      : IDEMPOTENT_ADD_REWARDS_ABI
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

export const createUpdateKpiAndProcessRewardsSafeTransactionJSON = ({
  filePath,
  rewardPoolAddress,
  kpis,
  kpiFunctionId,
  rewardAmount,
  startTimestamp,
  endTimestampExclusive,
}: {
  filePath: string
  rewardPoolAddress: string
  kpis: {
    referrer: string
    kpi: bigint
  }[]
  kpiFunctionId: string
  rewardAmount: bigint
  startTimestamp: Date
  endTimestampExclusive: Date
}) => {
  const periodStart = BigInt(startTimestamp.getTime() / 1000).toString()
  const periodEndExclusive = BigInt(
    endTimestampExclusive.getTime() / 1000,
  ).toString()
  const updatePeriodKpisMethod = rewardPoolWithKpiAbi.find(
    (item) => item.type === 'function' && item.name === 'updatePeriodKpis',
  )
  const processPeriodMethod = rewardPoolWithKpiAbi.find(
    (item) => item.type === 'function' && item.name === 'processPeriod',
  )

  const updatePeriodKpisMethodInputs = {
    kpis: `[${kpis.map((kpi) => `["${kpi.referrer}", "${kpi.kpi}"]`).join(', ')}]`,
    periodStart,
    periodEndExclusive,
    kpiFunctionId: pad(kpiFunctionId as `0x${string}`, { size: 32 }),
  }

  const processPeriodMethodInputs = {
    periodStart,
    periodEndExclusive,
    totalRewardAmount: rewardAmount.toString(),
  }

  const transactionsBatch = {
    meta: {},
    transactions: [
      {
        to: rewardPoolAddress,
        value: '0',
        data: null,
        contractMethod: updatePeriodKpisMethod,
        contractInputsValues: updatePeriodKpisMethodInputs,
      },
      {
        to: rewardPoolAddress,
        value: '0',
        data: null,
        contractMethod: processPeriodMethod,
        contractInputsValues: processPeriodMethodInputs,
      },
    ],
  }

  // Create directory if it doesn't exist
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(transactionsBatch, null, 2) + '\n', {
    encoding: 'utf-8',
  })
}
