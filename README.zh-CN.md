# DSH Dungeon Party · 五人本模式

<p align="center">
  <strong>把复杂工程任务变成一场有纪律、可审计、可恢复的五人副本。</strong>
</p>

<p align="center">
  <strong>简体中文</strong> ·
  <a href="./README.md">English</a> ·
  <a href="./docs/dsh-dungeon-party-prd.md">完整 PRD</a>
</p>

<p align="center">
  <a href="https://github.com/DamonBao/dsh-dungeon-party/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/DamonBao/dsh-dungeon-party/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@jcy2387/dsh-dungeon-party"><img alt="npm" src="https://img.shields.io/npm/v/@jcy2387/dsh-dungeon-party"></a>
  <img alt="Node.js 22.5+" src="https://img.shields.io/badge/Node.js-22.5%2B-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
</p>

**DSH Dungeon Party** 是面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/DeepSeek-Harness) 的五 Agent 编排插件。它将复杂任务映射到固定的 **1 Tank、3 DPS、1 Healer** 队伍，并通过工作单、Lease、写入范围、Checkpoint、健康信号、验收门禁与战复机制，让多 Agent 协作可控、可追踪、可恢复。

> 队员可以受控并发，但 CPU 密集型工作不会无上限地同时执行。工作区指纹和审计扫描由持久化 Worker 池承载，并通过显式 FIFO 队列顺序处理。

## 为什么需要五人本模式？

多 Agent 很容易“同时开工”，但很难保证它们不会重复劳动、互相覆盖、基于过期状态验收，或者用大量并发扫描拖慢宿主进程。

Dungeon Party 在模型之外增加了一层由服务强制执行的协作协议：

- **固定职责**：一个 Commander/Tank、三个执行槽位、一个独立 Healer。
- **结构化派工**：每个任务都有目标、依赖、验收条件、读范围和写范围。
- **Lease 执行权**：只有绑定到对应槽位且持有当前 Lease 的 DPS 才能提交结果。
- **有界并发**：DPS 并发有上限；CPU 密集型工作区扫描进入 FIFO Worker 池。
- **独立验收**：Healer 针对版本化 Manifest 和当前 Workspace Fingerprint 验证结果。
- **持久化恢复**：Checkpoint、停滞、打断、隔离审查、DPS 战复与 Commander 救援都写入事件日志。
- **显式工具契约**：27 个模型工具全部使用封闭、结构化的输入输出 Schema，不包含泛化 JSON Schema。

## 队伍组成

| 槽位 | 角色 | 职责 |
| --- | --- | --- |
| Tank | **Aegis** | 持有总目标，拆解任务，处理决策，并对最终结果负责。 |
| DPS-1 | **Pyra** | 在声明的写入范围内执行一个持有 Lease 的工作单。 |
| DPS-2 | **Nyx** | 独立执行工作单并提交证据。 |
| DPS-3 | **Aster** | 独立执行工作单并提交证据。 |
| Healer | **Lumina** | 独立验证工作区，执行维护，并协调恢复流程。 |

工具可见不等于授权。所有敏感操作都会根据真实绑定的 DSH Session 再次校验身份。

## 一次副本如何运行

```text
FORMING → PLANNING → PLAN_REVIEW → EXECUTING → VALIDATING → COMPLETED
                                      │              │
                                      └── 停滞 ──────┤
                                                     └→ REPAIR → VALIDATING
```

1. **组队**：绑定 Commander，并预激活 Healer。
2. **规划**：创建结构化工作单，声明依赖、验收条件和作用域。
3. **审核计划**：执行开始前检查工作拆分是否完整且互不冲突。
4. **执行**：Ready 任务派给空闲 DPS；Lease 和 Checkpoint 约束执行过程。
5. **验收**：Healer 针对当前 Workspace Fingerprint 和版本化 Manifest 独立验证。
6. **返工或完成**：问题进入有限轮次的 REPAIR；两阶段完成门禁阻止过期工作区被误验收。

## 架构

