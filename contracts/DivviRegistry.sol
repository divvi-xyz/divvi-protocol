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
  // Data structs
  struct EntityData {
    bool exists;
    bool requiresApproval;
    // fields can be added here in a future upgrade if needed
    // this is upgrade safe as long as `EntityData` is only used in a mapping
  }

  struct ReferralData {
    address user;
    address rewardsProvider;
    address rewardsConsumer;
    bytes32 txHash;
    uint256 chainId;
  }

  enum ReferralStatus {
    SUCCESS,
    ENTITY_NOT_FOUND,
    AGREEMENT_NOT_FOUND,
    USER_ALREADY_REFERRED
  }

  // Entities storage
  mapping(address => EntityData) private _entities;

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(provider, consumer) => true (if agreement exists)

  // Referral tracking
  mapping(bytes32 => address) private _registeredReferrals; // keccak256(user, provider) => consumer

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
  event ReferralRegistered(
    address indexed user,
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    uint256 chainId,
    bytes32 txHash
  );
  event ReferralSkipped(
    address indexed user,
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    uint256 chainId,
    bytes32 txHash,
    ReferralStatus status
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
   * @notice Register multiple referrals in a single transaction
   * @dev Requires REFERRAL_REGISTRAR_ROLE
   * @param referrals Array of referral data to register
   */
  function batchRegisterReferral(
    ReferralData[] calldata referrals
  ) external onlyRole(REFERRAL_REGISTRAR_ROLE) {
    for (uint256 i = 0; i < referrals.length; i++) {
      ReferralData calldata referral = referrals[i];

      // Process the referral and get the status
      ReferralStatus status = _registerReferral(
        referral.user,
        referral.rewardsProvider,
        referral.rewardsConsumer,
        referral.txHash,
        referral.chainId
      );

      // Emit appropriate event based on status
      if (status == ReferralStatus.SUCCESS) {
        emit ReferralRegistered(
          referral.user,
          referral.rewardsProvider,
          referral.rewardsConsumer,
          referral.chainId,
          referral.txHash
        );
      } else {
        emit ReferralSkipped(
          referral.user,
          referral.rewardsProvider,
          referral.rewardsConsumer,
          referral.chainId,
          referral.txHash,
          status
        );
      }
    }
  }

  /**
   * @notice Register a user as being referred to a rewards agreement
   * @dev Internal function that returns status instead of emitting events
   * @param user The address of the user being referred
   * @param rewardsProvider The address of the rewards provider entity
   * @param rewardsConsumer The address of the rewards consumer entity
   * @param txHash The hash of the transaction that initiated the referral
   * @param chainId The ID of the blockchain where the referral transaction occurred
   * @return status The status of the referral registration
   */
  function _registerReferral(
    address user,
    address rewardsProvider,
    address rewardsConsumer,
    bytes32 txHash,
    uint256 chainId
  ) internal returns (ReferralStatus status) {
    // Check if entities exist
    if (
      !_entities[rewardsProvider].exists || !_entities[rewardsConsumer].exists
    ) {
      return ReferralStatus.ENTITY_NOT_FOUND;
    }

    // Check if agreement exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(rewardsProvider, rewardsConsumer)
    );
    if (!_agreements[agreementKey]) {
      return ReferralStatus.AGREEMENT_NOT_FOUND;
    }

    // Check if user is already referred to this provider
    bytes32 referralKey = keccak256(abi.encodePacked(user, rewardsProvider));
    if (_registeredReferrals[referralKey] != address(0)) {
      return ReferralStatus.USER_ALREADY_REFERRED;
    }

    // Add referral
    _registeredReferrals[referralKey] = rewardsConsumer;
    return ReferralStatus.SUCCESS;
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
   * @notice Check if a rewards provider entity requires approval to form an agreement
   * @param entity The entity address to check
   * @return requiresApproval Whether the entity requires approval
   */
  function requiresApprovalForAgreements(
    address entity
  ) external view returns (bool requiresApproval) {
    return _entities[entity].requiresApproval;
  }

  /**
   * @notice Check if a user has been referred to a provider
   * @param user The address of the user
   * @param provider The address of the provider entity
   * @return isReferred Whether the user has been referred to the provider
   */
  function isUserReferredToProvider(
    address user,
    address provider
  ) external view returns (bool isReferred) {
    return getReferringConsumer(user, provider) != address(0);
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
  ) public view returns (address consumer) {
    bytes32 referralKey = keccak256(abi.encodePacked(user, provider));
    return _registeredReferrals[referralKey];
  }
}
