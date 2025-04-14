// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

/**
 * @title DivviRegistry
 * @notice A registry contract for managing rewards entities and agreements
 */
contract DivviRegistry is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable
{
  // Entities storage
  mapping(address => bool) private _entities; // entity => true (if entity exists)

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(providerId, consumerId) => true (if agreement exists)
  mapping(address => bool) private _requiresApproval; // entityId => boolean (if entity requires approval)

  // Referral tracking
  mapping(address => mapping(address => address)) private _userReferrals; // user => providerId => consumerId

  // Events
  event RewardsEntityRegistered(address indexed entity);
  event RequiresApprovalForRewardsAgreements(
    address indexed entity,
    bool requiresApproval
  );
  event RewardsAgreementRegistered(
    address indexed rewardsProvider,
    address indexed rewardsConsumer
  );
  event RewardsAgreementApproved(
    address indexed rewardsProvider,
    address indexed rewardsConsumer
  );
  event ReferralRegistered(
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    address indexed user
  );

  // Errors
  error InvalidEntityAddress(address entity);
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error AgreementAlreadyExists(address provider, address consumer);
  error AgreementDoesNotExist(address provider, address consumer);
  error ProviderRequiresApproval(address provider);
  error UserAlreadyReferred(address provider, address consumer, address user);

  constructor() {
    _disableInitializers();
  }

  function initialize(address owner, uint48 transferDelay) public initializer {
    __AccessControlDefaultAdminRules_init(transferDelay, owner);
    __UUPSUpgradeable_init();
  }

  function _authorizeUpgrade(
    address
  ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {} // solhint-disable-line no-empty-blocks

  /**
   * @notice Modifier to ensure an entity exists
   * @param entity The entity address to check
   */
  modifier entityExists(address entity) {
    if (!_entities[entity]) {
      revert EntityDoesNotExist(entity);
    }
    _;
  }

  /**
   * @notice Register a new rewards entity
   * @param entity The entity owner address
   */
  function registerRewardsEntity(
    address entity,
    bool requiresApproval
  ) external {
    if (entity == address(0)) {
      revert InvalidEntityAddress(entity);
    }

    if (_entities[entity]) {
      revert EntityAlreadyExists(entity);
    }

    _entities[entity] = true;
    _requiresApproval[entity] = requiresApproval;
    emit RewardsEntityRegistered(entity);
  }

  /**
   * @notice Set whether a Rewards Entity requires approval for agreements
   * @param requiresApproval Whether the entity requires approval
   */
  function setRequiresApprovalForRewardsAgreements(
    bool requiresApproval
  ) external entityExists(msg.sender) {
    _requiresApproval[msg.sender] = requiresApproval;
    emit RequiresApprovalForRewardsAgreements(msg.sender, requiresApproval);
  }

  /**
   * @notice Registers a Rewards Consumer - Rewards Provider relationship between two Rewards Entities, should be called by the Rewards Consumer
   * @param rewardsProvider The provider entity address
   */
  function registerRewardsAgreement(
    address rewardsProvider
  ) external entityExists(rewardsProvider) entityExists(msg.sender) {
    // If the provider requires approval, revert the transaction
    if (_requiresApproval[rewardsProvider]) {
      revert ProviderRequiresApproval(rewardsProvider);
    }

    // Check if agreement already exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(rewardsProvider, msg.sender)
    );
    if (_agreements[agreementKey]) {
      revert AgreementAlreadyExists(rewardsProvider, msg.sender);
    }

    _agreements[agreementKey] = true;
    emit RewardsAgreementRegistered(rewardsProvider, msg.sender);
  }

  /**
   * @notice Approve a rewards agreement, should be called by the Rewards Provider
   * @param rewardsConsumer The consumer entity address
   */
  function approveRewardsAgreement(
    address rewardsConsumer
  ) external entityExists(rewardsConsumer) entityExists(msg.sender) {
    // Create the agreement
    bytes32 agreementKey = keccak256(
      abi.encodePacked(msg.sender, rewardsConsumer)
    );
    _agreements[agreementKey] = true;
    emit RewardsAgreementApproved(msg.sender, rewardsConsumer);
  }

  /**
   * @notice Registers a user as being referred to a rewards agreement
   * @param user The address of the user being referred
   * @param rewardsConsumer The address of the rewards consumer entity
   * @param rewardsProvider The address of the rewards provider entity
   */
  function registerReferral(
    address user,
    address rewardsConsumer,
    address rewardsProvider
  ) external entityExists(rewardsProvider) entityExists(rewardsConsumer) {
    // TODO: add role check
    // Check if agreement exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(rewardsProvider, rewardsConsumer)
    );
    if (!_agreements[agreementKey]) {
      revert AgreementDoesNotExist(rewardsProvider, rewardsConsumer);
    }

    // Skip if user is already referred to this provider
    if (_userReferrals[user][rewardsProvider] != address(0)) {
      revert UserAlreadyReferred(rewardsProvider, rewardsConsumer, user);
    }

    // Add referral
    _userReferrals[user][rewardsProvider] = rewardsConsumer;
    emit ReferralRegistered(rewardsProvider, rewardsConsumer, user);
  }
}