```text
┌──────────────────── DSH Session / Commander ────────────────────┐
│  27 个结构化工具                                                  │
│        │                                                         │
│        ▼                                                         │
│  DungeonService ── 事件日志 ──► Session Projection ──► Web UI    │
│        │                                                         │
│        ├── PartyAgentManager ──► DPS / Healer Agent 池           │
│        │                         + 每个 run 的派发锁               │
│        │                                                         │
│        └── Workspace FIFO ─────► 持久化 Worker（池大小 1）        │
│                                  指纹 / 审计快照                   │
└──────────────────────────────────────────────────────────────────┘
```

### CPU 与界面响应优化

- 工作区遍历、文件读取和 SHA-256 计算移出宿主事件循环。
- 显式 FIFO 队列确保任意时刻只向 Worker 提交一个文件系统扫描。
- Lease 基线和提交前审计按 run 串行，避免并发基线错乱。
- 默认忽略 `.npm-cache/**` 等生成目录和缓存目录。
- Session Projection 按 run 压缩发布，避免每次状态变化都深拷贝和全量推送。
- Web 面板使用合成器友好的动画；仅在开发者面板展开时序列化原始 Projection。

## 安装

### DSH Web

```bash
dsh plugin --profile web add @jcy2387/dsh-dungeon-party
```

安装完成后先停止当前 Web 进程，再重新启动 profile：

```bash
dsh web
```

### DSH Desktop

```bash
dsh plugin --profile desktop add @jcy2387/dsh-dungeon-party
```

安装或升级后需要**完全退出并重新打开 DSH Desktop**。如果只是重新构建本地源码，单纯重启也不会读取新代码，因为 profile 使用的是 `$DSH_HOME/profiles/<profile>/node_modules` 中独立安装的包副本。

### 启用预设

插件启动时会将内置预设同步到：

```text
$DSH_HOME/.agent-presets/dungeon-party
```

新建 Session，并在预设选择器中选择 **五人本模式**（Dungeon Party）。

## 从本地源码升级

```bash
npm ci
npm run typecheck
npm test
npm run build
PACKAGE_TGZ="$(npm pack --pack-destination /tmp)"
```

把生成的 `.tgz` 安装到需要使用插件的每个 profile，然后重启对应 profile。例如：

```bash
dsh plugin --profile web add --force "/tmp/$PACKAGE_TGZ"
dsh plugin --profile desktop add --force "/tmp/$PACKAGE_TGZ"
```

## 核心能力

### 工作单与作用域安全

- 带版本号和验收条件的结构化工作单。
- 基于依赖关系和优先级的调度。
- `telemetry`、`aggregate`、`serial` 三种 Scope Enforcement 模式。
- 宿主计算的 Lease 基线和工作区差分快照。
- `write`、`edit`、`bash` 执行前 Scope Guard。
- 全局命令单一所有权。
- 修改测试断言时强制披露 `modifiedAssertions`。

### 进度与恢复

- 带过期时间和续租版本的 Lease。
- 周期 Checkpoint 与停滞升级。
- 针对精确 Turn 的中断和变更文件隔离。
- 有限次数的 DPS 战复和替代 Session。
- 一次性 Commander 救援票据与 Checkpoint 对账。
- 覆盖超时、工具失败、队列压力、上下文压力和进度停滞的 Health Signal。

### 验收与持久化

- 事件溯源状态、单调序列检查和幂等键。
- DSH Session Log 持久化、冷重放和按节奏压缩发布的 UI Projection。
- 版本化 Validation Manifest 和 Validation Report。
- Healer 验证命令白名单及有界输出记录。
- Workspace Fingerprint 与已验收 Task Set 版本绑定。
- 工作区在最终提交期间变化时安全中止的两阶段完成流程。

## 主要配置

