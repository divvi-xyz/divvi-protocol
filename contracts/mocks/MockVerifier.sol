// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRiscZeroVerifier, Receipt} from '../risc0/IRiscZeroVerifier.sol';

contract MockVerifier is IRiscZeroVerifier {
  function verify(
    bytes calldata seal,
    bytes32 imageId,
    bytes32 journalDigest
  ) external view override {
    // Mock implementation that always succeeds
  }

  function verifyIntegrity(Receipt calldata receipt) external view override {
    // Mock implementation that always succeeds
  }
}
