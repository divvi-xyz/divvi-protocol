// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SqrtReward {
  struct Kpi {
    uint256 kpi;
    address referrerAddress;
  }

  struct Reward {
    uint256 reward;
    address referrerAddress;
  }

  /**
   * @dev Calculate sqrt reward
   * @param kpis The KPIs to calculate the reward for
   * @param totalRewardAmount The total reward amount to be distributed
   * @return rewards The rewards for each referrer calculated using the square root function
   */
  function calculateReward(
    Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (Reward[] memory rewards) {
    rewards = new Reward[](kpis.length);
    uint256 totalSqrtKpi = 0;
    for (uint256 i = 0; i < kpis.length; i++) {
      totalSqrtKpi += _sqrt(kpis[i].kpi);
    }
    for (uint256 i = 0; i < kpis.length; i++) {
      rewards[i] = Reward({
        reward: (totalRewardAmount * _sqrt(kpis[i].kpi)) / totalSqrtKpi,
        referrerAddress: kpis[i].referrerAddress
      });
    }
    return rewards;
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
