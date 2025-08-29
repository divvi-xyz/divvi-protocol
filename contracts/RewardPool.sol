// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from '@openzeppelin/contracts/access/AccessControl.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {IRewardFunction} from './rewardFunctions/IRewardFunction.sol';

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

  /**
   * @dev Fee denominator used for protocol fee calculations
   *
   * Uses 18-decimal fixed-point arithmetic for precise percentage calculations
   * that work correctly with tokens of any decimal configuration.
   *
   * **Formula:** feeAmount = (rewardAmount * protocolFee) / FEE_DENOMINATOR
   *
   * **Examples:**
   * - 5% fee:   protocolFee = 0.05 * 1e18 = 50000000000000000
   * - 1% fee:   protocolFee = 0.01 * 1e18 = 10000000000000000
   * - 0.5% fee: protocolFee = 0.005 * 1e18 = 5000000000000000
   */
  uint256 public constant FEE_DENOMINATOR = 1e18;

  // Data structures
  struct RewardData {
    address user;
    uint256 amount;
    bytes32 idempotencyKey;
  }

  struct PeriodData {
    mapping(address => uint256) kpis;
    address[] users;
    uint48 processedAt; // epoch seconds at which the period was processed and rewards distributed. 0 if not processed yet.
  }

  // State variables
  address public poolToken;
  bool public isNativeToken;
  address public rewardFunctionAddress;
  uint256 public timelock;
  uint256 public totalPendingRewards;
  mapping(address => uint256) public pendingRewards;
  mapping(bytes32 => bool) public processedIdempotencyKeys;
  mapping(bytes32 => PeriodData) private _periods;

  // Protocol fee state variables
  uint256 public protocolFee;
  address public reserveAddress;

  // Events
  event PoolInitialized(
    address indexed poolToken,
    address rewardFunctionAddress,
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
    uint256 rewardAmount,
    uint256 feeAmount,
    uint256 protocolFee
  );
  event RewardFunctionAddressUpdated(
    address newRewardFunctionAddress,
    address previousRewardFunctionAddress
  );
  event KpiUpdated(
    address indexed user,
    bytes32 indexed periodId,
    uint256 amount,
    uint256 periodStart,
    uint256 periodEndExclusive,
    bytes32 kpiFunctionId
  );
  event PeriodProcessed(
    bytes32 indexed periodId,
    uint256 periodStart,
    uint256 periodEndExclusive,
    uint256 totalRewardAmount,
    uint256 totalIssuedRewardAmount,
    uint256 numUsersRewarded
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
  error InvalidRewardFunctionAddress();
  error PeriodInvalid(uint256 periodStart, uint256 periodEndExclusive);
  error PeriodAlreadyProcessed(bytes32 periodId);

  // This is needed to prevent the implementation from being initialized
  bool private initialized;

  /**
   * @dev Initializes the contract
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionAddress Implementation address of the reward function
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @param _reserveAddress Address that will receive protocol fees
   *
   * **Protocol Fee System:**
   * Fees are automatically collected when rewards are added using Math.mulDiv
   * for precision and overflow safety: `feeAmount = Math.mulDiv(rewardAmount, protocolFee, FEE_DENOMINATOR)`
   */
  function initialize(
    address _poolToken,
    address _rewardFunctionAddress,
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

    _setRewardFunctionAddress(_rewardFunctionAddress);
    _setTimelock(_timelock);
    _setProtocolFee(_protocolFee);
    _setReserveAddress(_reserveAddress);

    emit PoolInitialized(_poolToken, _rewardFunctionAddress, _timelock);
  }

  /**
   * @dev Constructor for direct deployment
   * @param _poolToken Address of the token used for rewards
   * @param _rewardFunctionAddress Implementation address of the reward function
   * @param _owner Address that will have DEFAULT_ADMIN_ROLE
   * @param _manager Address that will have MANAGER_ROLE
   * @param _timelock Timestamp when manager withdrawals will be allowed
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @param _reserveAddress Address that will receive protocol fees
   */
  constructor(
    address _poolToken,
    address _rewardFunctionAddress,
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

    _setRewardFunctionAddress(_rewardFunctionAddress);
    _setTimelock(_timelock);
    _setProtocolFee(_protocolFee);
    _setReserveAddress(_reserveAddress);

    emit PoolInitialized(_poolToken, _rewardFunctionAddress, _timelock);
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
   * @dev Internal function to get the period id
   * @param periodStart Start of the reward period (unix timestamp)
   * @param periodEndExclusive End of the reward period (unix timestamp)
   * @return bytes32 period id
   */
  function _getPeriodId(
    uint48 periodStart,
    uint48 periodEndExclusive
  ) internal pure returns (bytes32) {
    if (periodStart >= periodEndExclusive)
      revert PeriodInvalid(periodStart, periodEndExclusive);

    return keccak256(abi.encode(periodStart, periodEndExclusive));
  }

  /**
   * @dev Allows the owner to update kpis for a reward period
   * @param kpis Array of kpis to add
   * @param periodStart Start of the reward period (unix timestamp)
   * @param periodEndExclusive End of the reward period (unix timestamp)
   * @param kpiFunctionId Bytes32 identifier of the kpi function (e.g., github commit hash)
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function updatePeriodKpis(
    IRewardFunction.Kpi[] calldata kpis,
    uint48 periodStart,
    uint48 periodEndExclusive,
    bytes32 kpiFunctionId
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    bytes32 periodId = _getPeriodId(periodStart, periodEndExclusive);

    PeriodData storage period = _periods[periodId];

    if (period.processedAt != 0) revert PeriodAlreadyProcessed(periodId);

    for (uint256 i = 0; i < kpis.length; i++) {
      if (kpis[i].referrerAddress == address(0))
        revert ZeroAddressNotAllowed(i);

      // if kpi is 0, remove the user from the period if already present
      if (kpis[i].kpi == 0) {
        delete period.kpis[kpis[i].referrerAddress];

        uint256 index = period.users.length;

        for (uint256 j = 0; j < period.users.length; j++) {
          if (period.users[j] == kpis[i].referrerAddress) {
            index = j;
            break;
          }
        }

        if (index < period.users.length) {
          period.users[index] = period.users[period.users.length - 1];
          period.users.pop();
        }
      } else {
        if (period.kpis[kpis[i].referrerAddress] == 0) {
          period.users.push(kpis[i].referrerAddress);
        }

        period.kpis[kpis[i].referrerAddress] = kpis[i].kpi;
      }

      emit KpiUpdated(
        kpis[i].referrerAddress,
        periodId,
        kpis[i].kpi,
        periodStart,
        periodEndExclusive,
        kpiFunctionId
      );
    }
  }

  /**
   * @dev Allows the owner to process a reward period and distribute rewards
   * @param periodStart Start of the reward period (unix timestamp)
   * @param periodEndExclusive End of the reward period (unix timestamp)
   * @param totalRewardAmount Total amount of rewards to distribute
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function processPeriod(
    uint48 periodStart,
    uint48 periodEndExclusive,
    uint256 totalRewardAmount
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    bytes32 periodId = _getPeriodId(periodStart, periodEndExclusive);

    PeriodData storage period = _periods[periodId];

    if (period.processedAt != 0) revert PeriodAlreadyProcessed(periodId);

    if (period.users.length == 0)
      revert PeriodInvalid(periodStart, periodEndExclusive);

    IRewardFunction.Kpi[] memory kpis = new IRewardFunction.Kpi[](
      period.users.length
    );

    for (uint256 i = 0; i < period.users.length; i++) {
      address user = period.users[i];
      uint256 kpi = period.kpis[user];

      kpis[i] = IRewardFunction.Kpi({referrerAddress: user, kpi: kpi});
    }

    IRewardFunction.Reward[] memory rewards = IRewardFunction(
      rewardFunctionAddress
    ).calculateReward(kpis, totalRewardAmount);

    uint256[] memory rewardFunctionArgs = new uint256[](2);
    rewardFunctionArgs[0] = periodStart;
    rewardFunctionArgs[1] = periodEndExclusive;

    uint256 totalIssuedRewardAmount = 0;
    uint256 numUsersRewarded = 0;

    for (uint32 i = 0; i < rewards.length; i++) {
      if (rewards[i].reward == 0) continue;

      RewardData memory rewardData = RewardData({
        user: rewards[i].referrerAddress,
        amount: rewards[i].reward,
        idempotencyKey: keccak256(
          abi.encode(
            rewards[i].referrerAddress,
            periodStart,
            periodEndExclusive
          )
        )
      });

      _addReward(rewardData, rewardFunctionArgs, i);
      totalIssuedRewardAmount += rewards[i].reward;
      numUsersRewarded++;
    }

    emit PeriodProcessed(
      periodId,
      periodStart,
      periodEndExclusive,
      totalRewardAmount,
      totalIssuedRewardAmount,
      numUsersRewarded
    );

    period.processedAt = uint48(block.timestamp);
  }

  /**
   * @dev Returns the kpi of a user for a given period
   * @param periodStart Start of the reward period (unix timestamp)
   * @param periodEndExclusive End of the reward period (unix timestamp)
   * @param user Address of the user
   * @return uint256 kpi
   */
  function getPeriodKpi(
    uint48 periodStart,
    uint48 periodEndExclusive,
    address user
  ) external view returns (uint256) {
    bytes32 periodId = _getPeriodId(periodStart, periodEndExclusive);
    return _periods[periodId].kpis[user];
  }

  /**
   * @dev Returns true if a period has been processed
   * @param periodStart Start of the reward period (unix timestamp)
   * @param periodEndExclusive End of the reward period (unix timestamp)
   * @return bool true if the period has been processed
   */
  function isPeriodProcessed(
    uint48 periodStart,
    uint48 periodEndExclusive
  ) external view returns (bool) {
    bytes32 periodId = _getPeriodId(periodStart, periodEndExclusive);
    return _periods[periodId].processedAt != 0;
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
    for (uint32 i = 0; i < rewards.length; i++) {
      _addReward(rewards[i], rewardFunctionArgs, i);
    }
  }

  function _addReward(
    RewardData memory reward,
    uint256[] memory rewardFunctionArgs,
    uint32 index
  ) internal {
    if (reward.user == address(0)) revert ZeroAddressNotAllowed(index);
    if (reward.amount == 0) revert RewardAmountMustBeGreaterThanZero(index);
    if (reward.idempotencyKey == bytes32(0)) revert EmptyIdempotencyKey(index);

    if (processedIdempotencyKeys[reward.idempotencyKey]) {
      emit AddRewardSkipped(reward.user, reward.amount, reward.idempotencyKey);
      return;
    }

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

    processedIdempotencyKeys[reward.idempotencyKey] = true;
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
   *
   * **Usage:** Use `parseEther('0.05')` for 5% fee, or raw values like `50000000000000000`
   * **Validation:** Must be ≤ FEE_DENOMINATOR (1e18) to prevent fees > 100%
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

  function _setRewardFunctionAddress(address _rewardFunctionAddress) internal {
    if (_rewardFunctionAddress == address(0))
      revert InvalidRewardFunctionAddress();
    rewardFunctionAddress = _rewardFunctionAddress;
  }

  /**
   * @dev Sets the protocol fee
   * @param _protocolFee Protocol fee numerator (denominator is 10^18)
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   *
   * **Usage:** `setProtocolFee(parseEther('0.05'))` for 5% fee
   * **Fee Impact:** Automatically deducted from rewards and sent to reserve address
   * **Security:** Only the contract admin can modify protocol fees
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
   * @dev Sets the reward function address
   * @param _rewardFunctionAddress Address of the reward function
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setRewardFunctionAddress(
    address _rewardFunctionAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    address previousRewardFunctionAddress = rewardFunctionAddress;
    _setRewardFunctionAddress(_rewardFunctionAddress);
    emit RewardFunctionAddressUpdated(
      _rewardFunctionAddress,
      previousRewardFunctionAddress
    );
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
