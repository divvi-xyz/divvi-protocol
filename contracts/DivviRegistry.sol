// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {MessageHashUtils} from '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';

/**
 * @title DivviRegistry
 * @notice A registry contract for managing rewards entities and agreements
 */
contract DivviRegistry is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable
{
  using ECDSA for bytes32;
  using MessageHashUtils for bytes32;

  struct Referral {
    address user;
    bytes userSignature;
    address rewardsConsumer;
    address rewardsProvider;
  }

  // Storage
  uint256 private _nextEntityId; // Counter for generating unique id's
  mapping(uint256 => address) private _idToEntity; // id => current owner address (Rewards Entity) allows each entity to have a stable identifier while allowing the owner to change
  mapping(address => uint256) private _entityToId; // current owner => id

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(providerId, consumerId) => true (if agreement exists)
  mapping(uint256 => bool) private _requiresApproval; // entityId => boolean (if entity requires approval)

  // Referral tracking
  mapping(address => mapping(uint256 => uint256)) private _userReferrals; // user => providerId => consumerId

  // Events
  event RewardsEntityRegistered(address indexed entity);
  event RewardsEntityOwnerTransferred(
    address indexed oldOwner,
    address indexed newOwner
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
  event ReferralFailed(
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    address indexed user,
    string reason
  );
  event RequiresApprovalForRewardsAgreements(
    address indexed entity,
    bool requiresApproval
  );

  // Errors
  error InvalidEntityAddress(address entity);
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error NotEntityOwner(address entity, address owner);
  error AgreementAlreadyExists(address provider, address consumer);
  error AgreementDoesNotExist(address provider, address consumer);
  error ProviderRequiresApproval(address provider);
  error InvalidSignature();
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
   * @notice Register a new rewards entity
   * @param entity The entity address to register
   */
  function registerRewardsEntity(address entity) external {
    if (entity == address(0)) {
      revert InvalidEntityAddress(entity);
    }

    if (_entityToId[entity] != 0) {
      revert EntityAlreadyExists(entity);
    }

    uint256 entityId = ++_nextEntityId;
    _idToEntity[entityId] = entity;
    _entityToId[entity] = entityId;

    emit RewardsEntityRegistered(entity);
  }

  /**
   * @notice Transfer ownership of a rewards entity
   * @param entity The entity address
   * @param newOwner The new owner address
   */
  function transferRewardsEntityOwner(
    address entity,
    address newOwner
  ) external {
    uint256 entityId = _entityToId[entity];
    if (entityId == 0) {
      revert EntityDoesNotExist(entity);
    }

    if (entity != msg.sender) {
      revert NotEntityOwner(entity, msg.sender);
    }

    // Update mappings
    _idToEntity[entityId] = newOwner;
    _entityToId[newOwner] = entityId;
    delete _entityToId[entity];

    emit RewardsEntityOwnerTransferred(entity, newOwner);
  }

  /**
   * @notice Get whether a Rewards Entity requires approval for agreements
   * @param entity The entity address
   * @return bool True if the entity requires approval, false otherwise
   */
  function getRequiresApprovalForRewardsAgreements(
    address entity
  ) external view returns (bool) {
    return _requiresApproval[_entityToId[entity]];
  }

  /**
   * @notice Set whether a Rewards Entity requires approval for agreements
   */
  function setRequiresApprovalForRewardsAgreements(
    bool requiresApproval
  ) external {
    uint256 entityId = _entityToId[msg.sender];
    if (entityId == 0) {
      revert EntityDoesNotExist(msg.sender);
    }

    _requiresApproval[entityId] = requiresApproval;
    emit RequiresApprovalForRewardsAgreements(msg.sender, requiresApproval);
  }

  /**
   * @notice Registers a Rewards Consumer - Rewards Provider relationship between two Rewards Entities, should be called by the Rewards Consumer
   * @param rewardsProvider The provider entity address
   */
  function registerRewardsAgreement(address rewardsProvider) external {
    uint256 providerId = _entityToId[rewardsProvider];
    uint256 consumerId = _entityToId[msg.sender];

    if (providerId == 0 || consumerId == 0) {
      revert EntityDoesNotExist(providerId == 0 ? rewardsProvider : msg.sender);
    }

    // If the provider requires approval, revert the transaction
    if (_requiresApproval[providerId]) {
      revert ProviderRequiresApproval(rewardsProvider);
    }

    // Check if agreement already exists
    bytes32 agreementKey = keccak256(abi.encodePacked(providerId, consumerId));
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
  function approveRewardsAgreement(address rewardsConsumer) external {
    uint256 providerId = _entityToId[msg.sender];
    uint256 consumerId = _entityToId[rewardsConsumer];

    if (providerId == 0 || consumerId == 0) {
      revert EntityDoesNotExist(providerId == 0 ? msg.sender : rewardsConsumer);
    }

    // Create the agreement
    bytes32 agreementKey = keccak256(abi.encodePacked(providerId, consumerId));
    _agreements[agreementKey] = true;
    emit RewardsAgreementApproved(msg.sender, rewardsConsumer);
  }

  /**
   * @notice Registers a user as being referred to a rewards agreement
   * @param user The address of the user being referred
   * @param userSignature The user's signature authorizing the referral
   * @param rewardsConsumer The address of the rewards consumer entity
   * @param rewardsProvider The address of the rewards provider entity
   * @param shouldRevertOnFailure Whether the function should revert on failure
   * @return success Whether the referral was successfully registered
   */
  function _registerReferral(
    address user,
    bytes memory userSignature,
    address rewardsConsumer,
    address rewardsProvider,
    bool shouldRevertOnFailure
  ) private returns (bool success) {
    // Verify user signature
    bytes32 hash = keccak256(abi.encodePacked('Confirm referral'));
    address signer = hash.toEthSignedMessageHash().recover(userSignature);
    if (user != signer) {
      if (shouldRevertOnFailure) {
        revert InvalidSignature();
      }
      emit ReferralFailed(
        rewardsProvider,
        rewardsConsumer,
        user,
        'InvalidSignature'
      );
      return false;
    }

    uint256 consumerId = _entityToId[rewardsConsumer];
    uint256 providerId = _entityToId[rewardsProvider];

    if (consumerId == 0 || providerId == 0) {
      if (shouldRevertOnFailure) {
        revert EntityDoesNotExist(
          consumerId == 0 ? rewardsConsumer : rewardsProvider
        );
      }
      emit ReferralFailed(
        rewardsProvider,
        rewardsConsumer,
        user,
        'EntityDoesNotExist'
      );
      return false;
    }

    // Check if agreement exists and is approved
    bytes32 agreementKey = keccak256(abi.encodePacked(providerId, consumerId));
    if (!_agreements[agreementKey]) {
      if (shouldRevertOnFailure) {
        revert AgreementDoesNotExist(rewardsProvider, rewardsConsumer);
      }
      emit ReferralFailed(
        rewardsProvider,
        rewardsConsumer,
        user,
        'AgreementDoesNotExist'
      );
      return false;
    }

    // Skip if user is already referred to this provider
    if (_userReferrals[user][providerId] != 0) {
      if (shouldRevertOnFailure) {
        revert UserAlreadyReferred(rewardsProvider, rewardsConsumer, user);
      }
      emit ReferralFailed(
        rewardsProvider,
        rewardsConsumer,
        user,
        'UserAlreadyReferred'
      );
      return false;
    }

    // Add referral
    _userReferrals[user][providerId] = consumerId;
    emit ReferralRegistered(rewardsProvider, rewardsConsumer, user);
    return true;
  }

  function registerReferral(
    address user,
    bytes memory userSignature,
    address rewardsConsumer,
    address rewardsProvider
  ) external returns (bool success) {
    return
      _registerReferral(
        user,
        userSignature,
        rewardsConsumer,
        rewardsProvider,
        true
      );
  }

  /**
   * @notice Registers multiple users as being referred to rewards agreements
   * @dev Each referral is processed independently. Failed referrals emit events but don't revert the transaction.
   * @param referrals Array of Referral structs containing user addresses, signatures, and entity addresses
   * @return success Array of boolean values indicating whether each referral was successfully registered
   */
  function batchRegisterReferrals(
    Referral[] calldata referrals
  ) external returns (bool[] memory success) {
    success = new bool[](referrals.length);

    for (uint256 i = 0; i < referrals.length; i++) {
      success[i] = _registerReferral(
        referrals[i].user,
        referrals[i].userSignature,
        referrals[i].rewardsConsumer,
        referrals[i].rewardsProvider,
        false
      );
    }
  }

  /**
   * @notice Get the consumer address for a given user and provider
   * @param user The address of the user
   * @param rewardsProvider The address of the rewards provider entity
   * @return The address of the consumer
   */
  function getReferringConsumer(
    address user,
    address rewardsProvider
  ) external view returns (address) {
    return _idToEntity[_userReferrals[user][_entityToId[rewardsProvider]]];
  }
}
