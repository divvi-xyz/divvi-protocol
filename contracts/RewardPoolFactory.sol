// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {Clones} from '@openzeppelin/contracts/proxy/Clones.sol';
import {RewardPool} from './RewardPool.sol';

/**
 * @title Divvi RewardPool Factory
 * @custom:security-contact security@valora.xyz
 */
contract RewardPoolFactory is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable
{
  using Clones for address;

  // Events
  event RewardPoolCreated(
    address indexed poolToken,
    bytes32 rewardFunctionId,
    address indexed owner,
    address indexed manager,
    uint256 timelock,
    address rewardPool
  );

  // Errors
  error ZeroAddressNotAllowed();
  error ImplementationNotSet();

  // State variables
  address public implementation;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Initializes the contract
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _changeDefaultAdminDelay The delay between admin change steps
   * @param _implementation Address of the RewardPool implementation contract
   */
  function initialize(
    address _owner,
    uint48 _changeDefaultAdminDelay,
    address _implementation
  ) public initializer {
    __AccessControlDefaultAdminRules_init(_changeDefaultAdminDelay, _owner);
    __UUPSUpgradeable_init();

    if (_implementation == address(0)) revert ZeroAddressNotAllowed();
    implementation = _implementation;
  }

  /**
   * @dev Creates a new RewardPool contract using minimal proxy pattern
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionId Bytes32 identifier of the reward function (e.g. git commit hash)
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE in the RewardPool
   * @param _manager Address that will have MANAGER_ROLE in the RewardPool
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @return The address of the newly created RewardPool contract
   */
  function createRewardPool(
    address _poolToken,
    bytes32 _rewardFunctionId,
    address _owner,
    address _manager,
    uint256 _timelock
  ) external returns (address) {
    if (_poolToken == address(0)) revert ZeroAddressNotAllowed();
    if (_owner == address(0)) revert ZeroAddressNotAllowed();
    if (_manager == address(0)) revert ZeroAddressNotAllowed();
    if (implementation == address(0)) revert ImplementationNotSet();

    address clone = implementation.clone();
    RewardPool(payable(clone)).initialize(
      _poolToken,
      _rewardFunctionId,
      _owner,
      _manager,
      _timelock
    );

    emit RewardPoolCreated(
      _poolToken,
      _rewardFunctionId,
      _owner,
      _manager,
      _timelock,
      clone
    );

    return clone;
  }

  /**
   * @dev Updates the implementation contract address
   * @param _implementation New implementation contract address
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setImplementation(
    address _implementation
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_implementation == address(0)) revert ZeroAddressNotAllowed();
    implementation = _implementation;
  }

  /**
   * @dev Function required to authorize contract upgrades
   * @param newImplementation Address of the new implementation contract
   * @notice Allowed only address with DEFAULT_ADMIN_ROLE
   */
  function _authorizeUpgrade(
    address newImplementation
  ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {} // solhint-disable-line no-empty-blocks
}
