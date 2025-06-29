// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentityVerificationHubV2} from '@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol';
import {SelfStructs} from '@selfxyz/contracts/contracts/libraries/SelfStructs.sol';
import {IRegisterCircuitVerifier} from '@selfxyz/contracts/contracts/interfaces/IRegisterCircuitVerifier.sol';
import {IDscCircuitVerifier} from '@selfxyz/contracts/contracts/interfaces/IDscCircuitVerifier.sol';

/**
 * @title MockIdentityVerificationHubV2
 * @notice Mock implementation of Self protocol's Identity Verification Hub V2 for testing
 * @dev Only implements the functions needed for our entity verification contract testing
 */
contract MockIdentityVerificationHubV2 is IIdentityVerificationHubV2 {
  // Storage for mock data
  mapping(bytes32 => bool) private _configExists;
  mapping(bytes32 => address) private _registries;
  mapping(bytes32 => address) private _discloseVerifiers;

  // Events for testing
  event ConfigGenerated(
    bytes32 indexed configId,
    SelfStructs.VerificationConfigV2 config
  );
  event VerificationCalled(bytes baseVerificationInput, bytes userContextData);

  /**
   * @notice Generates a config ID from a verification config (same logic as real Self protocol)
   * @param config The verification configuration
   * @return The generated config ID (sha256 hash of encoded config)
   */
  function generateConfigId(
    SelfStructs.VerificationConfigV2 memory config
  ) external pure override returns (bytes32) {
    return sha256(abi.encode(config));
  }

  /**
   * @notice Mock implementation of verify function
   * @param baseVerificationInput The base verification input data
   * @param userContextData The user context data
   */
  function verify(
    bytes calldata baseVerificationInput,
    bytes calldata userContextData
  ) external override {
    emit VerificationCalled(baseVerificationInput, userContextData);
    // In a real test, you might want to decode and validate the input
    // For now, we just emit an event to show it was called
  }

  /**
   * @notice Sets verification config in V2 storage (mock implementation)
   * @param config The verification configuration
   * @return configId The generated config ID
   */
  function setVerificationConfigV2(
    SelfStructs.VerificationConfigV2 memory config
  ) external override returns (bytes32 configId) {
    configId = sha256(abi.encode(config));
    _configExists[configId] = true;
    emit ConfigGenerated(configId, config);
    return configId;
  }

  /**
   * @notice Checks if a verification config exists (mock implementation)
   * @param configId The configuration identifier
   * @return exists Whether the config exists
   */
  function verificationConfigV2Exists(
    bytes32 configId
  ) external view override returns (bool exists) {
    return _configExists[configId];
  }

  // Mock implementations of other interface functions (minimal for testing)
  function registerCommitment(
    bytes32 attestationId,
    uint256 registerCircuitVerifierId,
    IRegisterCircuitVerifier.RegisterCircuitProof memory registerCircuitProof
  ) external override {
    // Mock implementation - do nothing
  }

  function registerDscKeyCommitment(
    bytes32 attestationId,
    uint256 dscCircuitVerifierId,
    IDscCircuitVerifier.DscCircuitProof memory dscCircuitProof
  ) external override {
    // Mock implementation - do nothing
  }

  function updateRegistry(
    bytes32 attestationId,
    address registryAddress
  ) external override {
    _registries[attestationId] = registryAddress;
  }

  function updateVcAndDiscloseCircuit(
    bytes32 attestationId,
    address vcAndDiscloseCircuitVerifierAddress
  ) external override {
    _discloseVerifiers[attestationId] = vcAndDiscloseCircuitVerifierAddress;
  }

  function updateRegisterCircuitVerifier(
    bytes32 attestationId,
    uint256 typeId,
    address verifierAddress
  ) external override {
    // Mock implementation - do nothing
  }

  function updateDscVerifier(
    bytes32 attestationId,
    uint256 typeId,
    address verifierAddress
  ) external override {
    // Mock implementation - do nothing
  }

  function batchUpdateRegisterCircuitVerifiers(
    bytes32[] calldata attestationIds,
    uint256[] calldata typeIds,
    address[] calldata verifierAddresses
  ) external override {
    // Mock implementation - do nothing
  }

  function batchUpdateDscCircuitVerifiers(
    bytes32[] calldata attestationIds,
    uint256[] calldata typeIds,
    address[] calldata verifierAddresses
  ) external override {
    // Mock implementation - do nothing
  }

  // View functions
  function registry(
    bytes32 attestationId
  ) external view override returns (address) {
    return _registries[attestationId];
  }

  function discloseVerifier(
    bytes32 attestationId
  ) external view override returns (address) {
    return _discloseVerifiers[attestationId];
  }

  function registerCircuitVerifiers(
    bytes32 attestationId,
    uint256 typeId
  ) external view override returns (address) {
    return address(0); // Mock implementation
  }

  function dscCircuitVerifiers(
    bytes32 attestationId,
    uint256 typeId
  ) external view override returns (address) {
    return address(0); // Mock implementation
  }

  function rootTimestamp(
    bytes32 attestationId,
    uint256 root
  ) external view override returns (uint256) {
    return 0; // Mock implementation
  }

  function getIdentityCommitmentMerkleRoot(
    bytes32 attestationId
  ) external view override returns (uint256) {
    return 0; // Mock implementation
  }
}
