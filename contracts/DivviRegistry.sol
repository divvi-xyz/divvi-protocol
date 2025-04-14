// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

/**
 * @title DivviRegistry
 * @notice A registry contract for managing Divvi entities and agreements
 */
contract DivviRegistry is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable
{
  // Entities storage
  mapping(address => bool) private _entities; // entity => true (if entity exists)

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(provider, consumer) => true (if agreement exists)
  mapping(address => bool) private _requiresApproval; // entity => boolean (if entity requires approval)

  // Referral tracking
  mapping(bytes32 => address) private _userReferrals; // keccak256(user, provider) => consumer

  // Role constants
  bytes32 public constant REFERRAL_REGISTRAR_ROLE =
    keccak256('REFERRAL_REGISTRAR_ROLE');

  // Events
  event RewardsEntityRegistered(address indexed entity, bool requiresApproval);
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
    address indexed user,
    address indexed rewardsConsumer,
    address indexed rewardsProvider
  );

  // Errors
  error InvalidEntityAddress(address entity);
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error AgreementAlreadyExists(address provider, address consumer);
  error AgreementDoesNotExist(address provider, address consumer);
  error ProviderRequiresApproval(address provider);
  error UserAlreadyReferred(address provider, address consumer, address user);
  error MissingReferralRegistrarRole(address account);

  /// @custom:oz-upgrades-unsafe-allow constructor
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
   * @param entity The entity address to register
   * @param requiresApproval Whether the entity requires approval for agreements
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
    emit RewardsEntityRegistered(entity, requiresApproval);
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
   * @notice Register a Rewards Consumer - Rewards Provider relationship
   * @dev Should be called by the Rewards Consumer
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
   * @notice Approve a rewards agreement
   * @dev Should be called by the Rewards Provider
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
   * @notice Register a user as being referred to a rewards agreement
   * @dev Requires REFERRAL_REGISTRAR_ROLE
   * @param user The address of the user being referred
   * @param rewardsConsumer The address of the rewards consumer entity
   * @param rewardsProvider The address of the rewards provider entity
   */
  function registerReferral(
    address user,
    address rewardsConsumer,
    address rewardsProvider
  ) external entityExists(rewardsProvider) entityExists(rewardsConsumer) {
    if (!hasRole(REFERRAL_REGISTRAR_ROLE, msg.sender)) {
      revert MissingReferralRegistrarRole(msg.sender);
    }

    // Check if agreement exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(rewardsProvider, rewardsConsumer)
    );
    if (!_agreements[agreementKey]) {
      revert AgreementDoesNotExist(rewardsProvider, rewardsConsumer);
    }

    // Skip if user is already referred to this provider
    bytes32 referralKey = keccak256(abi.encodePacked(user, rewardsProvider));
    if (_userReferrals[referralKey] != address(0)) {
      revert UserAlreadyReferred(rewardsProvider, rewardsConsumer, user);
    }

    // Add referral
    _userReferrals[referralKey] = rewardsConsumer;
    emit ReferralRegistered(user, rewardsConsumer, rewardsProvider);
  }

  /**
   * @notice Check if an agreement exists between a consumer and provider
   * @param consumer The consumer entity address
   * @param provider The provider entity address
   * @return exists Whether the agreement exists
   */
  function agreementExists(
    address consumer,
    address provider
  ) external view returns (bool exists) {
    bytes32 agreementKey = keccak256(abi.encodePacked(provider, consumer));
    return _agreements[agreementKey];
  }

  /**
   * @notice Check if an entity is registered
   * @param entity The entity address to check
   * @return registered Whether the entity is registered
   */
  function isEntityRegistered(
    address entity
  ) external view returns (bool registered) {
    return _entities[entity];
  }

  /**
   * @notice Check if an entity requires approval for agreements
   * @param entity The entity address to check
   * @return requiresApproval Whether the entity requires approval
   */
  function requiresApprovalForAgreements(
    address entity
  ) external view returns (bool requiresApproval) {
    return _requiresApproval[entity];
  }

  /**
   * @notice Get the referring consumer for a user and provider
   * @param user The address of the user
   * @param provider The address of the provider entity
   * @return consumer The address of the referring consumer, or address(0) if the user has not been referred to the provider
   */
  function getReferringConsumer(
    address user,
    address provider
  ) external view returns (address consumer) {
    bytes32 referralKey = keccak256(abi.encodePacked(user, provider));
    return _userReferrals[referralKey];
  }
}
