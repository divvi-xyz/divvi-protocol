// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

contract DataAvailability is AccessControlDefaultAdminRules {
  /**
     * @dev DataAvailability stores information about the objective function value for users
     * across timestamps.
     * 
     * The contract creator and any permitted uploaders may upload user objective function data
     * at a given timestamp. The objective function data that are uploaded represent the delta
     * between the objective function value at the current timestamp and the value at the
     * previous timestamp that data was uploaded. The data is not actually stored in the contract,
     * but events are emitted for each upload, which can be used to reconstruct the full data history.
     *
     * Instead of storing all data in the contract, a rolling hash of the data is calculated and stored
     * for each timestamp. When verifying the data, the submitted proof will contain a hash of the data
     * computed in a trusted zkVM; if the hash contained in the proof matches the hash stored in the contract,
     * the data is considered valid.

     * The rolling hash is calculated by summing the existing hash for a given timestamp with the hash of each
     * user:value pair modulo 2^256 as they are received by the contract. Since modular addition is both commutative and associative, this
     * results in a hash that is invariant to the order of uploads. Since we cannot "remove" information about
     * a data entry from the hash, we require that information about a user:value pair is only submitted once
     * per timestamp, to ensure that the hash is correct.
     *
     * The intended usage pattern of this contract is as follows:
     * - For a given timestamp t_1, changes in objective function values since the last timestamp t_0 are calculated.
     * - These data are submitted to the contract, and a rolling hash is calculated.
     * - The contract emits events for each upload, which can be used to reconstruct the full data history.
     * - These data are used by an off-chain reward distribution service to calculate rewards owed for the
     *   period between t_0 and t_1.
     */

  // Role for authorized uploaders
  bytes32 public constant UPLOADER_ROLE = keccak256('UPLOADER_ROLE');

  // Address of the contract creator
  address public immutable creator;

  // Mapping to store the rolling hash for each timestamp
  mapping(uint256 => bytes32) private timestampHashes;

  // Array to store timestamps that have data, sorted in ascending order
  uint256[] private timestamps;

  // Mapping to track the most recent timestamp for each user
  mapping(address => uint256) private userLastTimestamp;

  // Events
  event DataUploaded(
    uint256 timestamp,
    address indexed uploader,
    address indexed user,
    uint256 value
  );

  constructor() AccessControlDefaultAdminRules(0, msg.sender) {
    creator = msg.sender;
    // Grant the deployer the uploader role
    _grantRole(UPLOADER_ROLE, msg.sender);
  }

  /**
   * @dev Override to prevent the creator from losing their uploader role
   */
  function revokeRole(bytes32 role, address account) public virtual override {
    require(
      !(role == UPLOADER_ROLE && account == creator),
      'Cannot revoke uploader role from creator'
    );
    super.revokeRole(role, account);
  }

  /**
   * @dev Override to prevent the creator from losing their uploader role
   */
  function renounceRole(bytes32 role, address account) public virtual override {
    require(
      !(role == UPLOADER_ROLE && account == creator),
      'Creator cannot renounce uploader role'
    );
    super.renounceRole(role, account);
  }

  /**
   * @dev Insert a timestamp into the sorted array
   * @param timestamp The timestamp to insert
   * @notice This function assumes timestamps are non-decreasing and only called for new timestamps
   */
  function insertTimestamp(uint256 timestamp) private {
    // If this is the first timestamp or the new timestamp is greater than the last one,
    // simply append it to the array
    if (
      timestamps.length == 0 || timestamp > timestamps[timestamps.length - 1]
    ) {
      timestamps.push(timestamp);
    }
    // If the timestamp equals the last one, we don't need to do anything
    // as it's already in the array
  }

  /**
   * @dev Upload data for multiple users at a given timestamp
   * @param timestamp The timestamp for which the data is being uploaded
   * @param users Array of user addresses
   * @param values Array of corresponding values
   * @notice The timestamp must be greater than the most recent timestamp with data
   * @notice Each user can only have one data point per timestamp
   */
  function uploadData(
    uint256 timestamp,
    address[] calldata users,
    uint256[] calldata values
  ) external onlyRole(UPLOADER_ROLE) {
    require(users.length == values.length, 'Arrays length mismatch');

    // Ensure the timestamp is greater than the most recent timestamp
    if (timestamps.length > 0) {
      require(
        timestamp >= timestamps[timestamps.length - 1],
        'Timestamp must be greater than or equal to most recent timestamp'
      );
    }

    bytes32 currentHash = this.getHash(timestamp);

    for (uint256 i = 0; i < users.length; i++) {
      // Check if this user already has data at this timestamp
      require(
        userLastTimestamp[users[i]] != timestamp,
        'User already has data at this timestamp'
      );

      // Calculate the hash for this user:value pair
      bytes32 pairHash = keccak256(abi.encodePacked(users[i], values[i]));
      // Sum the hashes and take modulo 2^256
      currentHash = bytes32(
        addmod(uint256(pairHash), uint256(currentHash), type(uint256).max)
      );

      // Update the most recent timestamp for this user
      if (timestamp > userLastTimestamp[users[i]]) {
        userLastTimestamp[users[i]] = timestamp;
      }

      emit DataUploaded(timestamp, msg.sender, users[i], values[i]);
    }

    // Add timestamp to the array if it's new
    if (!this.hasDataForTimestamp(timestamp)) {
      insertTimestamp(timestamp);
    }

    // Update the stored hash for the given timestamp
    timestampHashes[timestamp] = currentHash;
  }

  /**
   * @dev Get the stored hash for a given timestamp
   * @param timestamp The timestamp to query
   * @return The stored hash for the given timestamp
   */
  function getHash(uint256 timestamp) external view returns (bytes32) {
    return timestampHashes[timestamp];
  }

  /**
   * @dev Check if data exists for a given timestamp
   * @param timestamp The timestamp to check
   * @return true if data exists for the timestamp, false otherwise
   */
  function hasDataForTimestamp(uint256 timestamp) external view returns (bool) {
    return timestampHashes[timestamp] != bytes32(0);
  }

  /**
   * @dev Get all timestamps that have data. Not strictly necessary, since events are emitted for each upload.
   * @return An array of timestamps that have data, sorted in ascending order
   */
  function getAllTimestamps() external view returns (uint256[] memory) {
    return timestamps;
  }

  /**
   * @dev Get the most recent timestamp for which data exists for a user
   * @param user The address to query
   * @return The most recent timestamp with data for the user, or 0 if no data exists
   */
  function getLastTimestamp(address user) external view returns (uint256) {
    return userLastTimestamp[user];
  }

  /**
   * @dev Grant uploader role to an address
   * @param uploader The address to grant the uploader role to
   */
  function grantUploaderRole(
    address uploader
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _grantRole(UPLOADER_ROLE, uploader);
  }

  /**
   * @dev Revoke uploader role from an address
   * @param uploader The address to revoke the uploader role from
   */
  function revokeUploaderRole(
    address uploader
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(uploader != creator, 'Cannot revoke uploader role from creator');
    _revokeRole(UPLOADER_ROLE, uploader);
  }

  /**
   * @dev Check if an address has the uploader role
   * @param account The address to check
   * @return true if the address has the uploader role, false otherwise
   */
  function isUploader(address account) external view returns (bool) {
    return hasRole(UPLOADER_ROLE, account);
  }
}
