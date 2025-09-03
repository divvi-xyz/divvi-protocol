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
    address rewardFunctionAddress,
    address indexed owner,
    address indexed manager,
    uint256 timelock,
    uint256 protocolFee,
    address reserveAddress,
    address rewardPool
  );
  event DefaultProtocolFeeUpdated(
    uint256 newProtocolFee,
    uint256 previousProtocolFee
  );
  event DefaultReserveAddressUpdated(
    address newReserveAddress,
    address previousReserveAddress
  );
  event DefaultOwnerUpdated(address newOwner, address previousOwner);

  // Errors
  error ZeroAddressNotAllowed();
  error ImplementationNotSet();
  error InvalidProtocolFee(uint256 fee);

  // State variables
  address public implementation;
  uint256 public defaultProtocolFee;
  address public defaultReserveAddress;
  address public defaultOwner;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Initializes the contract
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _changeDefaultAdminDelay The delay between admin change steps
   * @param _implementation Address of the RewardPool implementation contract
   * @param _defaultProtocolFee Default protocol fee numerator (denominator is 10^18)
   * @param _defaultReserveAddress Default address that will receive protocol fees
   * @param _defaultOwner Default address that will have DEFAULT_ADMIN_ROLE in created pools
   *
   * **Protocol Fee:** Uses 18-decimal fixed-point arithmetic (e.g., 0.05 * 1e18 for 5%)
   */
  function initialize(
    address _owner,
    uint48 _changeDefaultAdminDelay,
    address _implementation,
    uint256 _defaultProtocolFee,
    address _defaultReserveAddress,
    address _defaultOwner
  ) public initializer {
    __AccessControlDefaultAdminRules_init(_changeDefaultAdminDelay, _owner);
    __UUPSUpgradeable_init();

    if (_implementation == address(0)) revert ZeroAddressNotAllowed();
    if (_defaultReserveAddress == address(0)) revert ZeroAddressNotAllowed();
    if (_defaultOwner == address(0)) revert ZeroAddressNotAllowed();
    if (_defaultProtocolFee > 1e18)
      revert InvalidProtocolFee(_defaultProtocolFee);

    implementation = _implementation;
    defaultProtocolFee = _defaultProtocolFee;
    defaultReserveAddress = _defaultReserveAddress;
    defaultOwner = _defaultOwner;
  }

  /**
   * @dev Reinitializer for V2 upgrade - sets newly added state variables for protocol fee support
   * @param _defaultProtocolFee Default protocol fee numerator (denominator is 10^18)
   * @param _defaultReserveAddress Default address that will receive protocol fees
   *
   * **Protocol Fee:** Uses 18-decimal fixed-point arithmetic (e.g., 0.05 * 1e18 for 5%)
   *
   * This function is designed to be called once during the upgrade from V1 to V2.
   * It initializes the new state variables that were added for protocol fee support.
   * The defaultOwner is automatically set to the current factory owner (owner()).
   */
  function initializeV2(
    uint256 _defaultProtocolFee,
    address _defaultReserveAddress
  ) public reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_defaultReserveAddress == address(0)) revert ZeroAddressNotAllowed();
    if (_defaultProtocolFee > 1e18)
      revert InvalidProtocolFee(_defaultProtocolFee);

    defaultProtocolFee = _defaultProtocolFee;
    defaultReserveAddress = _defaultReserveAddress;
    defaultOwner = owner(); // Use current factory owner as default owner for pools
  }

  /**
   * @dev Creates a new RewardPool contract using minimal proxy pattern
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionAddress Address of the reward function
   * @param _manager Address that will have MANAGER_ROLE in the RewardPool
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @return The address of the newly created RewardPool contract
   */
  function createRewardPool(
    address _poolToken,
    address _rewardFunctionAddress,
    address _manager,
    uint256 _timelock
  ) external returns (address) {
    if (_poolToken == address(0)) revert ZeroAddressNotAllowed();
    if (_manager == address(0)) revert ZeroAddressNotAllowed();
    if (implementation == address(0)) revert ImplementationNotSet();

    address clone = implementation.clone();
    RewardPool(payable(clone)).initialize(
      _poolToken,
      _rewardFunctionAddress,
      defaultOwner,
      _manager,
      _timelock,
      defaultProtocolFee,
      defaultReserveAddress
    );

    emit RewardPoolCreated(
      _poolToken,
      _rewardFunctionAddress,
      defaultOwner,
      _manager,
      _timelock,
      defaultProtocolFee,
      defaultReserveAddress,
      clone
    );

    return clone;
  }

  /**
   * @dev Sets the default protocol fee for newly created pools
   * @param _defaultProtocolFee Default protocol fee numerator (denominator is 10^18)
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   *
   * Sets the default fee for newly created pools (existing pools unaffected).
   * **Usage:** `setDefaultProtocolFee(parseEther('0.05'))` for 5% fee
   * **Impact:** All pools created after this change inherit the new default fee
   * **Validation:** Must be ≤ 1e18 (100% maximum)
   */
  function setDefaultProtocolFee(
    uint256 _defaultProtocolFee
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_defaultProtocolFee > 1e18)
      revert InvalidProtocolFee(_defaultProtocolFee);

    uint256 previousProtocolFee = defaultProtocolFee;
    defaultProtocolFee = _defaultProtocolFee;
    emit DefaultProtocolFeeUpdated(_defaultProtocolFee, previousProtocolFee);
  }

  /**
   * @dev Sets the default reserve address
   * @param _defaultReserveAddress Default address that will receive protocol fees
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setDefaultReserveAddress(
    address _defaultReserveAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_defaultReserveAddress == address(0)) revert ZeroAddressNotAllowed();

    address previousReserveAddress = defaultReserveAddress;
    defaultReserveAddress = _defaultReserveAddress;
    emit DefaultReserveAddressUpdated(
      _defaultReserveAddress,
      previousReserveAddress
    );
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
   * @dev Sets the default owner
   * @param _defaultOwner New default owner address
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setDefaultOwner(
    address _defaultOwner
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_defaultOwner == address(0)) revert ZeroAddressNotAllowed();

    address previousOwner = defaultOwner;
    defaultOwner = _defaultOwner;
    emit DefaultOwnerUpdated(_defaultOwner, previousOwner);
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
