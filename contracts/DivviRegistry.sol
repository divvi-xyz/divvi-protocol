// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRulesUpgradeable} from '@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {ERC2771ContextUpgradeable} from '@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol';
import {ContextUpgradeable} from '@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {MessageHashUtils} from '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';
import {IERC1271} from '@openzeppelin/contracts/interfaces/IERC1271.sol';

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
    string chainId;
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
    string chainId;
  }

  /**
   * @notice Off-chain message data for referral verification
   * @dev Encapsulates all signature-related data for better type safety and extensibility
   */
  struct OffchainMessageData {
    OffchainMessageType messageType;
    bytes message;
    bytes signature;
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
    USER_ALREADY_REFERRED,
    INVALID_SIGNATURE
  }

  // EIP-1271 magic value for valid signatures
  bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

  // Entities storage
  mapping(address => EntityData) private _entities;

  // Agreement storage
  mapping(bytes32 => bool) private _agreements; // keccak256(provider, consumer) => true (if agreement exists)

  // Referral tracking
  mapping(bytes32 => address) private _registeredReferrals; // keccak256(user, provider) => consumer

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
    string chainId,
    bytes32 txHash
  );
  event ReferralSkipped(
    address indexed user,
    address indexed rewardsProvider,
    address indexed rewardsConsumer,
    string chainId,
    bytes32 txHash,
    ReferralStatus status
  );

  // Errors
  error EntityAlreadyExists(address entity);
  error EntityDoesNotExist(address entity);
  error AgreementAlreadyExists(address provider, address consumer);
  error ProviderRequiresApproval(address provider);
  error InvalidSignature(address user, bytes signature);

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

    _entities[msgSender] = EntityData({
      exists: true,
      requiresApproval: requiresApproval
    });
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
        referral.rewardsConsumer,
        OffchainMessageData({
          messageType: OffchainMessageType.NONE,
          message: '',
          signature: ''
        })
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
   * For off-chain referrals, it validates the signature on-chain for transparency, but trusts that the caller (with REFERRAL_REGISTRAR_ROLE)
   * has already verified the content of `offchainMessage` to ensure it represents a valid referral intent (e.g., contains a specific tag).
   * A future upgrade will incorporate this content validation fully on-chain.
   * @param referrals Array of referral data to register
   */
  function batchRegisterReferral(
    ReferralDataV2[] calldata referrals
  ) external onlyRole(REFERRAL_REGISTRAR_ROLE) {
    for (uint256 i = 0; i < referrals.length; i++) {
      ReferralDataV2 calldata referral = referrals[i];

      // Determine if this is an off-chain signature-based referral
      bool isSignatureBased = referral.offchainMessage.signature.length > 0;

      // Set event values based on referral type
      string memory eventChainId = isSignatureBased
        ? 'offchain'
        : referral.onchainTx.chainId;
      bytes32 eventTxHash = isSignatureBased
        ? bytes32(0)
        : referral.onchainTx.txHash;

      // Process the referral (including signature verification if applicable)
      ReferralStatus status = _registerReferral(
        referral.user,
        referral.rewardsProvider,
        referral.rewardsConsumer,
        referral.offchainMessage
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
   * @notice Verify a signature for referral consent
   * @param user The user address that should have signed
   * @param offchainMessage The off-chain message data containing message, signature, and type
   * @return valid Whether the signature is valid
   */
  function _verifyReferralSignature(
    address user,
    OffchainMessageData memory offchainMessage
  ) internal view returns (bool valid) {
    bytes32 messageHash;

    if (offchainMessage.messageType == OffchainMessageType.ETH_SIGNED_MESSAGE) {
      // Create message hash (Ethereum signed message format)
      messageHash = MessageHashUtils.toEthSignedMessageHash(
        offchainMessage.message
      );
    } else {
      // Invalid message type for signature verification
      return false;
    }

    // Check if user is a contract (potential smart wallet)
    if (user.code.length > 0) {
      // Try EIP-1271 verification for smart contracts
      try
        IERC1271(user).isValidSignature(messageHash, offchainMessage.signature)
      returns (bytes4 magicValue) {
        return magicValue == EIP1271_MAGIC_VALUE;
      } catch {
        return false;
      }
    } else {
      // Standard ECDSA verification for EOAs using OpenZeppelin's tryRecover
      (address recoveredSigner, ECDSA.RecoverError error, ) = ECDSA.tryRecover(
        messageHash,
        offchainMessage.signature
      );

      // Check if recovery was successful and signer matches expected user
      return error == ECDSA.RecoverError.NoError && recoveredSigner == user;
    }
  }

  /**
   * @notice Register a user as being referred to a rewards agreement
   * @dev Internal function that returns status instead of emitting events. Handles signature verification if provided.
   * @param user The address of the user being referred
   * @param rewardsProvider The address of the rewards provider entity
   * @param rewardsConsumer The address of the rewards consumer entity
   * @param offchainMessage Off-chain message data for referrals
   * @return status The status of the referral registration
   */
  function _registerReferral(
    address user,
    address rewardsProvider,
    address rewardsConsumer,
    OffchainMessageData memory offchainMessage
  ) internal returns (ReferralStatus status) {
    // Verify signature if provided
    if (offchainMessage.signature.length > 0) {
      if (!_verifyReferralSignature(user, offchainMessage)) {
        return ReferralStatus.INVALID_SIGNATURE;
      }
    }

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
