// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DisbursementVault} from "../src/DisbursementVault.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev The 7 "teeth" money-shots: an agent/disburser can pay ONLY inside the granted
///      envelope, and the funder stays non-custodial. Each teeth test is the on-chain
///      demonstration of "B with teeth" from the ZenFix thesis.
contract DisbursementVaultTest is Test {
    DisbursementVault vault;
    MockERC20 usdc;

    address owner = address(this); // the test contract deploys → it is the funder/owner
    address disburser = makeAddr("disburser"); // ZenFix operational key
    address alice = makeAddr("alice"); // allow-listed recipient
    address bob = makeAddr("bob"); // allow-listed recipient
    address carol = makeAddr("carol"); // NOT allow-listed
    address attacker = makeAddr("attacker"); // holds nothing

    uint256 constant PER_TX = 100e6; // 100 USDC
    uint256 constant DAILY = 150e6; // 150 USDC/day
    uint64 expiry;

    // Redeclared to match the emitted log for expectEmit.
    event Payout(bytes32 indexed intentId, address indexed recipient, uint256 amount, bytes32 policyHash);

    function setUp() public {
        usdc = new MockERC20();
        vault = new DisbursementVault(address(usdc));
        usdc.mint(address(vault), 1_000e6); // fund the vault with 1000 USDC

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        expiry = uint64(block.timestamp + 1 days);
        vault.grant(disburser, recipients, PER_TX, DAILY, expiry);
    }

    // Happy path: allow-listed recipient, within caps → paid, and it emits the receipt event.
    function test_happyPath_paysAllowlisted() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit Payout(bytes32("i1"), alice, PER_TX, vault.policyHash());
        vm.prank(disburser);
        vault.payout(bytes32("i1"), alice, PER_TX);

        assertEq(usdc.balanceOf(alice), PER_TX);
        assertEq(usdc.balanceOf(address(vault)), 900e6);
        assertTrue(vault.used(bytes32("i1")));
    }

    // Teeth #1 — cannot pay a non-allow-listed recipient (the "can't touch other parties" proof).
    function test_teeth_blocksNonAllowlistedRecipient() public {
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.RecipientNotAllowed.selector);
        vault.payout(bytes32("i2"), carol, 10e6);
    }

    // Teeth #2 — cannot exceed the per-tx cap.
    function test_teeth_blocksOverPerTxCap() public {
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.OverPerTxCap.selector);
        vault.payout(bytes32("i3"), alice, PER_TX + 1);
    }

    // Teeth #3 — cannot exceed the daily cap across payouts (100 + 100 > 150).
    function test_teeth_blocksOverDailyCap() public {
        vm.prank(disburser);
        vault.payout(bytes32("i4a"), alice, PER_TX); // 100 ok
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.OverDailyCap.selector);
        vault.payout(bytes32("i4b"), bob, PER_TX); // +100 → 200 > 150
    }

    // Teeth #4 — the grant expires; no payout after expiry.
    function test_teeth_blocksAfterExpiry() public {
        vm.warp(expiry);
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.Expired.selector);
        vault.payout(bytes32("i5"), alice, 10e6);
    }

    // Teeth #5 — even a STOLEN disburser key is contained: it still can't drain to the
    // attacker's own address, nor exceed the caps. Blast radius = the envelope, not the pool.
    function test_teeth_compromisedKeyStaysContained() public {
        // attacker somehow holds the disburser key → prank as disburser
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.RecipientNotAllowed.selector);
        vault.payout(bytes32("i6a"), attacker, PER_TX); // can't send to itself

        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.OverPerTxCap.selector);
        vault.payout(bytes32("i6b"), alice, 1_000e6); // can't drain via an allow-listed one
    }

    // Teeth #6 — non-custodial: the owner revokes the disburser and withdraws at will.
    function test_nonCustodial_ownerRevokesAndWithdraws() public {
        vault.revoke();
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.NotDisburser.selector);
        vault.payout(bytes32("i7"), alice, 10e6);

        uint256 before = usdc.balanceOf(owner);
        vault.withdraw(1_000e6);
        assertEq(usdc.balanceOf(owner), before + 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    // Teeth #7 — an intentId pays at most once (replay guard = one payout, one obligation).
    function test_teeth_blocksReplay() public {
        vm.prank(disburser);
        vault.payout(bytes32("i8"), alice, 50e6);
        vm.prank(disburser);
        vm.expectRevert(DisbursementVault.Replay.selector);
        vault.payout(bytes32("i8"), alice, 10e6);
    }

    // Guard — only the disburser may trigger payouts.
    function test_guard_onlyDisburserPays() public {
        vm.prank(attacker);
        vm.expectRevert(DisbursementVault.NotDisburser.selector);
        vault.payout(bytes32("i9"), alice, 10e6);
    }

    // Guard — only the owner may (re)grant.
    function test_guard_onlyOwnerGrants() public {
        address[] memory rs = new address[](1);
        rs[0] = attacker;
        vm.prank(attacker);
        vm.expectRevert(DisbursementVault.NotOwner.selector);
        vault.grant(attacker, rs, PER_TX, DAILY, expiry);
    }
}
