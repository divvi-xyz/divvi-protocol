// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRewardFunction} from './IRewardFunction.sol';

contract SqrtReward is IRewardFunction {
  /**
   * @dev Calculate sqrt reward
   * @param kpis The KPIs to calculate the reward for
   * @param totalRewardAmount The total reward amount to be distributed
   * @return rewards The rewards for each referrer calculated using the square root function
   */
  function calculateReward(
    Kpi[] calldata kpis,
    uint256 totalRewardAmount
  ) external pure override returns (Reward[] memory rewards) {
    rewards = new Reward[](kpis.length);
    uint256 totalSqrtKpi = 0;
    for (uint256 i = 0; i < kpis.length; i++) {
      totalSqrtKpi += _sqrt(kpis[i].kpi);
    }
    if (totalSqrtKpi == 0) {
      return rewards;
    }
    for (uint256 i = 0; i < kpis.length; i++) {
      rewards[i] = Reward({
        reward: (totalRewardAmount * _sqrt(kpis[i].kpi)) / totalSqrtKpi,
        referrerAddress: kpis[i].referrerAddress
      });
    }
  }

  /**
   * @dev Calculate the square root of a number
   * @param x The number to calculate the square root of
   * @return y The square root of the number
   */
  function _sqrt(uint256 x) internal pure returns (uint256 y) {
    uint256 z = (x + 1) / 2;
    y = x;
    while (z < y) {
      y = z;
      z = (x / z + z) / 2;
    }
  }
}
