// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RewardLibrary} from '../../libraries/RewardLibrary.sol';

contract RewardLibraryTest {
  function testCalculateLinearReward(
    RewardLibrary.Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (RewardLibrary.Reward[] memory) {
    return RewardLibrary.calculateLinearReward(kpis, totalRewardAmount);
  }

  function testCalculateSqrtReward(
    RewardLibrary.Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (RewardLibrary.Reward[] memory) {
    return RewardLibrary.calculateSqrtReward(kpis, totalRewardAmount);
  }

  function testSqrt(uint256 x) external pure returns (uint256) {
    return RewardLibrary._sqrt(x);
  }
}
