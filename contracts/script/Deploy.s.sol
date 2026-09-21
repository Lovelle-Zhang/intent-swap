// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DisbursementVault} from "../src/DisbursementVault.sol";

/// @dev Deploy a DisbursementVault. Run by the funder with their OWN key:
///   USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://sepolia.base.org --private-key $OWNER_KEY --broadcast
/// Then fund it (send USDC to the printed address) and call grant(...).
contract Deploy is Script {
    function run() external {
        address token = vm.envAddress("USDC"); // Base Sepolia USDC
        vm.startBroadcast();
        DisbursementVault vault = new DisbursementVault(token);
        vm.stopBroadcast();
        console2.log("DisbursementVault deployed at:", address(vault));
    }
}
