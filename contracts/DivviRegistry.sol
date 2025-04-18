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
  struct EntityData {
    bool exists;
    bool requiresApproval;
    // fields can be added here in a future upgrade if needed
    // this is upgrade safe as long as `EntityData` is only used in a mapping
  }

  // Entities storage
  mapping(address => EntityData) private _entities;

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(provider, consumer) => true (if agreement exists)

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

  // Errors
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error AgreementAlreadyExists(address provider, address consumer);
  error ProviderRequiresApproval(address provider);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initialize the contract with an owner and transfer delay
   * @param owner The address that will have the DEFAULT_ADMIN_ROLE
   * @param transferDelay The delay in seconds before admin role can be transferred
   */
  function initialize(address owner, uint48 transferDelay) public initializer {
    __AccessControlDefaultAdminRules_init(transferDelay, owner);
    __UUPSUpgradeable_init();
  }

  /**
   * @notice Authorize contract upgrades
   */
  function _authorizeUpgrade(
    address
  ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {} // solhint-disable-line no-empty-blocks

  /**
   * @notice Modifier to ensure an entity exists
   * @param entity The entity address to check
   */
  modifier entityExists(address entity) {
    if (!_entities[entity].exists) {
      revert EntityDoesNotExist(entity);
    }
    _;
  }

  /**
   * @notice Register the caller as a new rewards entity
   * @param requiresApproval Whether the entity requires approval for agreements
   */
  function registerRewardsEntity(bool requiresApproval) external {
    if (_entities[msg.sender].exists) {
      revert EntityAlreadyExists(msg.sender);
    }

    _entities[msg.sender] = EntityData({
      exists: true,
      requiresApproval: requiresApproval
    });
    emit RewardsEntityRegistered(msg.sender, requiresApproval);
  }

  /**
   * @notice Set whether a Rewards Entity requires approval for agreements
   * @param requiresApproval Whether the entity requires approval
   */
  function setRequiresApprovalForRewardsAgreements(
    bool requiresApproval
  ) external entityExists(msg.sender) {
    _entities[msg.sender].requiresApproval = requiresApproval;
    emit RequiresApprovalForRewardsAgreements(msg.sender, requiresApproval);
  }

  /**
   * @notice Register a Rewards Consumer - Rewards Provider relationship
   * @dev Should be called by the Rewards Consumer
   * @param rewardsProvider The provider entity address
   */
  function registerAgreementAsConsumer(
    address rewardsProvider
  ) external entityExists(rewardsProvider) entityExists(msg.sender) {
    // If the provider requires approval, revert the transaction
    if (_entities[rewardsProvider].requiresApproval) {
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
   * @notice Register a Rewards Consumer - Rewards Provider relationship
   * @dev Should be called by the Rewards Provider
   * @param rewardsConsumer The consumer entity address
   */
  function registerAgreementAsProvider(
    address rewardsConsumer
  ) external entityExists(rewardsConsumer) entityExists(msg.sender) {
    // Check if agreement already exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(msg.sender, rewardsConsumer)
    );
    if (_agreements[agreementKey]) {
      revert AgreementAlreadyExists(msg.sender, rewardsConsumer);
    }

    // Create the agreement
    _agreements[agreementKey] = true;
    emit RewardsAgreementRegistered(msg.sender, rewardsConsumer);
  }

  /**
   * @notice Check if an agreement exists between a consumer and provider
   * @param provider The provider entity address
   * @param consumer The consumer entity address
   * @return exists Whether the agreement exists
   */
  function hasAgreement(
    address provider,
    address consumer
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
    return _entities[entity].exists;
  }

  /**
   * @notice Check if an entity requires approval for agreements
   * @param entity The entity address to check
   * @return requiresApproval Whether the entity requires approval
   */
  function requiresApprovalForAgreements(
    address entity
  ) external view returns (bool requiresApproval) {
    return _entities[entity].requiresApproval;
  }
}
