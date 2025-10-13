// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {ERC2771ContextUpgradeable} from '@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol';
import {ContextUpgradeable} from '@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol';
import {EnumerableSet} from '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

/**
 * @title DivviRegistry
 * @notice A registry contract for managing Divvi entities and agreements
 */
contract DivviRegistry is
  Initializable,
  AccessControlDefaultAdminRulesUpgradeable,
  UUPSUpgradeable,
  ERC2771ContextUpgradeable
{
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.StringSet;

  // Data structs
  struct EntityData {
    bool exists;
    bool requiresApproval;
    // Claim delegation fields (for cross-chain claiming)
    mapping(string => address) claimDelegates; // chainId => delegate address (for O(1) lookup)
    EnumerableSet.StringSet claimDelegatesChainIds; // set of chainIds for O(1) add/remove/contains and enumeration
    // fields can be added here in a future upgrade if needed
    // this is upgrade safe as long as `EntityData` is only used in a mapping
  }

  struct ReferralData {
    address user;
    address rewardsProvider;
    address rewardsConsumer;
    bytes32 txHash;
    string chainId; // CAIP-2 format
  }

  enum OffchainMessageType {
    NONE, // For on-chain referrals
    ETH_SIGNED_MESSAGE // Standard Ethereum signed message format
    // EIP_712 // TODO: EIP-712 typed data (not yet implemented)
  }

  /**
   * @notice On-chain transaction data for referral verification
   * @dev Encapsulates transaction-related data for on-chain referrals
   */
  struct OnchainTxData {
    bytes32 txHash;
    string chainId; // CAIP-2 format
  }

  /**
   * @notice Off-chain message data for referral verification
   * @dev Encapsulates all signature-related data for better type safety and extensibility
   */
  struct OffchainMessageData {
    OffchainMessageType messageType;
    bytes message;
    bytes signature;
    string chainId; // CAIP-2 format (mostly for EIP-1271 external signature verification)
  }

  /**
   * @notice Referral data structure supporting both on-chain and off-chain referrals
   * @dev Two types of referrals:
   * 1. On-chain referrals:
   *    - onchainTx: Contains transaction hash and chain ID
   *    - offchainMessage.messageType: NONE
   * 2. Off-chain referrals:
   *    - offchainMessage: Contains message, signature, and message type
   */
  struct ReferralDataV2 {
    address user;
    address rewardsProvider;
    address rewardsConsumer;
    OnchainTxData onchainTx; // For on-chain referrals
    OffchainMessageData offchainMessage; // For off-chain referrals
  }

  enum ReferralStatus {
    SUCCESS,
    ENTITY_NOT_FOUND,
    AGREEMENT_NOT_FOUND,
    USER_ALREADY_REFERRED
  }

  struct ClaimDelegation {
    string chainId; // CAIP-2 format
    address delegate;
  }

  // Entities storage
  mapping(address => EntityData) private _entities;

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(provider, consumer) => true (if agreement exists)

  // Referral tracking
  mapping(bytes32 => address) private _registeredReferrals; // keccak256(user, provider) => consumer

  // Claim delegation reverse lookup: claim delegate => set of entities that have delegated to it
  // Note: Forward lookup (entity => claim delegates) is stored in EntityData.claimDelegates
  mapping(address => EnumerableSet.AddressSet) private _entitiesByClaimDelegate;

  // Role constants
  bytes32 public constant REFERRAL_REGISTRAR_ROLE =
    keccak256('REFERRAL_REGISTRAR_ROLE');

  /**
   * @notice Role identifier for trusted forwarders compliant with ERC-2771.
   * @dev Addresses granted this role are recognized by `isTrustedForwarder` and can relay meta-transactions,
   * affecting the result of `_msgSender()`. Crucially, this role should ONLY be granted to audited,
   * immutable forwarder contracts to prevent security risks like context manipulation or unauthorized actions.
   */
  bytes32 public constant TRUSTED_FORWARDER_ROLE =
    keccak256('TRUSTED_FORWARDER_ROLE');

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
    string chainId, // CAIP-2 format
    bytes32 txHash
  );
  event ReferralSkipped(
    address indexed user,
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    string chainId, // CAIP-2 format
    bytes32 txHash,
    ReferralStatus status
  );
  event ClaimDelegateSet(
    address indexed entity,
    address indexed delegate,
    string chainId
  );
  event ClaimDelegateRemoved(
    address indexed entity,
    address indexed delegate,
    string chainId
  );

  // Errors
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error AgreementAlreadyExists(address provider, address consumer);
  error ProviderRequiresApproval(address provider);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() ERC2771ContextUpgradeable(address(0x0)) {
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
    address msgSender = _msgSender();
    if (_entities[msgSender].exists) {
      revert EntityAlreadyExists(msgSender);
    }

    // Set fields individually (cannot construct structs with mappings/sets)
    _entities[msgSender].exists = true;
    _entities[msgSender].requiresApproval = requiresApproval;
    // claimDelegates and claimDelegatesChainIds are automatically initialized as empty

    emit RewardsEntityRegistered(msgSender, requiresApproval);
  }

  /**
   * @notice Set whether a Rewards Entity requires approval for agreements
   * @param requiresApproval Whether the entity requires approval
   */
  function setRequiresApprovalForRewardsAgreements(
    bool requiresApproval
  ) external entityExists(_msgSender()) {
    address msgSender = _msgSender();
    _entities[msgSender].requiresApproval = requiresApproval;
    emit RequiresApprovalForRewardsAgreements(msgSender, requiresApproval);
  }

  /**
   * @notice Register a Rewards Consumer - Rewards Provider relationship
   * @dev Should be called by the Rewards Consumer
   * @param rewardsProvider The provider entity address
   */
  function registerAgreementAsConsumer(
    address rewardsProvider
  ) external entityExists(rewardsProvider) entityExists(_msgSender()) {
    // If the provider requires approval, revert the transaction
    if (_entities[rewardsProvider].requiresApproval) {
      revert ProviderRequiresApproval(rewardsProvider);
    }

    address msgSender = _msgSender();
    // Check if agreement already exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(rewardsProvider, msgSender)
    );
    if (_agreements[agreementKey]) {
      revert AgreementAlreadyExists(rewardsProvider, msgSender);
    }

    _agreements[agreementKey] = true;
    emit RewardsAgreementRegistered(rewardsProvider, msgSender);
  }

  /**
   * @notice Register a Rewards Consumer - Rewards Provider relationship
   * @dev Should be called by the Rewards Provider
   * @param rewardsConsumer The consumer entity address
   */
  function registerAgreementAsProvider(
    address rewardsConsumer
  ) external entityExists(rewardsConsumer) entityExists(_msgSender()) {
    address msgSender = _msgSender();
    // Check if agreement already exists
    bytes32 agreementKey = keccak256(
      abi.encodePacked(msgSender, rewardsConsumer)
    );
    if (_agreements[agreementKey]) {
      revert AgreementAlreadyExists(msgSender, rewardsConsumer);
    }

    // Create the agreement
    _agreements[agreementKey] = true;
    emit RewardsAgreementRegistered(msgSender, rewardsConsumer);
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
        referral.rewardsConsumer
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
   * @notice Register multiple referrals in a single transaction with support for both on-chain and off-chain referrals
   * @dev Requires REFERRAL_REGISTRAR_ROLE.
   * For off-chain referrals, the contract trusts that the caller (with REFERRAL_REGISTRAR_ROLE)
   * has already verified the signature and content of `offchainMessage` to ensure it represents a valid referral intent.
   * The signed message data is stored on-chain for auditability but not verified on-chain.
   * @param referrals Array of referral data to register
   */
  function batchRegisterReferral(
    ReferralDataV2[] calldata referrals
  ) external onlyRole(REFERRAL_REGISTRAR_ROLE) {
    for (uint256 i = 0; i < referrals.length; i++) {
      ReferralDataV2 calldata referral = referrals[i];

      bool isOffchainReferral = referral.offchainMessage.messageType !=
        OffchainMessageType.NONE;

      // Set event values based on referral type
      string memory eventChainId = isOffchainReferral
        ? referral.offchainMessage.chainId
        : referral.onchainTx.chainId;
      bytes32 eventTxHash = isOffchainReferral
        ? bytes32(0)
        : referral.onchainTx.txHash;

      // Process the referral
      ReferralStatus status = _registerReferral(
        referral.user,
        referral.rewardsProvider,
        referral.rewardsConsumer
      );

      // Emit appropriate event based on status
      if (status == ReferralStatus.SUCCESS) {
        emit ReferralRegistered(
          referral.user,
          referral.rewardsProvider,
          referral.rewardsConsumer,
          eventChainId,
          eventTxHash
        );
      } else {
        emit ReferralSkipped(
          referral.user,
          referral.rewardsProvider,
          referral.rewardsConsumer,
          eventChainId,
          eventTxHash,
          status
        );
      }
    }
  }

  /**
   * @notice Register a user as being referred to a rewards agreement
   * @dev Internal function that returns status instead of emitting events.
   * @param user The address of the user being referred
   * @param rewardsProvider The address of the rewards provider entity
   * @param rewardsConsumer The address of the rewards consumer entity
   * @return status The status of the referral registration
   */
  function _registerReferral(
    address user,
    address rewardsProvider,
    address rewardsConsumer
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

  // Claim delegation functions

  /**
   * @notice Set a claim delegate for a specific chain
   * @param delegate The address to delegate claiming to (use address(0) to remove)
   * @param chainId The chain ID in CAIP-2 format (e.g., "eip155:1" for Ethereum, "eip155:0" for all EVM chains)
   * @dev Only callable by registered entities
   */
  function setClaimDelegate(
    address delegate,
    string calldata chainId
  ) external entityExists(_msgSender()) {
    address msgSender = _msgSender();
    EntityData storage entity = _entities[msgSender];
    address previousDelegate = entity.claimDelegates[chainId];

    // Remove from previous delegate's delegators set only if not used on other chains
    if (previousDelegate != address(0) && previousDelegate != delegate) {
      // Check if previousDelegate is still used on any other chain
      bool stillUsedOnOtherChains = false;
      uint256 length = entity.claimDelegatesChainIds.length();
      for (uint256 i = 0; i < length; i++) {
        string memory otherChainId = entity.claimDelegatesChainIds.at(i);
        // Skip the current chainId we're updating
        if (keccak256(bytes(otherChainId)) != keccak256(bytes(chainId))) {
          if (entity.claimDelegates[otherChainId] == previousDelegate) {
            stillUsedOnOtherChains = true;
            break;
          }
        }
      }
      // Only remove from reverse lookup if not used on any other chain
      if (!stillUsedOnOtherChains) {
        _entitiesByClaimDelegate[previousDelegate].remove(msgSender);
      }
      emit ClaimDelegateRemoved(msgSender, previousDelegate, chainId);
    }

    // Update delegation
    entity.claimDelegates[chainId] = delegate;

    if (delegate != address(0)) {
      // Add new chainId to set if this is the first time setting it
      if (previousDelegate == address(0)) {
        entity.claimDelegatesChainIds.add(chainId);
      }
      _entitiesByClaimDelegate[delegate].add(msgSender);
      emit ClaimDelegateSet(msgSender, delegate, chainId);
    } else {
      // Remove chainId from set when delegation is removed
      entity.claimDelegatesChainIds.remove(chainId);
    }
  }

  /**
   * @notice Get the claim delegate for an entity on a specific chain
   * @param entity The entity address
   * @param chainId The chain ID in CAIP-2 format
   * @return delegate The delegate address, or address(0) if none set
   * @dev Checks chain-specific delegate first, then falls back to global ("eip155:0") for EVM chains only
   */
  function getClaimDelegate(
    address entity,
    string calldata chainId
  ) external view returns (address delegate) {
    EntityData storage entityData = _entities[entity];

    // Check chain-specific delegate first
    delegate = entityData.claimDelegates[chainId];
    if (delegate != address(0)) {
      return delegate;
    }

    // Fall back to global delegate (eip155:0) only for EVM chains
    if (
      bytes(chainId).length >= 7 &&
      bytes(chainId)[0] == 'e' &&
      bytes(chainId)[1] == 'i' &&
      bytes(chainId)[2] == 'p' &&
      bytes(chainId)[3] == '1' &&
      bytes(chainId)[4] == '5' &&
      bytes(chainId)[5] == '5' &&
      bytes(chainId)[6] == ':'
    ) {
      return entityData.claimDelegates['eip155:0'];
    }

    return address(0);
  }

  /**
   * @notice Get all claim delegations for an entity
   * @param entity The entity address
   * @return delegations Array of ClaimDelegation structs containing chainId and delegate pairs
   * @dev Used by UI to show all delegations for an entity
   */
  function getAllClaimDelegations(
    address entity
  ) external view returns (ClaimDelegation[] memory delegations) {
    EntityData storage entityData = _entities[entity];
    uint256 length = entityData.claimDelegatesChainIds.length();

    delegations = new ClaimDelegation[](length);

    for (uint256 i = 0; i < length; i++) {
      string memory chainId = entityData.claimDelegatesChainIds.at(i);
      delegations[i] = ClaimDelegation({
        chainId: chainId,
        delegate: entityData.claimDelegates[chainId]
      });
    }
  }

  /**
   * @notice Get all entities that have delegated to a specific address
   * @param delegate The delegate address
   * @return entities Array of entity addresses that have delegated to this address
   * @dev Used by UI to show "You are a delegate for: [entities]"
   */
  function getEntitiesDelegatingTo(
    address delegate
  ) external view returns (address[] memory entities) {
    return _entitiesByClaimDelegate[delegate].values();
  }

  // ERC2771Context overrides

  /**
   * @notice Check if a forwarder is trusted
   * @param forwarder The address of the forwarder to check
   * @return isTrusted Whether the forwarder is trusted
   * @dev Overridden to use the TRUSTED_FORWARDER_ROLE for checking trusted forwarders.
   */
  function isTrustedForwarder(
    address forwarder
  ) public view override(ERC2771ContextUpgradeable) returns (bool) {
    return hasRole(TRUSTED_FORWARDER_ROLE, forwarder);
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _msgSender()
    internal
    view
    virtual
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (address sender)
  {
    return super._msgSender();
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _msgData()
    internal
    view
    virtual
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (bytes calldata)
  {
    return super._msgData();
  }

  /**
   * @dev Override required due to multiple inheritance.
   */
  function _contextSuffixLength()
    internal
    view
    virtual
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (uint256)
  {
    return super._contextSuffixLength();
  }
}
