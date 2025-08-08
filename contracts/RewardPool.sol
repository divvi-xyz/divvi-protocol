// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from '@openzeppelin/contracts/access/AccessControl.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';

/**
 * @title Divvi RewardPool
 * @custom:security-contact security@valora.xyz
 */
contract RewardPool is AccessControl, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Constants
  address public constant NATIVE_TOKEN_ADDRESS =
    0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  bytes32 public constant MANAGER_ROLE = keccak256('MANAGER_ROLE');
  uint256 public constant FEE_DENOMINATOR = 1e18;

  // Data structures
  struct RewardData {
    address user;
    uint256 amount;
    bytes32 idempotencyKey;
  }

  // State variables
  address public poolToken;
  bool public isNativeToken;
  bytes32 public rewardFunctionId;
  uint256 public timelock;
  uint256 public totalPendingRewards;
  mapping(address => uint256) public pendingRewards;
  mapping(bytes32 => bool) public processedIdempotencyKeys;

  // Protocol fee state variables
  uint256 public protocolFee;
  address public reserveAddress;

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
  event ClaimReward(address indexed user, uint256 amount);
  event RescueToken(address token, uint256 amount);
  event ProtocolFeeUpdated(uint256 newProtocolFee, uint256 previousProtocolFee);
  event ReserveAddressUpdated(
    address newReserveAddress,
    address previousReserveAddress
  );
  event ProtocolFeeCollected(
    address indexed user,
    uint256 originalAmount,
    uint256 feeAmount,
    uint256 protocolFee
  );

  // Errors
  error AmountMismatch(uint256 expected, uint256 received);
  error AmountMustBeGreaterThanZero();
  error CannotRescuePoolToken();
  error EmptyIdempotencyKey(uint256 index);
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
  error AlreadyInitialized();
  error InvalidProtocolFee(uint256 fee);
  error InvalidReserveAddress();

  // This is needed to prevent the implementation from being initialized
  bool private initialized;

  /**
   * @dev Initializes the contract
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionId Bytes32 identifier of the reward function (e.g. git commit hash)
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @param _reserveAddress Address that will receive protocol fees
   */
  function initialize(
    address _poolToken,
    bytes32 _rewardFunctionId,
    address _owner,
    address _manager,
    uint256 _timelock,
    uint256 _protocolFee,
    address _reserveAddress
  ) external {
    if (initialized) revert AlreadyInitialized();
    initialized = true;

    _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    _setRoleAdmin(MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
    _grantRole(MANAGER_ROLE, _manager);

    poolToken = _poolToken;
    isNativeToken = (_poolToken == NATIVE_TOKEN_ADDRESS);
    rewardFunctionId = _rewardFunctionId;

    _setTimelock(_timelock);
    _setProtocolFee(_protocolFee);
    _setReserveAddress(_reserveAddress);

    emit PoolInitialized(_poolToken, _rewardFunctionId, _timelock);
  }

  /**
   * @dev Constructor for direct deployment
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionId Bytes32 identifier of the reward function (e.g. git commit hash)
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @param _reserveAddress Address that will receive protocol fees
   */
  constructor(
    address _poolToken,
    bytes32 _rewardFunctionId,
    address _owner,
    address _manager,
    uint256 _timelock,
    uint256 _protocolFee,
    address _reserveAddress
  ) {
    initialized = true;

    _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    _setRoleAdmin(MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
    _grantRole(MANAGER_ROLE, _manager);

    poolToken = _poolToken;
    isNativeToken = (_poolToken == NATIVE_TOKEN_ADDRESS);
    rewardFunctionId = _rewardFunctionId;

    _setTimelock(_timelock);
    _setProtocolFee(_protocolFee);
    _setReserveAddress(_reserveAddress);

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
   * @dev Increases amounts available for users to claim with idempotency protection
   * @param rewards Array of reward items to process
   * @param rewardFunctionArgs Arguments used to calculate rewards
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function addRewards(
    RewardData[] calldata rewards,
    uint256[] calldata rewardFunctionArgs
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < rewards.length; i++) {
      RewardData calldata reward = rewards[i];

      if (reward.user == address(0)) revert ZeroAddressNotAllowed(i);
      if (reward.amount == 0) revert RewardAmountMustBeGreaterThanZero(i);
      if (reward.idempotencyKey == bytes32(0)) revert EmptyIdempotencyKey(i);

      if (!processedIdempotencyKeys[reward.idempotencyKey]) {
        processedIdempotencyKeys[reward.idempotencyKey] = true;

        uint256 feeAmount = Math.mulDiv(
          reward.amount,
          protocolFee,
          FEE_DENOMINATOR
        );

        if (feeAmount > 0) {
          _transferPoolToken(reserveAddress, feeAmount);
          emit ProtocolFeeCollected(
            reward.user,
            reward.amount,
            feeAmount,
            protocolFee
          );
        }

        pendingRewards[reward.user] += reward.amount;
        totalPendingRewards += reward.amount;

        // Old event for backwards compatibility
        emit AddReward(reward.user, reward.amount, rewardFunctionArgs);
        emit AddRewardWithIdempotency(
          reward.user,
          reward.amount,
          reward.idempotencyKey,
          rewardFunctionArgs
        );
      } else {
        emit AddRewardSkipped(
          reward.user,
          reward.amount,
          reward.idempotencyKey
        );
      }
    }
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
   * @dev Internal function to set the protocol fee
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   */
  function _setProtocolFee(uint256 _protocolFee) internal {
    if (_protocolFee > FEE_DENOMINATOR) revert InvalidProtocolFee(_protocolFee);
    protocolFee = _protocolFee;
  }

  /**
   * @dev Internal function to set the reserve address
   * @param _reserveAddress Address that will receive protocol fees
   */
  function _setReserveAddress(address _reserveAddress) internal {
    if (_reserveAddress == address(0)) revert InvalidReserveAddress();
    reserveAddress = _reserveAddress;
  }

  /**
   * @dev Sets the protocol fee
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setProtocolFee(
    uint256 _protocolFee
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 previousProtocolFee = protocolFee;
    _setProtocolFee(_protocolFee);
    emit ProtocolFeeUpdated(_protocolFee, previousProtocolFee);
  }

  /**
   * @dev Sets the reserve address
   * @param _reserveAddress Address that will receive protocol fees
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setReserveAddress(
    address _reserveAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    address previousReserveAddress = reserveAddress;
    _setReserveAddress(_reserveAddress);
    emit ReserveAddressUpdated(_reserveAddress, previousReserveAddress);
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
}
