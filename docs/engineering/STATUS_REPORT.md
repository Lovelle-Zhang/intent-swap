# ZenFix / Intent-Swap 仓库现状报告

**日期：** 2026-08-03
**范围：** 只读现状调查，未改动任何代码
**基于：** 分支 `codex/zenfix-hosted-schema-rls`，HEAD `f78a3ac`

## 结论先行

这个仓库正处在一次**严格执行的"绞杀者迁移"（strangler migration）中途**：对外的门面（首页、README、layout 标题、线上域名）仍然是老的 **Intent Swap DEX**，而实际正在建设的产品是 **ZenFix PayRun —— 一个"AI Agent 支付管控层"**。领域内核（domain / 状态机 / 策略引擎 / 存储 / 控制回路）已经写得相当扎实且测试充分，但**没有一条从真实用户操作到这套内核的活路径**——目前所有 PayRun 界面看到的都是离线脚本预先烤好的四个演示场景。

---

## 1. 对外声称自己是什么 —— 存在人格分裂

| 来源 | 自称 |
|---|---|
| `README.md` | "Intent Swap — Swap with intention. 自然语言 DEX，Uniswap V3 多链兑换" |
| `package.json` `name` | `intent-swap` |
| `src/app/layout.tsx` `<title>` | "Intent Swap — Conditional Orders for DeFi" |
| 首页 `src/app/page.tsx` | 老的 DEX 落地页（钱包连接 + 条件单 + token 搜索） |
| **docs/ 架构基线** | "ZenFix PayRun is an **Agent Payment Control Layer**… **not a DEX, wallet, or trading surface**" |

也就是说：**代码库对外（README + 首页 + 域名 intent-swap.app）仍宣称自己是 DEX**，但 `docs/` 和最近全部 commit 都在建一个明确"不是 DEX"的 Agent 支付平台。README 完全没提 ZenFix，是一个尚未更新的旧门面。

主要目录：
- `src/app/` — Next.js 14 页面。**老 DEX 路由**（`/`、`/conditional-order`、`/execute`、`/orders`、`/portfolio`…）和**新 ZenFix 路由**（`/command-center`、`/payruns`、`/pilot-validation`、`/zenfix/*`）并存。
- `src/features/payrun/` — **新产品的全部内核**（domain / application / adapters / hosted / pilot / presentation），约 11,000 行。
- `monitor/` `contracts/` — 老 swap 协议的价格监控服务和 Solidity Vault。
- `docs/` — 大量 ZenFix 架构文档、ADR、路线图（新写）。

## 2. 方向拐点：2026-07-11/12

按主题归类最近 60 条 commit：

- **~2026-05 至 06-02（老 swap 收尾）**：钱包连接体验（Privy 引入又回退到 wagmi）、多链（Linea/Izumi）、China-friendly 钱包、监控服务迁移、通知渠道、health-check。全部是 DEX 产品的运维打磨。
- **拐点 = 2026-07-11 → 07-12**：`0b4039d docs(architecture): establish ZenFix PayRun baseline` + `d7a2276 test: establish legacy safety net`。这里正式立了架构基线，先给老代码补"特征化测试安全网"，再开始绞杀。
- **2026-07-12 → 07-15（ZenFix 建设）**，清晰的分片（Slice）节奏：
  - Slice 2 规范领域模型 → Slice 3 项目级存储 → Slice 4 沙箱控制回路 → Pilot 验证面 → Command Center → 设计基线 → **hosted schema / postgres 适配 / hosted auth workspace（最近 3 个 commit，07-15）**。

方向转变本身是**有意的、文档化的、逐片提交的**，不是失控漂移。每片一个 PR、一个 Gate，`main` 保持可跑。

## 3. 模块归属：老 / 新 / 半成品

**老 swap 协议留下的（仍在运行、是当前门面）：**
- 首页及 `/conditional-order` `/execute` `/orders` `/portfolio` `/subscribe` `/activity` `/history`
- `src/components/`（IntentInput、TokenSearch、WalletButton…）、`src/lib/`（prices、vault、history）、`src/config/tokens.ts`
- `src/app/api/`（`parse-intent`、`swap-quote`、`orders`、`cron/health-check`）
- `monitor/`、`contracts/`

**新写且质量较高的（ZenFix 内核）：**
- `src/features/payrun/domain/`（`schemas.ts` 2310 行、`invariants.ts` 967 行、`types.ts` 794 行、`state-machine.ts` 622 行、`policy-engine.ts`）
- `src/features/payrun/adapters/storage/`（本地 JSON + Postgres 双实现、writer-lease、unit-of-work、canonical-json）
- `src/features/payrun/application/control-loop.ts`（457 行，Intent→Policy→Funding→Payment→Proof→Ledger 回路）
- `src/features/payrun/pilot/`、`presentation/`、`hosted/`

