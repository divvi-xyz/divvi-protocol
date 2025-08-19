// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library LinearReward {
  struct Kpi {
    uint256 kpi;
    address referrerAddress;
  }

  struct Reward {
    uint256 reward;
    address referrerAddress;
  }

  /**
   * @dev Calculate linear reward
   * @param kpis The KPIs to calculate the reward for
   * @param totalRewardAmount The total reward amount to be distributed
   * @return rewards The rewards for each referrer calculated using the linear function
   */
  function calculateReward(
    Kpi[] memory kpis,
    uint256 totalRewardAmount
  ) external pure returns (Reward[] memory rewards) {
    rewards = new Reward[](kpis.length);
    uint256 totalKpi = 0;
    for (uint256 i = 0; i < kpis.length; i++) {
      totalKpi += kpis[i].kpi;
    }
    for (uint256 i = 0; i < kpis.length; i++) {
      rewards[i] = Reward({
        reward: (totalRewardAmount * kpis[i].kpi) / totalKpi,
        referrerAddress: kpis[i].referrerAddress
      });
    }
    return rewards;
  }
}
