// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SelfVerificationRoot} from '@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol';
import {ISelfVerificationRoot} from '@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol';
import {SelfStructs} from '@selfxyz/contracts/contracts/libraries/SelfStructs.sol';
import {AccessControlDefaultAdminRules} from '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

/**
 * @title DivviEntityVerification
 * @notice A contract for verifying entity identities using Self protocol
 * @dev Extends Self protocol's verification system to store verification status for Divvi entities
 */
contract DivviEntityVerification is
  SelfVerificationRoot,
  AccessControlDefaultAdminRules
{
  // Storage
  mapping(address => bool) private _verifiedEntities;
  mapping(uint256 => address) private _nullifierToEntity;
  mapping(address => uint256) private _entityToTimestamp;
  mapping(address => uint256) private _entityToNullifier;

  // Events
  event EntityVerified(
    address indexed entity,
    uint256 indexed nullifier,
    uint256 timestamp
  );

  // Errors
  error EntityAlreadyVerified(address entity);
  error NullifierAlreadyUsed(uint256 nullifier);

  /**
   * @notice Constructor to initialize the contract
   * @param _identityVerificationHub Address of Self protocol's Identity Verification Hub
   * @param _scope Application-specific identifier for this contract
   * @param _admin Address that will have admin role
   * @param _transferDelay Delay for admin role transfers
   */
  constructor(
    address _identityVerificationHub,
    uint256 _scope,
    address _admin,
    uint48 _transferDelay
  )
    SelfVerificationRoot(_identityVerificationHub, _scope)
    AccessControlDefaultAdminRules(_transferDelay, _admin)
  {}

  /**
   * @notice Generates a configId for the user
   * @dev Required implementation of SelfVerificationRoot abstract function
   * @return The configId
   */
  function getConfigId(
    bytes32 /* destinationChainId */,
    bytes32 /* userIdentifier */,
    bytes memory /* userDefinedData */
  ) public view override returns (bytes32) {
    // Create a hardcoded verification config for demo purposes
    // In production, you'd want to customize these settings based on your requirements
    SelfStructs.VerificationConfigV2 memory config = SelfStructs
      .VerificationConfigV2({
        olderThanEnabled: false, // Disable age verification
        olderThan: 18,
        forbiddenCountriesEnabled: false, // Disable country restrictions for demo
        forbiddenCountriesListPacked: [
          uint256(0),
          uint256(0),
          uint256(0),
          uint256(0)
        ], // Empty list
        ofacEnabled: [false, false, false] // Disable OFAC checks for demo
      });

    // Use the Self protocol hub to generate the config ID
    return _identityVerificationHubV2.generateConfigId(config);
  }

  /**
   * @notice Custom verification hook called after successful Self protocol verification
   * @dev This is where we implement our entity verification logic
   * @param output The verification output data containing disclosed identity information
   */
  function customVerificationHook(
    ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
    bytes memory /* userData */
  ) internal override {
    // Extract user address directly from the verified output
    address userAddress = address(uint160(output.userIdentifier));
    uint256 nullifier = output.nullifier;

    // Check if entity already verified
    if (_verifiedEntities[userAddress]) {
      revert EntityAlreadyVerified(userAddress);
    }

    // Check if nullifier already used (prevents same passport verifying multiple entities)
    if (_nullifierToEntity[nullifier] != address(0)) {
      revert NullifierAlreadyUsed(nullifier);
    }

    // Store verification status
    _verifiedEntities[userAddress] = true;
    _nullifierToEntity[nullifier] = userAddress;
    _entityToTimestamp[userAddress] = block.timestamp;
    _entityToNullifier[userAddress] = nullifier;

    emit EntityVerified(userAddress, nullifier, block.timestamp);
  }

  /**
   * @notice Check if an entity is verified
   * @param entity The entity address to check
   * @return isVerified True if the entity has been verified
   */
  function isEntityVerified(
    address entity
  ) external view returns (bool isVerified) {
    return _verifiedEntities[entity];
  }

  /**
   * @notice Get verification timestamp for an entity
   * @param entity The entity address to check
   * @return timestamp The timestamp when the entity was verified (0 if not verified)
   */
  function getVerificationTimestamp(
    address entity
  ) external view returns (uint256 timestamp) {
    return _entityToTimestamp[entity];
  }

  /**
   * @notice Get the nullifier for a verified entity
   * @param entity The entity address to check
   * @return nullifier The nullifier used for verification (0 if not verified)
   */
  function getEntityNullifier(
    address entity
  ) external view returns (uint256 nullifier) {
    return _entityToNullifier[entity];
  }

  /**
   * @notice Check verification status for multiple entities
   * @param entities Array of entity addresses to check
   * @return results Array of verification statuses corresponding to input entities
   */
  function areEntitiesVerified(
    address[] calldata entities
  ) external view returns (bool[] memory results) {
    results = new bool[](entities.length);
    for (uint256 i = 0; i < entities.length; i++) {
      results[i] = _verifiedEntities[entities[i]];
    }
  }

  /**
   * @notice Get detailed verification information for an entity
   * @param entity The entity address to check
   * @return isVerified True if the entity is verified
   * @return timestamp The verification timestamp
   * @return nullifier The nullifier used for verification
   */
  function getVerificationDetails(
    address entity
  )
    external
    view
    returns (bool isVerified, uint256 timestamp, uint256 nullifier)
  {
    isVerified = _verifiedEntities[entity];
    timestamp = _entityToTimestamp[entity];
    nullifier = _entityToNullifier[entity];
  }

  /**
   * @notice Get the entity address associated with a nullifier
   * @param nullifier The nullifier to query
   * @return entity The entity address associated with the nullifier
   */
  function getEntityByNullifier(
    uint256 nullifier
  ) external view returns (address entity) {
    return _nullifierToEntity[nullifier];
  }

  /**
   * @notice Check if a campaign should require verification for rewards
   * @dev This is a helper function for integration with reward systems
   * @param entities Array of entity addresses
   * @param requireVerification Whether verification is required
   * @return eligibleEntities Array of entities that meet the verification requirement
   */
  function getEligibleEntities(
    address[] calldata entities,
    bool requireVerification
  ) external view returns (address[] memory eligibleEntities) {
    if (!requireVerification) {
      // If verification not required, all entities are eligible
      eligibleEntities = entities;
      return eligibleEntities;
    }

    // Count verified entities first
    uint256 eligibleCount = 0;
    for (uint256 i = 0; i < entities.length; i++) {
      if (_verifiedEntities[entities[i]]) {
        eligibleCount++;
      }
    }

    // Create array of eligible entities
    eligibleEntities = new address[](eligibleCount);
    uint256 index = 0;
    for (uint256 i = 0; i < entities.length; i++) {
      if (_verifiedEntities[entities[i]]) {
        eligibleEntities[index] = entities[i];
        index++;
      }
    }
  }
}
