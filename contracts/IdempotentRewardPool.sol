// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RewardPool} from './RewardPool.sol';
import {ERC2771Context} from '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import {Context} from '@openzeppelin/contracts/utils/Context.sol';

/**
 * @title IdempotentRewardPool
 * @dev RewardPool variant that uses idempotency keys to prevent duplicate reward processing
 * @custom:security-contact security@valora.xyz
 */
contract IdempotentRewardPool is RewardPool, ERC2771Context {
  // Data structures
  struct RewardData {
    address user;
    uint256 amount;
    bytes32 idempotencyKey;
  }

  // State variables
  mapping(bytes32 => bool) public processedIdempotencyKeys;

  // Events
  event AddRewardWithIdempotency(
    address indexed user,
    uint256 amount,
    bytes32 indexed idempotencyKey,
    uint256[] rewardFunctionArgs
  );
  event AddRewardSkipped(
    address indexed user,
    uint256 amount,
    bytes32 indexed idempotencyKey
  );

  // Role constants
  /**
   * @notice Role identifier for trusted forwarders compliant with ERC-2771.
   * @dev Addresses granted this role are recognized by `isTrustedForwarder` and can relay meta-transactions,
   * affecting the result of `_msgSender()`. Crucially, this role should ONLY be granted to audited,
   * immutable forwarder contracts to prevent security risks like context manipulation or unauthorized actions.
   */
  bytes32 public constant TRUSTED_FORWARDER_ROLE =
    keccak256('TRUSTED_FORWARDER_ROLE');

  // Errors
  error EmptyIdempotencyKey(uint256 index);

  /**
   * @dev Constructor for direct deployment with ERC2771 support
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionId Bytes32 identifier of the reward function (e.g. git commit hash)
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   */
  constructor(
    address _poolToken,
    bytes32 _rewardFunctionId,
    address _owner,
    address _manager,
    uint256 _timelock
  )
    RewardPool(_poolToken, _rewardFunctionId, _owner, _manager, _timelock)
    ERC2771Context(address(0))
  {}

  /**
   * @dev Adds rewards for users, filtering out items with already processed idempotency keys
   * @param rewards Array of reward items to process
   * @param rewardFunctionArgs Arguments used to calculate rewards
   * @notice Only callable by DEFAULT_ADMIN_ROLE, can be relayed via ERC2771
   */
  function addRewards(
    RewardData[] calldata rewards,
    uint256[] calldata rewardFunctionArgs
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 eligibleCount = 0;
    uint256 skippedCount = 0;

    for (uint256 i = 0; i < rewards.length; i++) {
      RewardData calldata reward = rewards[i];

      if (reward.user == address(0)) revert ZeroAddressNotAllowed(i);
      if (reward.amount == 0) revert RewardAmountMustBeGreaterThanZero(i);
      if (reward.idempotencyKey == bytes32(0)) revert EmptyIdempotencyKey(i);

      if (!processedIdempotencyKeys[reward.idempotencyKey]) {
        eligibleCount++;

        processedIdempotencyKeys[reward.idempotencyKey] = true;

        // Update pending rewards and total
        pendingRewards[reward.user] += reward.amount;
        totalPendingRewards += reward.amount;

        emit AddReward(reward.user, reward.amount, rewardFunctionArgs);
        emit AddRewardWithIdempotency(
          reward.user,
          reward.amount,
          reward.idempotencyKey,
          rewardFunctionArgs
        );
      } else {
        skippedCount++;
        emit AddRewardSkipped(
          reward.user,
          reward.amount,
          reward.idempotencyKey
        );
      }
    }
  }

  // Additional errors
  error UseNewAddRewardsSignature();

  /**
   * @dev Original addRewards function - reverts to prevent misuse
   * @notice Use addRewards(RewardData[], uint256[]) instead to ensure proper idempotency protection
   */
  function addRewards(
    address[] calldata,
    uint256[] calldata,
    uint256[] calldata
  ) public view override onlyRole(DEFAULT_ADMIN_ROLE) {
    revert UseNewAddRewardsSignature();
  }

  /**
   * @dev Helper function to generate idempotency key from common parameters
   * @param user User address
   * @param campaignId Campaign identifier
   * @param period Time period identifier
   * @param nonce Additional nonce for uniqueness
   * @return bytes32 The generated idempotency key
   */
  function generateIdempotencyKey(
    address user,
    bytes32 campaignId,
    bytes32 period,
    uint256 nonce
  ) external pure returns (bytes32) {
    return keccak256(abi.encodePacked(user, campaignId, period, nonce));
  }

  /**
   * @dev Check if an idempotency key has been processed
   * @param idempotencyKey The key to check
   * @return bool indicating if the key has been processed
   */
  function isIdempotencyKeyProcessed(
    bytes32 idempotencyKey
  ) external view returns (bool) {
    return processedIdempotencyKeys[idempotencyKey];
  }

  // ERC2771Context overrides

  /**
   * @notice Check if a forwarder is trusted
   * @param forwarder The address of the forwarder to check
   * @return isTrusted Whether the forwarder is trusted
   * @dev Overridden to use the TRUSTED_FORWARDER_ROLE for checking trusted forwarders.
   */
  function isTrustedForwarder(
    address forwarder
  ) public view override returns (bool) {
    return hasRole(TRUSTED_FORWARDER_ROLE, forwarder);
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _msgSender()
    internal
    view
    override(Context, ERC2771Context)
    returns (address)
  {
    return super._msgSender();
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _msgData()
    internal
    view
    override(Context, ERC2771Context)
    returns (bytes calldata)
  {
    return super._msgData();
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _contextSuffixLength()
    internal
    view
    override(Context, ERC2771Context)
    returns (uint256)
  {
    return super._contextSuffixLength();
  }
}
