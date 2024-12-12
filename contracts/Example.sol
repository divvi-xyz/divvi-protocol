// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Example is ERC20 {
    constructor(string memory name, string memory symbol)
        ERC20(name, symbol)
    {
        // Mint 100 tokens to msg.sender
        _mint(msg.sender, 100 * 10 ** 18);
    }
}
