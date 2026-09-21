// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Bare-minimum ERC-20 for tests: only what the vault touches (transfer / balanceOf)
///      plus mint. 6 decimals to mirror USDC.
contract MockERC20 {
    string public name = "Mock USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
