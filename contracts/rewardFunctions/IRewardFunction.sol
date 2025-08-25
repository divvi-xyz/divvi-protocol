// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRewardFunction {
  struct Kpi {
    uint256 kpi;
    address referrerAddress;
  }

  struct Reward {
    uint256 reward;
    address referrerAddress;
  }

  function calculateReward(
    Kpi[] calldata kpis,
    uint256 totalRewardAmount
  ) external view returns (Reward[] memory);
}
