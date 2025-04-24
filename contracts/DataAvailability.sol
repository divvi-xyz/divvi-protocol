// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

contract DataAvailability is AccessControlDefaultAdminRules {
    // Role for authorized uploaders
    bytes32 public constant UPLOADER_ROLE = keccak256("UPLOADER_ROLE");

    // Address of the contract creator
    address public immutable creator;

    // Mapping to store data: timestamp => (address => value)
    mapping(uint256 => mapping(address => uint256)) private data;
    
    // Mapping to track which timestamps have data
    mapping(uint256 => bool) private timestampsWithData;
    
    // Array to store timestamps that have data, sorted in ascending order
    uint256[] private timestamps;
    
    // Mapping to track the most recent timestamp for each user
    mapping(address => uint256) private userLastTimestamp;

    // Events
    event DataUploaded(uint256 timestamp, address indexed entity, address indexed user, uint256 value);

    constructor() AccessControlDefaultAdminRules(0, msg.sender) {
        creator = msg.sender;
        // Grant the deployer the uploader role
        _grantRole(UPLOADER_ROLE, msg.sender);
    }

    /**
     * @dev Override to prevent the creator from losing their admin role
     */
    function beginDefaultAdminTransfer(address newAdmin) public virtual override {
        require(newAdmin != creator, "Cannot transfer admin role from creator");
        super.beginDefaultAdminTransfer(newAdmin);
    }

    /**
     * @dev Override to prevent the creator from losing their admin role
     */
    function acceptDefaultAdminTransfer() public virtual override {
        require(msg.sender != creator, "Creator cannot accept admin transfer");
        super.acceptDefaultAdminTransfer();
    }

    /**
     * @dev Override to prevent the creator from losing their admin role
     */
    function cancelDefaultAdminTransfer() public virtual override {
        require(msg.sender != creator, "Creator cannot cancel admin transfer");
        super.cancelDefaultAdminTransfer();
    }

    /**
     * @dev Override to prevent the creator from losing their uploader role
     */
    function revokeRole(bytes32 role, address account) public virtual override {
        require(
            !(role == UPLOADER_ROLE && account == creator),
            "Cannot revoke uploader role from creator"
        );
        super.revokeRole(role, account);
    }

    /**
     * @dev Override to prevent the creator from losing their uploader role
     */
    function renounceRole(bytes32 role, address account) public virtual override {
        require(
            !(role == UPLOADER_ROLE && account == creator),
            "Creator cannot renounce uploader role"
        );
        super.renounceRole(role, account);
    }

    /**
     * @dev Find the insertion point for a new timestamp in the sorted array
     * @param timestamp The timestamp to find the insertion point for
     * @return The index where the timestamp should be inserted
     */
    function findInsertionPoint(uint256 timestamp) private view returns (uint256) {
        if (timestamps.length == 0 || timestamp > timestamps[timestamps.length - 1]) {
            return timestamps.length;
        }
        
        uint256 left = 0;
        uint256 right = timestamps.length;
        
        while (left < right) {
            uint256 mid = (left + right) / 2;
            if (timestamps[mid] < timestamp) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return left;
    }

    /**
     * @dev Find the most recent timestamp that is less than or equal to the given timestamp
     * @param timestamp The timestamp to search for
     * @return The most recent timestamp that is less than or equal to the given timestamp, or 0 if none exists
     */
    function findMostRecentTimestamp(uint256 timestamp) private view returns (uint256) {
        if (timestamps.length == 0) {
            return 0;
        }

        // If the requested timestamp is after the last timestamp, return the last timestamp
        if (timestamp >= timestamps[timestamps.length - 1]) {
            return timestamps[timestamps.length - 1];
        }

        // Find the first timestamp that is greater than the requested timestamp
        uint256 index = findInsertionPoint(timestamp);
        
        // If the found timestamp is equal to the requested timestamp, return it
        if (index < timestamps.length && timestamps[index] == timestamp) {
            return timestamp;
        }
        
        // Otherwise, return the previous timestamp (if it exists)
        return index > 0 ? timestamps[index - 1] : 0;
    }

    /**
     * @dev Insert a timestamp into the sorted array
     * @param timestamp The timestamp to insert
     */
    function insertTimestamp(uint256 timestamp) private {
        uint256 insertIndex = findInsertionPoint(timestamp);
        
        // If the timestamp is already in the array, don't insert it
        if (insertIndex < timestamps.length && timestamps[insertIndex] == timestamp) {
            return;
        }
        
        // Add a new element to the end of the array
        timestamps.push(0);
        
        // Shift elements to make room for the new timestamp
        for (uint256 i = timestamps.length - 1; i > insertIndex; i--) {
            timestamps[i] = timestamps[i - 1];
        }
        
        // Insert the new timestamp
        timestamps[insertIndex] = timestamp;
    }

    /**
     * @dev Upload data for multiple users at a given timestamp
     * @param timestamp The timestamp for which the data is being uploaded
     * @param users Array of user addresses
     * @param values Array of corresponding values
     */
    function uploadBatchData(
        uint256 timestamp,
        address[] calldata users,
        uint256[] calldata values
    ) external onlyRole(UPLOADER_ROLE) {
        require(users.length == values.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            data[timestamp][users[i]] = values[i];
            // Update the most recent timestamp for this user
            if (timestamp > userLastTimestamp[users[i]]) {
                userLastTimestamp[users[i]] = timestamp;
            }
            emit DataUploaded(timestamp, msg.sender, users[i], values[i]);
        }
        
        // Add timestamp to the array if it's new
        if (!timestampsWithData[timestamp]) {
            timestampsWithData[timestamp] = true;
            insertTimestamp(timestamp);
        }
    }

    /**
     * @dev Get the value for a specific address at a given timestamp
     * @param timestamp The timestamp to query
     * @param user The address to query
     * @return The stored value for the given address and timestamp, or the most recent value if not available
     */
    function getData(uint256 timestamp, address user) external view returns (uint256) {
        // If data exists for the requested timestamp, return it
        if (data[timestamp][user] != 0 || timestampsWithData[timestamp]) {
            return data[timestamp][user];
        }
        
        // If no data exists for this user at all, return 0
        if (userLastTimestamp[user] == 0) {
            return 0;
        }
        
        // If the requested timestamp is after the user's last data point, return the last value
        if (timestamp > userLastTimestamp[user]) {
            return data[userLastTimestamp[user]][user];
        }
        
        // Find the most recent timestamp before or equal to the requested timestamp
        uint256 mostRecentTimestamp = findMostRecentTimestamp(timestamp);
        if (mostRecentTimestamp > 0) {
            return data[mostRecentTimestamp][user];
        }
        
        return 0;
    }

    /**
     * @dev Check if data exists for a given timestamp
     * @param timestamp The timestamp to check
     * @return true if data exists for the timestamp, false otherwise
     */
    function hasDataForTimestamp(uint256 timestamp) external view returns (bool) {
        return timestampsWithData[timestamp];
    }

    /**
     * @dev Get all timestamps that have data
     * @return An array of timestamps that have data, sorted in ascending order
     */
    function getAllTimestamps() external view returns (uint256[] memory) {
        return timestamps;
    }

    /**
     * @dev Get timestamps that have data within a range
     * @param start The start of the range (inclusive)
     * @param end The end of the range (inclusive)
     * @return An array of timestamps that have data within the range, sorted in ascending order
     */
    function getTimestampsInRange(uint256 start, uint256 end) external view returns (uint256[] memory) {
        require(start <= end, "Invalid range");

        // Find the first timestamp >= start
        uint256 startIndex = findInsertionPoint(start);
        
        // Find the first timestamp > end
        uint256 endIndex = findInsertionPoint(end + 1);
        
        // Calculate the number of timestamps in range
        uint256 count = endIndex - startIndex;
        
        // Create and populate the result array
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = timestamps[startIndex + i];
        }

        return result;
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
    function grantUploaderRole(address uploader) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(UPLOADER_ROLE, uploader);
    }

    /**
     * @dev Revoke uploader role from an address
     * @param uploader The address to revoke the uploader role from
     */
    function revokeUploaderRole(address uploader) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(uploader != creator, "Cannot revoke uploader role from creator");
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

    // The following functions are overrides required by Solidity
    function supportsInterface(bytes4 interfaceId) public view override(AccessControlDefaultAdminRules) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
