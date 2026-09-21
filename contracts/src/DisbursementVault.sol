// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal ERC-20 surface the vault needs (USDC).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DisbursementVault — a scoped, rule-bound spending credential ("B with teeth").
/// @notice PoC of ZenFix's core thesis: an agent/disburser can move money ONLY inside an
///         envelope the funder granted — right token, allow-listed recipients, per-tx and
///         daily caps, before expiry. Anything outside REVERTS on-chain, so the constraint
///         is structural, not advisory. The funder keeps custody: `owner` can revoke the
///         disburser or withdraw the funds at any time; ZenFix never holds the keys.
///
///         This is deliberately a standalone vault for a legible PoC. Production migrates
///         the same rules to a module on the funder's OWN smart account (ERC-7579 /
///         Spend Permissions) so the funds never leave the user's wallet.
contract DisbursementVault {
    /// @notice The funder. Holds custody: can revoke/withdraw at any time.
    address public immutable owner;
    /// @notice The disbursed asset (e.g. USDC).
    IERC20 public immutable token;

    /// @notice The address authorized to trigger payouts (ZenFix's operational key).
    address public disburser;
    /// @notice Max value of a single payout.
    uint256 public perTxCap;
    /// @notice Max value paid within any rolling 1-day window.
    uint256 public dailyCap;
    /// @notice Grant expiry (unix seconds); payouts revert at/after this.
    uint64 public expiry;
    /// @notice Recipient allow-list. A payout to a non-listed address reverts.
    mapping(address => bool) public allowed;

    /// @notice Start of the current daily window and value spent within it.
    uint64 public dayStart;
    uint256 public spentToday;

    /// @notice Per-intent replay guard: a given intentId can pay out at most once.
    mapping(bytes32 => bool) public used;

    /// @notice Hash of the granted rules — the on-chain anchor of the issued credential.
    bytes32 public policyHash;

    event Granted(bytes32 indexed policyHash, address disburser, uint256 perTxCap, uint256 dailyCap, uint64 expiry);
    event Payout(bytes32 indexed intentId, address indexed recipient, uint256 amount, bytes32 policyHash);
    event Revoked();

    error NotOwner();
    error NotDisburser();
    error Replay();
    error Expired();
    error RecipientNotAllowed();
    error OverPerTxCap();
    error OverDailyCap();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address token_) {
        owner = msg.sender;
        token = IERC20(token_);
    }

    /// @notice "领取" — the funder issues the scoped spending credential.
    /// @dev Re-callable by the owner to reconfigure the envelope.
    function grant(
        address disburser_,
        address[] calldata recipients,
        uint256 perTxCap_,
        uint256 dailyCap_,
        uint64 expiry_
    ) external onlyOwner {
        disburser = disburser_;
        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
        expiry = expiry_;
        for (uint256 i = 0; i < recipients.length; i++) {
            allowed[recipients[i]] = true;
        }
        policyHash = keccak256(abi.encode(disburser_, recipients, perTxCap_, dailyCap_, expiry_));
        emit Granted(policyHash, disburser_, perTxCap_, dailyCap_, expiry_);
    }

    /// @notice The teeth: pay `amount` to `recipient` — but ONLY inside the granted envelope.
    /// @dev Every out-of-scope condition reverts before any funds move. Checks-Effects-
    ///      Interactions: all state is written before the token transfer.
    function payout(bytes32 intentId, address recipient, uint256 amount) external {
        if (msg.sender != disburser) revert NotDisburser();
        if (used[intentId]) revert Replay();
        if (block.timestamp >= expiry) revert Expired();
        if (!allowed[recipient]) revert RecipientNotAllowed();
        if (amount > perTxCap) revert OverPerTxCap();

        // Roll the daily window forward if the previous one has elapsed.
        if (block.timestamp >= dayStart + 1 days) {
            dayStart = uint64(block.timestamp);
            spentToday = 0;
        }
        if (spentToday + amount > dailyCap) revert OverDailyCap();

        // Effects before interaction.
        used[intentId] = true;
        spentToday += amount;
        emit Payout(intentId, recipient, amount, policyHash);

        if (!token.transfer(recipient, amount)) revert TransferFailed();
    }

    /// @notice Non-custodial kill switch: the owner disables the disburser at any time.
    function revoke() external onlyOwner {
        disburser = address(0);
        emit Revoked();
    }

    /// @notice Non-custodial exit: the owner pulls funds back at any time.
    function withdraw(uint256 amount) external onlyOwner {
        if (!token.transfer(owner, amount)) revert TransferFailed();
    }
}