| 配置项 | 默认值 | 作用 |
| --- | ---: | --- |
| `scopeEnforcementMode` | `auto` | 自动选择当前环境可用的最安全写入范围模式。 |
| `maxConcurrentDps` | `3` | 可同时持有有效 Lease 的 DPS 数量上限。 |
| `taskLeaseDurationMs` | `600000` | 任务 Lease 有效时间。 |
| `progressCheckpointIntervalMs` | `180000` | 运行中任务的预期 Checkpoint 周期。 |
| `maxMissedCheckpoints` | `2` | 任务被判断为 stalled 前允许错过的 Checkpoint 数量。 |
| `maxRepairRounds` | `3` | 每个任务允许的返工轮次。 |
| `battleResCharges` | `1` | DPS 战复次数。 |
| `commanderBattleResCharges` | `1` | Commander 救援次数。 |
| `healerVerificationTimeoutMs` | `120000` | Healer 验证命令超时时间。 |
| `validationRequired` | `true` | 完成前必须存在当前有效且通过的验收报告。 |

默认 Fingerprint 忽略范围：

```text
.git/**
node_modules/**
.npm-cache/**
lib/**
dist/**
coverage/**
.dsh/dungeon-party/tmp/**
```

运行时还支持显式 `childRoute`（`provider` 和 `model`），用于把子 Agent 固定到 DSH 设置中已经注册的模型路由。

## 开发

环境要求：

- Node.js 22 或更高版本
- 兼容的 DSH `0.1.x` 运行时

```bash
npm ci
npm run typecheck
npm test
npm run build
```

仓库直接提交 `lib/`，因此安装包无需现场编译即可运行。`prepublishOnly` 会在发布前强制执行 `typecheck → test → build`。

主要源码位置：

```text
src/service/dungeon-service.ts              事件溯源领域模型
src/adapters/party-agent-manager.ts         Agent 生命周期和调度
src/adapters/workspace-computation-queue.ts FIFO Worker 池
src/tools/register.ts                       面向模型的工具行为
src/tools/output-schemas.ts                 显式工具输出契约
client/index.tsx                            Dungeon Party 活动面板
preset/dungeon-party/                       内置 Agent 预设
```

## CI/CD

仓库包含两个 GitHub Actions 工作流：

- **CI**：在推送到 `main`、Pull Request 和手动触发时运行。它会通过 `npm ci` 安装依赖，执行类型检查和测试，重新构建包，确认仓库内提交的 `lib/` 产物没有过期，并把打包后的 `.tgz` 上传为工作流 Artifact。
- **Release**：发布 GitHub Release 时运行。Release Tag 必须与 `v<package.json version>` 一致；工作流会重复全部质量门禁，并通过 **OIDC 可信发布（trusted publishing）** 携带 Provenance 发布 npm 包，无需任何长期有效的 token。

要启用 npm 发布，请在 npmjs.com 上为 `@jcy2387/dsh-dungeon-party` 配置 [trusted publishing](https://docs.npmjs.com/trusted-publishing)，授权本仓库的 `Release` 工作流——**不需要**配置 `NPM_TOKEN`。典型发布流程：

```bash
npm version patch --no-git-tag-version
npm run build
VERSION="$(node -p 'require("./package.json").version')"
git add package.json package-lock.json lib
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin main --tags
```

随后为该 Tag 创建并发布 GitHub Release。工作流是幂等的：相同 npm 版本重复运行时会安全跳过 npm publish。Release 附件不再上传到 GitHub Release（npm + provenance 是唯一分发渠道）。

Dependabot 每周检查 npm 和 GitHub Actions 依赖更新。

## 运行边界

当前持久化和派发协议以“**每个 run 由单个 DSH 进程驱动**”为边界：

- 不要从多个 DSH 进程并发驱动同一个 run。
- 事件序列、派发锁和 Lease 串行化都是进程内语义。
- 跨进程冲突会以 `EVENT_SEQUENCE_CONFLICT` 或 `EVENT_ID_CONFLICT` 安全失败，不会静默合并。
- 升级 Fingerprint Ignore Scope 可能使进行中的 Validation Report 失效；必要时需要重新创建 Validation Manifest。

## 项目状态

核心编排、事件持久化、恢复、验收、Web 面板、显式工具契约与 CPU 队列均已实现并由自动化测试覆盖。后续计划包括跨进程原子事件追加、崩溃注入补偿、离线消息确认与重试，以及更完整的 DAG 和历史回放界面。

完整行为规范见 [`docs/dsh-dungeon-party-prd.md`](./docs/dsh-dungeon-party-prd.md)。
