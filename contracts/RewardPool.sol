// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {ReentrancyGuardUpgradeable} from '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title Divvi Reward Pool
 * @custom:security-contact security@valora.xyz
 */
contract RewardPool is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable,
  ReentrancyGuardUpgradeable
{
  using SafeERC20 for IERC20;

  // Constants
  address public constant NATIVE_TOKEN_ADDRESS =
    0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  bytes32 public constant MANAGER_ROLE = keccak256('MANAGER_ROLE');

  // Init variables
  address public poolToken;
  bool public isNativeToken;
  bytes32 public rewardFunctionId;

  // State variables
  uint256 public timelock;
  uint256 public totalPendingRewards;
  mapping(address => uint256) public pendingRewards;

  // Events
  event PoolInitialized(
    address indexed poolToken,
    bytes32 rewardFunctionId,
    uint256 timelock
  );
  event Deposit(uint256 amount);
  event Withdraw(uint256 amount);
  event TimelockExtended(uint256 newTimelock, uint256 previousTimelock);
  event AddReward(
    address indexed user,
    uint256 amount,
    uint256[] rewardFunctionArgs
  );
  event ClaimReward(address indexed user, uint256 amount);
  event RescueToken(address token, uint256 amount);

  // Errors
  error AmountMismatch(uint256 expected, uint256 received);
  error AmountMustBeGreaterThanZero();
  error ArraysLengthMismatch(uint256 usersLength, uint256 amountsLength);
  error CannotRescuePoolToken();
  error InsufficientPoolBalance(uint256 requested, uint256 available);
  error InsufficientRewardBalance(uint256 requested, uint256 available);
  error NativeTokenNotAccepted();
  error NativeTransferFailed();
  error TimelockMustBeInTheFuture(
    uint256 proposedTimelock,
    uint256 currentBlockNumber
  );
  error TimelockMustBeGreaterThanCurrent(
    uint256 proposedTimelock,
    uint256 currentTimelock
  );
  error TimelockNotExpired(
    uint256 currentBlockNumber,
    uint256 requiredBlokcNumber
  );
  error UseDepositFunction();
  error ZeroAddressNotAllowed(uint256 index);
  error RewardAmountMustBeGreaterThanZero(uint256 index);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Initializes the contract
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionId Bytes32 identifier of the reward function (e.g. git commit hash)
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _changeDefaultAdminDelay The delay between admin change steps
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   */
  function initialize(
    address _poolToken,
    bytes32 _rewardFunctionId,
    address _owner,
    uint48 _changeDefaultAdminDelay,
    address _manager,
    uint256 _timelock
  ) public initializer {
    __AccessControlDefaultAdminRules_init(_changeDefaultAdminDelay, _owner);
    __UUPSUpgradeable_init();
    __ReentrancyGuard_init();

    _grantRole(MANAGER_ROLE, _manager);

    poolToken = _poolToken;
    isNativeToken = (_poolToken == NATIVE_TOKEN_ADDRESS);
    rewardFunctionId = _rewardFunctionId;

    _setTimelock(_timelock);

    emit PoolInitialized(_poolToken, _rewardFunctionId, _timelock);
  }

  /**
   * @dev Returns the current token balance of the contract
   */
  function poolBalance() public view returns (uint256) {
    if (isNativeToken) {
      return address(this).balance;
    } else {
      return IERC20(poolToken).balanceOf(address(this));
    }
  }

  /**
   * @dev Extends the timelock for manager withdrawals
   * @param timestamp Future timestamp when withdrawals will be allowed
   * @notice Allowed only for address with MANAGER_ROLE
   */
  function extendTimelock(uint256 timestamp) external onlyRole(MANAGER_ROLE) {
    uint256 previousTimelock = timelock;
    _setTimelock(timestamp);
    emit TimelockExtended(timestamp, previousTimelock);
  }

  /**
   * @dev Allows the manager to deposit funds for rewards
   * @param amount Amount to deposit (required for ERC-20, informational for native token)
   * @notice Allowed only for address with MANAGER_ROLE
   */
  function deposit(uint256 amount) external payable onlyRole(MANAGER_ROLE) {
    if (isNativeToken) {
      if (msg.value != amount) revert AmountMismatch(amount, msg.value);
    } else {
      if (msg.value != 0) revert NativeTokenNotAccepted();
      IERC20(poolToken).safeTransferFrom(msg.sender, address(this), amount);
    }
    emit Deposit(amount);
  }

  /**
   * @dev Allows the manager to withdraw funds
   * @param amount Amount to withdraw
   * @notice Allowed only for address with MANAGER_ROLE
   */
  function withdraw(
    uint256 amount
  ) external onlyRole(MANAGER_ROLE) nonReentrant {
    if (block.timestamp < timelock)
      revert TimelockNotExpired(block.timestamp, timelock);

    uint256 balance = poolBalance();
    if (amount > balance) revert InsufficientPoolBalance(amount, balance);

    _transferPoolToken(msg.sender, amount);
    emit Withdraw(amount);
  }

  /**
   * @dev Increases amounts available for users to claim
   * @param users Array of user addresses
   * @param amounts Array of amounts to allocate for each user
   * @param rewardFunctionArgs Arguments used to calculate rewards
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function addRewards(
    address[] calldata users,
    uint256[] calldata amounts,
    uint256[] calldata rewardFunctionArgs
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 usersLength = users.length;
    uint256 amountsLength = amounts.length;
    if (usersLength != amountsLength)
      revert ArraysLengthMismatch(usersLength, amountsLength);

    for (uint256 i = 0; i < usersLength; i++) {
      if (users[i] == address(0)) revert ZeroAddressNotAllowed(i);
      if (amounts[i] == 0) revert RewardAmountMustBeGreaterThanZero(i);

      pendingRewards[users[i]] += amounts[i];
      totalPendingRewards += amounts[i];

      emit AddReward(users[i], amounts[i], rewardFunctionArgs);
    }
  }

  /**
   * @dev Allows user to claim their rewards
   * @param amount Amount to claim
   */
  function claimReward(uint256 amount) external nonReentrant {
    if (amount == 0) revert AmountMustBeGreaterThanZero();

    uint256 userPendingRewards = pendingRewards[msg.sender];
    if (amount > userPendingRewards)
      revert InsufficientRewardBalance(amount, userPendingRewards);

    uint256 balance = poolBalance();
    if (amount > balance) revert InsufficientPoolBalance(amount, balance);

    pendingRewards[msg.sender] -= amount;
    totalPendingRewards -= amount;

    _transferPoolToken(msg.sender, amount);

    emit ClaimReward(msg.sender, amount);
  }

  /**
   * @dev Internal function to set the timelock
   * @param timestamp Timestamp when withdrawals will be allowed
   */
  function _setTimelock(uint256 timestamp) internal {
    if (timestamp <= block.timestamp)
      revert TimelockMustBeInTheFuture(timestamp, block.timestamp);
    if (timestamp <= timelock)
      revert TimelockMustBeGreaterThanCurrent(timestamp, timelock);
    timelock = timestamp;
  }

  /**
   * @dev Internal function to transfer tokens to a recipient
   * @param recipient Address to receive tokens
   * @param amount Amount of tokens to transfer
   */
  function _transferPoolToken(address recipient, uint256 amount) internal {
    if (isNativeToken) {
      (bool success, ) = recipient.call{value: amount}('');
      if (!success) revert NativeTransferFailed();
    } else {
      IERC20(poolToken).safeTransfer(recipient, amount);
    }
  }

  /**
   * @dev Allows manager to rescue any extra tokens sent to the contract
   * @param rescuedToken Token address to rescue
   * @notice Allowed only for address with MANAGER_ROLE
   */
  function rescueToken(
    address rescuedToken
  ) external onlyRole(MANAGER_ROLE) nonReentrant {
    if (rescuedToken == poolToken) revert CannotRescuePoolToken();

    uint256 tokenBalance;

    if (rescuedToken == NATIVE_TOKEN_ADDRESS) {
      tokenBalance = address(this).balance;
      (bool success, ) = msg.sender.call{value: tokenBalance}('');
      if (!success) revert NativeTransferFailed();
    } else {
      tokenBalance = IERC20(rescuedToken).balanceOf(address(this));
      IERC20(rescuedToken).safeTransfer(msg.sender, tokenBalance);
    }

    emit RescueToken(rescuedToken, tokenBalance);
  }

  /**
   * @dev Prevents direct native token transfers
   */
  receive() external payable {
    revert UseDepositFunction();
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
