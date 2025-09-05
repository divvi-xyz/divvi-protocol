export const rewardFunctionAbi = [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'kpi',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'referrer',
            type: 'address',
          },
        ],
        internalType: 'struct IRewardFunction.Kpi[]',
        name: 'kpis',
        type: 'tuple[]',
      },
      {
        internalType: 'uint256',
        name: 'totalRewardAmount',
        type: 'uint256',
      },
    ],
    name: 'calculateReward',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'reward',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'referrer',
            type: 'address',
          },
        ],
        internalType: 'struct IRewardFunction.Reward[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const
