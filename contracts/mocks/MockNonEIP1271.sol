// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockNonEIP1271
 * @dev A mock contract that does NOT implement EIP-1271 for testing purposes
 */
contract MockNonEIP1271 {
  function someOtherFunction() external pure returns (bool) {
    return true;
  }
}