**写了一半 / 没接完（关键风险）：**
1. **控制回路没有活的调用方。** `control-loop.ts` 在非测试代码里只被 `pilot/session-preparation.ts` 调用，而后者只被离线脚本 `scripts/prepare-pilot-validation.ts`（`npm run pilot:prepare`）和测试触发。**没有任何 app 页面或 API route 在运行时跑控制回路。**
2. **PayRun 界面读的是"预烤"数据。** `/command-center`、`/payruns`、`/pilot-validation` 全部通过 `loadCurrentPilotSession()` 读磁盘上的 `.zenfix-data/pilot-validation/current.json`（已提交进 git 的两个历史 session 快照）。用户在界面上无法创建或推进任何 PayRun——它是一个**只读的、静态的四场景演示**。
3. **hosted workspace（最新一层）只做到登录。** `/zenfix/*`：magic-link 登录（Supabase）+ 解析出一个 Personal Workspace 行（Postgres），返回一段内联 HTML 说"你的工作区就绪了"。**到此为止**——没有创建 PayRun、没有接控制回路、没有任何操作界面。这是 07-15 三个 commit 的当前边界。
4. **存储工厂被架空。** `persistence-factory.ts`（本地 JSON vs Postgres 的选择器）只被 `storage/index.ts` 引用；hosted 路径直接 `openPostgresPayRunStorage(...)`，绕过工厂。两套存储各自被不同路径用，尚未统一。
5. **老 TODO**：`api/orders/route.ts` 的 auth-when-auto-execute、`execute/page.tsx` 的 Flashbots MEV 保护——都是老 swap 的未完项。

## 4. 测试覆盖与端到端

- **测试很强**：`npm test` → **46 文件通过 / 1 跳过，793 通过 / 1 跳过**，全绿，约 26s。
- 覆盖面：domain（invariants 33、schemas 36、state-machine、policy-engine、approval-binding）、storage（atomic-write、unit-of-work、writer-lease、repositories、schema-migration）、control-loop（four-scenarios、failure-recovery、idempotency-and-restart）、hosted（auth、session、postgres-adapter、schema-rls、workspace-bootstrap）、pilot/presentation（含渲染测试）。老代码有 characterization 安全网（health-route、swap-quote、tokens、wallet-button、monitor-auth）。
- **能跑通的"端到端"路径只有一条，且是离线的**：`pilot:prepare` 脚本 → 真实跑 Slice-4 控制回路生成四个场景 → 原子发布成不可变 session → 页面只读渲染。`session-preparation.test.ts` 里"runs the real Slice 4 Control Loop"这条测试（~9.5s）就是它的证明。
- **不存在**"用户交互 → 内核 → 存储 → 回显"的实时端到端路径。hosted 侧的 Postgres/RLS/auth 有单测，但**没有把它们串成一次真实的托管 PayRun**。

## 5. "离能给外人演示还差什么" 清单

按"挡住演示"的程度排序：

### A. 阻断级（不做就没法演示"这是 ZenFix"）
1. **入口不通**：首页、layout 标题、README、域名全是 Intent Swap。外人打开只会看到 DEX；ZenFix 页面只能靠手敲 URL 到达（首页无任何导航链接指向 `/command-center` 等）。需要决定演示入口并接一条导航。
2. **没有活的操作路径**：演示目前 = 展示四张预烤静态卡片。要能"当着人面创建/推进一个 PayRun"，必须把控制回路接到一个 app route/API 上（现在只有离线脚本能触发它）。
3. **hosted 断在登录后**：`/zenfix/workspace` 登录后就是一句"工作区就绪"，后面没有产品。要么演示走 pilot 只读面（诚实但静态），要么把 hosted workspace 接上控制回路（工作量大）。需要明确演示走哪条腿。

### B. 体验级
4. README + layout 标题 + metadata 仍讲 DEX 故事，任何截图/分享都会露馅。
5. 老 DEX 与新 ZenFix 两套 UI 风格、两套导航并存，演示动线容易串味。
6. 全站需明确 `SANDBOX / NO REAL FUNDS` 标识（架构不变量第 11 条要求；pilot 面已有，其他面需确认）。

### C. 依赖 / 运维
7. hosted 依赖 `SUPABASE_DATABASE_URL` + Supabase auth；缺配置时 workspace 直接 503。演示前要备好托管 Postgres + magic-link 邮件通道，否则 `/zenfix/*` 全挂。
8. `.zenfix-data/` 的预烤 session 绑定在特定 commit 上；换机器/换分支后需重跑 `pilot:prepare`（且要求干净 worktree）。

---

**一句话总结**：内核和测试的成熟度，远超"对外门面"的成熟度。要给外人演示，最省力的诚实路径是——更新 README/标题、加一个入口把访客直接带到 `/command-center` 只读 pilot 面，并明说"这是沙箱演示"；要演示"真能操作"，则需要补第 A2、A3 条那条从 UI 到控制回路的活线，工作量明显更大。
