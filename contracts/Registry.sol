// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract Registry is AccessControlDefaultAdminRules {
  using SafeERC20 for IERC20;

  event ReferrerRegistered(
    string indexed referrerId,
    string[] protocolIds,
    uint256[] rewardRates,
    address rewardAddress
  );

  event ReferralRegistered(
    string indexed protocolId,
    string indexed referrerId,
    address indexed userAddress
  );

  error ReferrerNotRegistered(string protocolId, string referrerId);

  error UserAlreadyRegistered(
    string protocolId,
    string referrerId,
    address userAddress
  );

  struct User {
    uint256 timestamp;
  }

  struct Referrer {
    uint256 rewardRate;
    address[] userAddresses;
  }

  mapping(string => string[]) private _protocolIdToReferrerIds;
  mapping(string => string[]) private _referrerIdToProtocolIds;
  mapping(string => address) private _referrerIdToRewardAddress;
  mapping(string => mapping(string => Referrer))
    private _referrerInfoByProtocol;
  mapping(string => mapping(address => User)) private _userInfoByProtocol;

  bool private _referrerIsRegistered;

  constructor(
    address owner,
    uint48 transferDelay
  ) AccessControlDefaultAdminRules(transferDelay, owner) {}

  function registerReferrer(
    string calldata _referrerId,
    string[] calldata _protocolIds,
    uint256[] calldata _rewardRates,
    address _rewardAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < _referrerIdToProtocolIds[_referrerId].length; i++) {
      // Remove protocols that are no longer active (from previous registration)
    }
    for (uint256 i = 0; i < _protocolIds.length; i++) {
      _referrerInfoByProtocol[_protocolIds[i]][_referrerId].rewardRate = _rewardRates[i];
      _protocolIdToReferrerIds[_protocolIds[i]].push(_referrerId);
    }
    _referrerIdToProtocolIds[_referrerId] = _protocolIds;
    emit ReferrerRegistered(
      _referrerId,
      _protocolIds,
      _rewardRates,
      _rewardAddress
    );
  }

  function registerReferral(
    string calldata referrerId,
    string calldata protocolId
  ) external {
    _referrerIsRegistered = false;
    for (uint256 i = 0; i < _referrerIdToProtocolIds[referrerId].length; i++) {
      if (
        keccak256(abi.encodePacked(_referrerIdToProtocolIds[referrerId][i])) ==
        keccak256(abi.encodePacked(protocolId))
      ) {
        _referrerIsRegistered = true;
        break;
      }
    }
    // Check if the referrer is active with the protocol
    if (!_referrerIsRegistered) {
      revert ReferrerNotRegistered(protocolId, referrerId);
      // And that the user has not been registered before to the given protocol
    } else if (_userInfoByProtocol[protocolId][msg.sender].timestamp != 0) {
      revert UserAlreadyRegistered(protocolId, referrerId, msg.sender);
    } else {
      _userInfoByProtocol[protocolId][msg.sender] = User(block.timestamp);
      _referrerInfoByProtocol[protocolId][referrerId].userAddresses.push(
        msg.sender
      );
      emit ReferralRegistered(protocolId, referrerId, msg.sender);
    }
  }

  function getReferrers(
    string calldata protocolId
  ) external view returns (string[] memory) {
    return _protocolIdToReferrerIds[protocolId];
  }

  function getUsers(
    string calldata protocolId,
    string calldata referrerId
  ) external view returns (address[] memory, uint256[] memory) {
    address[] memory userAddresses = _referrerInfoByProtocol[protocolId][
      referrerId
    ].userAddresses;
    uint256[] memory timestamps = new uint256[](userAddresses.length);

    for (uint256 i = 0; i < userAddresses.length; i++) {
      timestamps[i] = _userInfoByProtocol[protocolId][userAddresses[i]]
        .timestamp;
    }

    return (userAddresses, timestamps);
  }

  function getRewardRate(
    string calldata protocolId,
    string calldata referrerId
  ) external view returns (uint256) {
    return _referrerInfoByProtocol[protocolId][referrerId].rewardRate;
  }

  function getRewardAddress(
    string calldata referrerId
  ) external view returns (address) {
    return _referrerIdToRewardAddress[referrerId];
  }
}
