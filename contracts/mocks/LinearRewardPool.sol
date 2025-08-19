// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LinearReward} from '../../libraries/LinearReward.sol';

contract LinearRewardPool {
  function testCalculateReward(
    LinearReward.Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (LinearReward.Reward[] memory) {
    return LinearReward.calculateReward(kpis, totalRewardAmount);
  }
}
