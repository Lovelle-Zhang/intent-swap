// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ConditionalSwapVault — Intent Swap 条件单链上执行合约
 *
 * 工作流程：
 * 1. 用户 deposit 代币到合约（或原生 ETH）
 * 2. 用户用 EIP-712 签名一个 Order（不上链，发给 keeper 服务器）
 * 3. 当价格条件满足，keeper 调用 executeOrder(order, signature)
 * 4. 合约验证签名，从 deposits 扣款，通过 Uniswap V3 执行 swap，将结果发给用户
 * 5. 用户可随时 withdraw 或 cancelOrder（invalidate nonce）
 *
 * 优点（对比预签名 raw tx 方案）：
 * - nonce 由合约管理，不与钱包 nonce 冲突
 * - 用户资金始终在链上，可随时取回
 * - Order 可以有 deadline，过期自动失效
 * - 支持单步和多步 Uniswap V3 路由
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

contract ConditionalSwapVault {
    // ─── EIP-712 ───────────────────────────────────────────────────────

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address user,address tokenIn,address tokenOut,uint256 amountIn,"
        "uint256 amountOutMinimum,bytes32 pathHash,bool isMultiHop,uint256 nonce,uint256 deadline)"
    );

    // ─── Storage ───────────────────────────────────────────────────────

    address public immutable swapRouter;
    address public owner;
    address public keeper;

    // user => token => deposited amount (address(0) = ETH)
    mapping(address => mapping(address => uint256)) public deposits;
    // user => current nonce (cancel = increment)
    mapping(address => uint256) public nonces;
    // orderHash => executed
    mapping(bytes32 => bool) public executedOrders;

    uint256 public keeperFeeBps = 10; // 0.1%

    // ─── Events ────────────────────────────────────────────────────────

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event OrderExecuted(
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 indexed orderHash
    );
    event OrderCancelled(address indexed user, uint256 newNonce);
    event KeeperUpdated(address indexed newKeeper);

    // ─── Order struct ──────────────────────────────────────────────────

    struct Order {
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes   path;        // encoded Uniswap V3 path
        bool    isMultiHop;
        uint256 nonce;
        uint256 deadline;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address _swapRouter, address _keeper) {
        swapRouter = _swapRouter;
        owner = msg.sender;
        keeper = _keeper;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ConditionalSwapVault"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyKeeper() { require(msg.sender == keeper || msg.sender == owner, "Not keeper"); _; }

    // ─── Deposit / Withdraw ────────────────────────────────────────────

    /// @notice 存入 ERC20 代币
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Use depositETH for ETH");
        require(amount > 0, "Zero amount");
        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "Transfer failed");
        deposits[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice 存入原生 ETH
    function depositETH() external payable {
        require(msg.value > 0, "Zero amount");
        deposits[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }

    receive() external payable {
        deposits[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }

    /// @notice 提取代币
    function withdraw(address token, uint256 amount) external {
        require(deposits[msg.sender][token] >= amount, "Insufficient deposit");
        deposits[msg.sender][token] -= amount;
        if (token == address(0)) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            bool ok = IERC20(token).transfer(msg.sender, amount);
            require(ok, "Transfer failed");
        }
        emit Withdrawn(msg.sender, token, amount);
    }

    // ─── Order Management ──────────────────────────────────────────────

    /// @notice 取消当前所有未执行订单（递增 nonce）
    function cancelOrders() external {
        nonces[msg.sender]++;
        emit OrderCancelled(msg.sender, nonces[msg.sender]);
    }

    // ─── Execute ───────────────────────────────────────────────────────

    /// @notice Keeper 执行条件单
    function executeOrder(Order calldata order, bytes calldata signature) external onlyKeeper {
        // 检查 deadline
        require(block.timestamp <= order.deadline, "Order expired");

        // 检查 nonce（防重放）
        require(order.nonce == nonces[order.user], "Invalid nonce");

        // 计算并验证签名
        bytes32 orderHash = _hashOrder(order);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash));
        address signer = _recover(digest, signature);
        require(signer == order.user, "Invalid signature");

        // 防止重复执行
        require(!executedOrders[digest], "Already executed");
        executedOrders[digest] = true;

        // 检查存款
        require(deposits[order.user][order.tokenIn] >= order.amountIn, "Insufficient deposit");
        deposits[order.user][order.tokenIn] -= order.amountIn;

        // 执行 swap
        uint256 amountOut = _executeSwap(order);

        // 扣除 keeper 手续费（从 amountOut 中）
        // 注意：amountOut 已经直接发给 order.user（recipient = order.user）
        // keeper 费在此从 deposits 中单独收取，这里简化为不收费（可后续扩展）

        emit OrderExecuted(order.user, order.tokenIn, order.tokenOut, order.amountIn, amountOut, digest);
    }

    function _executeSwap(Order calldata order) internal returns (uint256 amountOut) {
        bool isETH = order.tokenIn == address(0);
        uint256 value = isETH ? order.amountIn : 0;

        if (!isETH) {
            IERC20(order.tokenIn).approve(swapRouter, order.amountIn);
        }

        if (order.isMultiHop) {
            amountOut = ISwapRouter(swapRouter).exactInput{value: value}(
                ISwapRouter.ExactInputParams({
                    path: order.path,
                    recipient: order.user,
                    deadline: order.deadline,
                    amountIn: order.amountIn,
                    amountOutMinimum: order.amountOutMinimum
                })
            );
        } else {
            // 单步路由：从 path 解码 tokenIn/fee/tokenOut
            (address tIn, uint24 fee, address tOut) = _decodeSingleHopPath(order.path);
            amountOut = ISwapRouter(swapRouter).exactInputSingle{value: value}(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: tIn,
                    tokenOut: tOut,
                    fee: fee,
                    recipient: order.user,
                    deadline: order.deadline,
                    amountIn: order.amountIn,
                    amountOutMinimum: order.amountOutMinimum,
                    sqrtPriceLimitX96: 0
                })
            );
        }
    }

    // ─── View helpers ──────────────────────────────────────────────────

    function getOrderDigest(Order calldata order) external view returns (bytes32) {
        bytes32 orderHash = _hashOrder(order);
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash));
    }

    function getUserDeposit(address user, address token) external view returns (uint256) {
        return deposits[user][token];
    }

    // ─── Internal ──────────────────────────────────────────────────────

    function _hashOrder(Order calldata order) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            ORDER_TYPEHASH,
            order.user,
            order.tokenIn,
            order.tokenOut,
            order.amountIn,
            order.amountOutMinimum,
            keccak256(order.path), // pathHash
            order.isMultiHop,
            order.nonce,
            order.deadline
        ));
    }

    function _decodeSingleHopPath(bytes memory path) internal pure returns (
        address tokenIn, uint24 fee, address tokenOut
    ) {
        require(path.length == 43, "Invalid path length"); // 20 + 3 + 20
        assembly {
            tokenIn  := shr(96, mload(add(path, 32)))
            fee      := shr(232, mload(add(path, 52)))
            tokenOut := shr(96, mload(add(path, 55)))
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

    // ─── Admin ─────────────────────────────────────────────────────────

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setKeeperFee(uint256 bps) external onlyOwner {
        require(bps <= 100, "Max 1%");
        keeperFeeBps = bps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0));
        owner = newOwner;
    }
}
