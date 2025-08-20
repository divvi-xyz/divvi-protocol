// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRewardFunction} from './IRewardFunction.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';

contract LinearReward is IRewardFunction {
  /**
   * @dev Calculate linear reward
   * @param kpis The KPIs to calculate the reward for
   * @param totalRewardAmount The total reward amount to be distributed
   * @return rewards The rewards for each referrer calculated using the linear function
   */
  function calculateReward(
    Kpi[] calldata kpis,
    uint256 totalRewardAmount
  ) external pure override returns (Reward[] memory rewards) {
    rewards = new Reward[](kpis.length);
    uint256 totalKpi = 0;
    for (uint256 i = 0; i < kpis.length; i++) {
      totalKpi += kpis[i].kpi;
    }
    if (totalKpi == 0) {
      return rewards;
    }
    for (uint256 i = 0; i < kpis.length; i++) {
      rewards[i] = Reward({
        reward: Math.mulDiv(totalRewardAmount, kpis[i].kpi, totalKpi),
        referrerAddress: kpis[i].referrerAddress,
        idempotencyKey: kpis[i].idempotencyKey
      });
    }
  }
}
