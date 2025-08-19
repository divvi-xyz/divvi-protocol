// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRewardFunction} from '../../libraries/IRewardFunction.sol';

contract TestRewardPool {
  IRewardFunction public rewardFunction;

  constructor(address _rewardFunction) {
    rewardFunction = IRewardFunction(_rewardFunction);
  }

  function testCalculateReward(
    IRewardFunction.Kpi[] calldata kpis,
    uint256 totalRewardAmount
  ) external pure returns (IRewardFunction.Reward[] memory) {
    return rewardFunction.calculateReward(kpis, totalRewardAmount);
  }
}
