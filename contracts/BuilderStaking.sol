// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title Divvi BuilderStaking
 * @dev Contract for managing $DIVVI token stakes on behalf of builders
 * @custom:security-contact security@valora.xyz
 */
contract BuilderStaking is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable
{
  using SafeERC20 for IERC20;

  // State variables
  IERC20 public divviToken;
  uint256 public stakingThreshold;
  uint256 public totalStaked;

  // Core mappings - these store the actual stake amounts
  mapping(address => mapping(address => uint256)) public stakersForBeneficiary; // beneficiary => staker => amount
  mapping(address => mapping(address => uint256)) public beneficiariesForStaker; // staker => beneficiary => amount

  // Arrays to track relationships for efficient querying
  mapping(address => address[]) public stakerListForBeneficiary;
  mapping(address => address[]) public beneficiaryListForStaker;

  // Events
  event ThresholdUpdated(uint256 newThreshold, uint256 previousThreshold);
  event Staked(address indexed staker, address indexed beneficiary, uint256 amount);
  event Unstaked(address indexed staker, address indexed beneficiary, uint256 amount);

  // Errors
  error ZeroAddressNotAllowed();
  error AmountMustBeGreaterThanZero();
  error InsufficientStakeBalance(uint256 requested, uint256 available);
  error CannotRescueStakedTokens(uint256 requested, uint256 totalStaked);
  error CannotRescueZeroAmount();

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Initializes the contract
   * @param _divviToken Address of the $DIVVI token contract
   * @param _admin Address that will have DEFAULT_ADMIN_ROLE
   * @param _initialThreshold Initial staking threshold (can be 0)
   */
  function initialize(
    address _divviToken,
    address _admin,
    uint256 _initialThreshold
  ) external initializer {
    if (_divviToken == address(0)) revert ZeroAddressNotAllowed();
    if (_admin == address(0)) revert ZeroAddressNotAllowed();

    __AccessControlDefaultAdminRules_init(0, _admin);
    __UUPSUpgradeable_init();

    divviToken = IERC20(_divviToken);
    stakingThreshold = _initialThreshold;

    emit ThresholdUpdated(_initialThreshold, 0);
  }

  /**
   * @dev Sets the staking threshold required for builder participation
   * @param _newThreshold New staking threshold amount
   * @notice Allowed only for address with DEFAULT_ADMIN_ROLE
   */
  function setThreshold(
    uint256 _newThreshold
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 previousThreshold = stakingThreshold;
    stakingThreshold = _newThreshold;

    emit ThresholdUpdated(_newThreshold, previousThreshold);
  }

  /**
   * @dev Stakes $DIVVI tokens on behalf of a beneficiary
   * @param _amount Amount of $DIVVI tokens to stake
   * @param _beneficiary Address of the builder to stake on behalf of
   * @notice User must first approve this contract to spend their $DIVVI tokens
   */
  function stake(uint256 _amount, address _beneficiary) external {
    if (_amount == 0) revert AmountMustBeGreaterThanZero();
    if (_beneficiary == address(0)) revert ZeroAddressNotAllowed();

    // Transfer tokens from staker to this contract
    divviToken.safeTransferFrom(msg.sender, address(this), _amount);

    // Update stake amounts
    stakersForBeneficiary[_beneficiary][msg.sender] += _amount;
    beneficiariesForStaker[msg.sender][_beneficiary] += _amount;
    totalStaked += _amount;

    // Add to tracking arrays if this is a new relationship
    if (beneficiariesForStaker[msg.sender][_beneficiary] == _amount) {
      // This is a new relationship (amount was 0 before)
      stakerListForBeneficiary[_beneficiary].push(msg.sender);
      beneficiaryListForStaker[msg.sender].push(_beneficiary);
    }

    emit Staked(msg.sender, _beneficiary, _amount);
  }

  /**
   * @dev Unstakes $DIVVI tokens that were staked on behalf of a beneficiary
   * @param _amount Amount of $DIVVI tokens to unstake
   * @param _beneficiary Address of the builder to unstake on behalf of
   */
  function unstake(uint256 _amount, address _beneficiary) external {
    if (_amount == 0) revert AmountMustBeGreaterThanZero();
    if (_beneficiary == address(0)) revert ZeroAddressNotAllowed();

    uint256 currentStake = beneficiariesForStaker[msg.sender][_beneficiary];
    if (_amount > currentStake) {
      revert InsufficientStakeBalance(_amount, currentStake);
    }

    // Update stake amounts
    stakersForBeneficiary[_beneficiary][msg.sender] -= _amount;
    beneficiariesForStaker[msg.sender][_beneficiary] -= _amount;
    totalStaked -= _amount;

    // Remove from tracking arrays if stake becomes zero
    if (beneficiariesForStaker[msg.sender][_beneficiary] == 0) {
      _removeStakerFromBeneficiary(msg.sender, _beneficiary);
      _removeBeneficiaryFromStaker(msg.sender, _beneficiary);
    }

    // Transfer tokens back to staker
    divviToken.safeTransfer(msg.sender, _amount);

    emit Unstaked(msg.sender, _beneficiary, _amount);
  }

  /**
   * @dev Returns the total amount staked on behalf of a beneficiary
   * @param _beneficiary Address of the builder
   * @return Total amount staked on behalf of the beneficiary
   */
  function getStakedBalance(
    address _beneficiary
  ) external view returns (uint256) {
    address[] memory stakers = stakerListForBeneficiary[_beneficiary];
    uint256 total = 0;

    for (uint256 i = 0; i < stakers.length; i++) {
      total += stakersForBeneficiary[_beneficiary][stakers[i]];
    }

    return total;
  }

  /**
   * @dev Returns the stake amount for a specific staker-beneficiary pair
   * @param _staker Address of the staker
   * @param _beneficiary Address of the beneficiary
   * @return Amount staked by staker on behalf of beneficiary
   */
  function getStakeAmount(
    address _staker,
    address _beneficiary
  ) external view returns (uint256) {
    return beneficiariesForStaker[_staker][_beneficiary];
  }

  /**
   * @dev Checks if a beneficiary meets the staking threshold
   * @param _beneficiary Address of the builder
   * @return True if the total staked amount meets or exceeds the threshold, false otherwise
   */
  function meetsThreshold(address _beneficiary) external view returns (bool) {
    address[] memory stakers = stakerListForBeneficiary[_beneficiary];
    uint256 total = 0;

    for (uint256 i = 0; i < stakers.length; i++) {
      total += stakersForBeneficiary[_beneficiary][stakers[i]];
    }

    return total >= stakingThreshold;
  }

  /**
   * @dev Returns all stakers and their amounts for a given beneficiary
   * @param _beneficiary Address of the builder
   * @return stakers Array of staker addresses
   * @return amounts Array of corresponding stake amounts
   */
  function getStakers(
    address _beneficiary
  ) external view returns (address[] memory stakers, uint256[] memory amounts) {
    address[] memory stakerAddresses = stakerListForBeneficiary[_beneficiary];
    uint256 stakerCount = stakerAddresses.length;

    stakers = new address[](stakerCount);
    amounts = new uint256[](stakerCount);

    for (uint256 i = 0; i < stakerCount; i++) {
      address staker = stakerAddresses[i];
      stakers[i] = staker;
      amounts[i] = stakersForBeneficiary[_beneficiary][staker];
    }
  }

  /**
   * @dev Returns all stakes made by a given staker
   * @param _staker Address of the staker
   * @return beneficiaries Array of beneficiary addresses
   * @return amounts Array of corresponding stake amounts
   */
  function getStakes(
    address _staker
  )
    external
    view
    returns (address[] memory beneficiaries, uint256[] memory amounts)
  {
    address[] memory beneficiaryAddresses = beneficiaryListForStaker[_staker];
    uint256 beneficiaryCount = beneficiaryAddresses.length;

    beneficiaries = new address[](beneficiaryCount);
    amounts = new uint256[](beneficiaryCount);

    for (uint256 i = 0; i < beneficiaryCount; i++) {
      address beneficiary = beneficiaryAddresses[i];
      beneficiaries[i] = beneficiary;
      amounts[i] = beneficiariesForStaker[_staker][beneficiary];
    }
  }

  /**
   * @dev Internal function to remove a staker from a beneficiary's staker list
   * @param _staker Address of the staker to remove
   * @param _beneficiary Address of the beneficiary
   */
  function _removeStakerFromBeneficiary(
    address _staker,
    address _beneficiary
  ) internal {
    address[] storage stakerList = stakerListForBeneficiary[_beneficiary];
    uint256 stakerCount = stakerList.length;

    for (uint256 i = 0; i < stakerCount; i++) {
      if (stakerList[i] == _staker) {
        // Replace with last element and pop
        stakerList[i] = stakerList[stakerCount - 1];
        stakerList.pop();
        break;
      }
    }
  }

  /**
   * @dev Internal function to remove a beneficiary from a staker's beneficiary list
   * @param _staker Address of the staker
   * @param _beneficiary Address of the beneficiary to remove
   */
  function _removeBeneficiaryFromStaker(
    address _staker,
    address _beneficiary
  ) internal {
    address[] storage beneficiaryList = beneficiaryListForStaker[_staker];
    uint256 beneficiaryCount = beneficiaryList.length;

    for (uint256 i = 0; i < beneficiaryCount; i++) {
      if (beneficiaryList[i] == _beneficiary) {
        // Replace with last element and pop
        beneficiaryList[i] = beneficiaryList[beneficiaryCount - 1];
        beneficiaryList.pop();
        break;
      }
    }
  }

  /**
   * @dev Allows admin to rescue tokens
   * @param _token Address of the token to rescue
   * @param _to Address to send the rescued tokens to
   * @param _amount Amount of tokens to rescue
   * @notice Only callable by admin, can only rescue $DIVVI tokens in excess of the total staked amount
   */
  function rescueToken(
    address _token,
    address _to,
    uint256 _amount
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_token == address(0)) revert ZeroAddressNotAllowed();
    if (_to == address(0)) revert ZeroAddressNotAllowed();
    if (_amount == 0) revert CannotRescueZeroAmount();
    
    if (_token == address(divviToken)) {
      // For DIVVI tokens, calculate excess as balance minus total staked
      uint256 currentBalance = divviToken.balanceOf(address(this));
      uint256 excessAmount = currentBalance > totalStaked ? currentBalance - totalStaked : 0;
      
      if (_amount > excessAmount) {
        revert CannotRescueStakedTokens(_amount, totalStaked);
      }
      
      divviToken.safeTransfer(_to, _amount);
    } else {
      IERC20 token = IERC20(_token);
      uint256 balance = token.balanceOf(address(this));
      
      if (_amount > balance) {
        revert InsufficientStakeBalance(_amount, balance);
      }

      token.safeTransfer(_to, _amount);
    }
  }

  /**
   * @dev Required by the OZ UUPS module
   */
  function _authorizeUpgrade(
    address newImplementation
  ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
