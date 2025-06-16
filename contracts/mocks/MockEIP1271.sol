// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from '@openzeppelin/contracts/interfaces/IERC1271.sol';

/**
 * @title MockEIP1271
 * @dev A mock contract implementing EIP-1271 for testing purposes
 */
contract MockEIP1271 is IERC1271 {
  bytes4 private constant MAGIC_VALUE = 0x1626ba7e;

  mapping(bytes32 => bool) public validHashes;
  bool public alwaysValid;

  constructor(bool _alwaysValid) {
    alwaysValid = _alwaysValid;
  }

  function setValidHash(bytes32 hash, bool valid) external {
    validHashes[hash] = valid;
  }

  function isValidSignature(
    bytes32 hash,
    bytes memory
  ) external view override returns (bytes4) {
    if (alwaysValid || validHashes[hash]) {
      return MAGIC_VALUE;
    }
    return 0xffffffff; // Invalid
  }
}
