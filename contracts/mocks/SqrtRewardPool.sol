// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SqrtReward} from '../../libraries/SqrtReward.sol';

contract SqrtRewardPool {
  function testCalculateReward(
    SqrtReward.Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (SqrtReward.Reward[] memory) {
    return SqrtReward.calculateReward(kpis, totalRewardAmount);
  }

  function testSqrt(uint256 x) external pure returns (uint256) {
    return SqrtReward._sqrt(x);
  }
}
