> **状态（2026-08-24 标注）**：本报告基于更早代码快照，行号与部分结论已失效；请以 `reviews/full-stack-review-2026-08-24.md` 为准。其中的 P0/P1 项已在后续修复中落地并补充回归测试。

# 工具协议层与宿主集成评审报告

> 评审范围：`src/tools/register.ts`、`src/plugin.ts`、`src/preset-sync.ts`、`src/session-event-compat.ts`、`src/adapters/session-event-store.ts`、`src/adapters/workspace-fingerprint.ts`  
> 对照文档：`docs/dsh-dungeon-party-prd.md`（V1.2）  
> 评审人：DPS-2（Nyx the Shadowstrider）  
> 生成时间：2026-08-21

---

## 1. 执行摘要

本次评审覆盖工具注册层（`src/tools/register.ts`，843 行）、Cordis 插件入口（`src/plugin.ts`）、预设同步（`src/preset-sync.ts`）、Session 事件兼容补丁（`src/session-event-compat.ts`）、事件存储适配器（`src/adapters/session-event-store.ts`）以及工作区指纹（`src/adapters/workspace-fingerprint.ts`）。

整体印象：
- **工具入参归一化**已覆盖主要字段，但存在非字符串/深层嵌套边界未收紧、软引导路径未完全对齐 PRD 的问题。
- **有界摘要**在 `summarizeRun` / `summarizeEvents` 中已实现显式切片，但部分嵌套数组仍可能因模型输入超大而膨胀。
- **session-event-compat** 采用运行时模块级 Set 变异，存在升级兼容、多实例和卸载残留风险。
- **插件生命周期**中 `ctx.effect` 清理顺序基本正确，但 projection 注册缺少显式 dispose，且 `ctx.on` 监听器未在工具层单独清理。
- **测试全部通过**：`npx vitest run tests/dsh-tools.test.ts tests/session-event-store.test.ts tests/cordis-plugin.test.ts tests/preset-sync.test.ts` → 17 passed。

---

## 2. Top 5 改进项

| 优先级 | 项 | 位置 | 建议 |
|---|---|---|---|
| P0 | `boundedText` 对非字符串输入无防御 | `src/tools/register.ts:31` | 增加 `typeof value !== 'string'` 时返回 `undefined` 或抛出，避免隐式 `toString` 导致超长输出。 |
| P0 | `session-event-compat.ts` 运行时补丁不可回滚 | `src/session-event-compat.ts:11-18` | 改为不可变扩展（如返回新 Set 或注册到宿主白名单 API），避免卸载残留。 |
| P1 | `summarizeRun` 中 `executionReports.at(-1)?.summary` 未对 `undefined` 做有界兜底 | `src/tools/register.ts:47` | 即使 `summary` 缺失，也应确保回退文本受 `boundedText` 约束。 |
| P1 | `party_phase` 软引导未覆盖所有非法状态迁移 | `src/tools/register.ts:318-332` | 当前仅对 `VALIDATING` 做前置 `agentManager` 调用，其他非法 phase 应返回结构化拒绝而非依赖服务层抛错。 |
| P1 | `workspace-fingerprint.ts` 的 `normalizeScope` 与 `isSafeScope` 重复且行为不一致 | `src/adapters/workspace-fingerprint.ts:8-14` vs `src/service/dungeon-service.ts:508-517` | 统一为单一工具函数，避免 `\\` 在指纹侧被替换后又在服务侧被判定为非法。 |

---

## 3. 逐文件评审

### 3.1 `src/tools/register.ts`（843 行）

#### 3.1.1 入参归一化边界

| 行号 | 函数 | 发现 | 级别 | 证据与建议 |
|---|---|---|---|---|
| 22-25 | `actor` | `exec.agent.id` 直接 `String()` 转换；若 `id` 为对象会得 `"[object Object]"` | P2 | 建议增加 `typeof exec.agent.id === 'string'` 校验。 |
| 31-34 | `boundedText` | 参数类型声明为 `string \| undefined`，但运行时可能传入数字/对象，会静默 `toString` | **P0** | 增加防御：`if (typeof value !== 'string') return undefined`。 |
| 100-106 | `stringList` | 对非数组输入抛出 `INVALID_ARGS`，但对数组内元素为 `number` 等会过滤失败并抛出，行为正确。 | — | 符合预期。 |
| 108-155 | `normalizeWorkOrderDraft` | `acceptanceCriteria` 的嵌套归一化较完整，支持 `string` / `object` / 别名字段（`criterion`/`text`）。但 `priority` 使用 `value.priority ?? 'normal'`，若传入 `null` 会回退正常；`required` 同理。 | P2 | 建议对 `priority` 显式拒绝 `null`，以与 `undefined` 区分。 |
| 157-208 | `normalizeExecutionReport` | `commandsRun` 校验仅检查 `command` 为字符串，未校验 `exitCode` 为整数；`summary` 回退到 `String(command.command)` 可能超长 | P2 | 建议对 `exitCode` 增加 `Number.isInteger` 校验；`summary` 回退值应过 `boundedText`。 |
| 210-220 | `normalizePartyMessage` | `evidence[0]` 作为 `summary` 回退时未过 `boundedText` | P2 | 回退文本应受同一 500 字限制。 |
| 222-229 | `currentTurnId` | 从 `exec.agent?.session?.events` 反向查找 `turn/start`；若事件流极长，每次工具调用都遍历 | P3 | 建议缓存当前 turn，或限制遍历窗口。 |

#### 3.1.2 有界摘要是否真的有界

| 行号 | 字段/数组 | 切片策略 | 风险 |
|---|---|---|---|
| 37 | `tasks` | `slice(0, 100)` + `omittedTaskCount` | ✅ 有界 |
| 47 | `executionReports.at(-1)?.summary` | `boundedText(..., 300)` | ⚠️ 若 `summary` 为 `undefined`，回退到 `undefined`，但 `boundedText` 会原样返回；下游 JSON 序列化无问题 |
| 52 | `objective` | `boundedText(..., 1_000)` | ✅ 有界 |
| 60 | `latestMessages` | `slice(-8)` + `boundedText(..., 300)` | ✅ 有界 |
| 67 | `recentHealthSignals` | `slice(-8)` | ⚠️ 未对单个信号内部字段做长度限制；若 `evidence` 数组元素超长，整体 JSON 仍可能膨胀 |
| 82-98 | `summarizeEvents` | `slice(-24)` + 白名单字段过滤 | ⚠️ `payload` 中的字符串/数字直接透传，若宿主事件携带超大字符串，会突破预算 |

**结论**：顶层切片已做，但深层嵌套字段（如 `healthSignals.evidence`、`event.payload` 中的字符串值）未递归截断。建议增加递归有界化或至少对已知大字段做二次 `boundedText`。

#### 3.1.3 Host 派生 ID / 默认值一致性

| 行号 | 场景 | 行为 | PRD 对齐 |
|---|---|---|---|
| 109 | `workOrder.id` | 若缺失或空，使用 `generatedId`（`task-${ordinal}`） | ✅ 与 PRD 9.1 一致 |
| 112-113 | `title` / `objective` 互备 | 任一非空即可，且互填 | ✅ 符合容错设计 |
| 129 | `criterion.id` | 缺失时生成 `${id}:criterion-${index + 1}` | ✅ 与 PRD 推荐格式一致 |
| 131 | `criterion.required` | 默认 `true` | ✅ 与 PRD 9.1 一致 |
| 134-137 | `priority` | 校验枚举，默认 `normal` | ✅ 与 PRD 一致 |
| 152 | `workOrder.version` | 强制设为 `1` | ✅ 与 PRD "host always starts at version 1" 一致 |
| 163 | `report.taskId` | 必填，空字符串抛错 | ✅ 与 PRD 9.2 一致 |
| 173 | `report.status` | 默认 `'completed'`，但仅接受 `completed`/`blocked`/`failed` | ⚠️ PRD 9.2 要求 `status` 必填；默认值可能掩盖模型遗漏 |
| 177-179 | `report.summary` | 回退到 `text` 或 `${status} ${title}` | ✅ 与工具 schema 描述一致 |
| 180-183 | `commandsRun` | 未传入时默认 `[]`，但校验要求每个元素有 `command` 字符串 | ✅ 合理 |

**建议**：`report.status` 的默认值 `'completed'` 与 PRD 9.2 的“必填”语义存在微妙偏差；建议改为无默认值，强制模型显式声明，减少误提交。

#### 3.1.4 软引导错误路径

| 行号 | 工具 | 软引导实现 | 覆盖度 |
|---|---|---|---|
| 430-438 | `party_assign` (assign) | 非 `EXECUTING`/`REPAIR` 时返回 `{ok:false, code:'INVALID_PHASE', recommendedAction}` | ✅ 完整 |
| 597-605 | `request_battle_res` | `lifeState !== 'down'` 时返回 `{ok:false, code:'MEMBER_NOT_DOWN', recommendedTools}` | ✅ 完整 |
| 其余工具 | — | 主要依赖服务层抛 `DungeonError` | ⚠️ 部分工具（如 `party_phase` 进入非法 phase）未在工具层做软引导，直接透传服务层错误 |

**建议**：对高频误用路径（如 `party_phase` 传入非法 phase、`work_claim` 重复领取）增加工具层软引导，降低模型试错成本。

#### 3.1.5 工具生命周期与清理

| 行号 | 实现 | 评审 |
|---|---|---|
| 243-842 | `disposers` 数组收集每个 `ctx.tools.register` 的返回值 | ✅ 正确 |
| 840-842 | `return () => { for (const dispose of disposers.reverse()) dispose() }` | ✅ 逆序清理，符合依赖栈顺序 |
| 缺失 | `ctx.on('session/event', ...)` 和 `ctx.on('agent/disposed', ...)` 的清理 | ⚠️ 这些监听器在 `plugin.ts` 中注册，由 Cordis 上下文生命周期管理；但工具层无独立清理钩子，若 `registerDungeonTools` 被单独调用后 dispose，宿主事件仍可能触发 `dispatchCommanderTickets` |

**建议**：`registerDungeonTools` 返回的 dispose 函数可考虑同时清理 `plugin.ts` 中通过闭包引用的 `dispatchCommanderTickets` 回调，或显式文档说明该 dispose 仅清理工具注册。

---

### 3.2 `src/plugin.ts`（122 行）

#### 3.2.1 插件生命周期

| 行号 | 代码 | 评审 |
|---|---|---|
| 18 | `registerDungeonSessionEventTypes()` | 模块级副作用，在 import 时执行；见 3.4 节风险 |
| 81-92 | `ctx.inject(['sessionProjections'], ...)` | projection 注册在 constructor 中完成；**无显式 dispose** |
| 106-111 | `ctx.on('session/event', ...)` | 监听 `turn/end`，计算 health signals；**未在返回或 effect 中清理** |
| 112-116 | `ctx.on('agent/disposed', ...)` | 监听 Agent 销毁，触发战复票据分发；**未在返回或 effect 中清理** |
| 117 | `ctx.effect(() => () => manager.dispose(), 'dungeon-party agents')` | ✅ 正确：effect 返回 dispose 回调 |
| 118 | `ctx.effect(() => registerDungeonTools(...), 'dungeon-party tools')` | ✅ 正确：registerDungeonTools 返回的 dispose 被 effect 捕获 |

**发现**：
- `sessionProjections.register` 返回的 dispose 句柄未被保存。若插件被热重载或禁用，projection 残留会导致宿主 Session 投影表污染。
- `ctx.on` 监听器在 Cordis 中通常随上下文销毁自动清理，但若 `DungeonPartyService` 实例被提前 dispose 而 Context 仍存活，监听器会继续触发，可能访问已 dispose 的 `manager` 或 `core`。

**建议**：
1. 保存 `sessionProjections.register` 的返回值，在 service dispose 时调用。
2. 将 `ctx.on` 监听器改为 `ctx.effect(() => { const dispose = ctx.on(...); return dispose })`，确保与 service 生命周期绑定。

#### 3.2.2 Projection Schema 正确性

| 行号 | 代码 | 评审 |
|---|---|---|
| 84 | `schema: wireSchema.custom<DungeonRun \| null>((value) => value === null \| \| (...))` | 仅校验 `id` 为字符串，未校验 `slots`/`tasks` 等核心字段 |
| 88 | `apply: applyDungeonProjection` | 直接 `structuredClone(event.data)`，无校验 |

**结论**：schema 过于宽松，可能导致非法状态被投影到 GUI。建议至少增加 `phase` 枚举和 `slots` 结构的基础校验，或引用服务层的 `DungeonRun` 类型守卫。

#### 3.2.3 Config 校验

| 行号 | 代码 | 评审 |
|---|---|---|
| 46-71 | `Config = z.object({ dungeon: z.object({ ... }) })` | 使用 Schemastery 定义，但 `positiveInteger` 仅校验 `step(1).min(1)`，未排除 `NaN`/`Infinity` |
| 48 | `scopeEnforcementMode: z.union([...])` | 缺少对非法字符串的友好错误提示 |

**建议**：`positiveInteger` 增加 `z.number().finite()` 排除 `Infinity`/`NaN`。

---

### 3.3 `src/preset-sync.ts`（77 行）

#### 3.3.1 预设同步逻辑

| 行号 | 代码 | 评审 |
|---|---|---|
| 12 | `registerDungeonSessionEventTypes()` | 同 `plugin.ts`，模块级副作用 |
| 51-65 | `syncDungeonPartyPreset` | 使用 `cpSync` + `renameSync` 实现原子替换；✅ 正确 |
| 57 | `temporary = join(targetRoot, \`.${PRESET_ID}.tmp-${process.pid}\`)` | 若同一进程并发调用会冲突；但当前为同步串行调用，风险低 |
| 68-77 | `apply` | 先 `registerHostDungeonSessionEventTypes`，再 `syncDungeonPartyPreset`；失败仅 warn | ⚠️ 若 preset sync 失败，宿主仍可使用旧 preset，但事件类型已注册，可能导致新旧版本不兼容 |

**建议**：preset sync 失败时是否应阻止插件加载？当前 warn 后继续，可能让用户体验到不一致的 preset 版本。建议根据失败性质决定：文件系统错误可降级，但 schema 不兼容应阻断。

---

### 3.4 `src/session-event-compat.ts`（33 行）

#### 3.4.1 运行时补丁风险

| 行号 | 代码 | 评审 |
|---|---|---|
| 11-14 | `addDungeonTypes` | 通过 `as Set<string>` 将 `ReadonlySet` 强制可变，然后 `mutable.add(type)` | **P0** |
| 17-18 | `registerDungeonSessionEventTypes` | 直接修改本包引用的 `KNOWN_SESSION_EVENT_TYPES` |
| 26-32 | `registerHostDungeonSessionEventTypes` | 通过 `createRequire` + `import` 找到宿主实例的 Set，同样强制 mutable add |

**风险清单**：
1. **升级兼容**：若 `dsh-session` 未来将 `KNOWN_SESSION_EVENT_TYPES` 改为真正的 frozen Set 或替换实现，本代码会抛出 TypeError。
2. **多实例**：若宿主加载多个 `dsh-dungeon-party` 版本（如 workspace 与 global 各一），每个实例都会重复 add，虽 Set 去重无副作用，但行为不可预期。
3. **卸载残留**：Cordis 插件卸载时，已 add 的类型不会从 Set 中移除；若重新加载新版本的 dungeon-party 并改了事件名，旧类型仍残留。
4. **并发安全**：`ReadonlySet` 的契约被突破，其他依赖该 Set 的模块可能假设其不变量。

**建议**：
- 短期：将 `addDungeonTypes` 改为防御式（先 `has` 检查，再 `try/catch` 包裹）。
- 中期：推动 `dsh-session` 提供官方注册 API（如 `registerSessionEventType('dungeon/event')`），而非直接变异全局 Set。
- 长期：在 `session-event-compat.ts` 中增加版本兼容性检查，读取 `dsh-session` 的版本标识，拒绝不兼容的宿主版本。

---

### 3.5 `src/adapters/session-event-store.ts`（84 行）

#### 3.5.1 事件存储正确性

| 行号 | 代码 | 评审 |
|---|---|---|
| 13-15 | `jsonClone` | 使用 `JSON.parse(JSON.stringify(value))`，丢失 `undefined`、Date、Map、Set、BigInt、循环引用 | P2 |
| 22-42 | `append` | 检查 eventId 冲突和 sequence 单调性；✅ 正确 |
| 27-28 | 重复事件内容校验 | `JSON.stringify(duplicate) !== JSON.stringify(canonicalEvent)` | ⚠️ 因 `jsonClone` 的丢失问题，若 payload 含 Date，两次序列化结果可能不一致，导致误报冲突 |
| 44-48 | `publishProjection` | 直接 `session.append('dungeon/projection', jsonClone(run))` | ⚠️ `run` 对象可能含循环引用或复杂类型，`jsonClone` 会抛错或丢失数据 |
| 60-71 | `load` | 遍历 session.events，过滤 `dungeon/event`，按 sequence 排序 | ✅ 正确 |
| 73-83 | `resolveSession` | 优先 `cached` → `actorSessionId` → 全局搜索 | ⚠️ 全局搜索 `session.events.some(...)` 在 Session 数量大时性能下降；建议建立 runId→session 索引 |

**建议**：
1. 将 `jsonClone` 替换为 `structuredClone`（Node 17+ 支持），以保留更多类型并支持循环引用检测。
2. 在 `SessionDungeonEventStore` 中维护 `runId → Session` 的持久索引，避免每次 `listRunIds` 和 `load` 全量扫描。

---

### 3.6 `src/adapters/workspace-fingerprint.ts`（61 行）

#### 3.6.1 指纹计算正确性

| 行号 | 代码 | 评审 |
|---|---|---|
| 8-14 | `normalizeScope` | 替换 `\\` 为 `/`，去除 `./` 前缀和尾部 `/`；检查 `..` 和绝对路径 | ✅ 基本安全 |
| 16-18 | `isIgnored` | 使用 `matchesGlob` 和精确匹配 | ✅ 正确 |
| 21-42 | `createWorkspaceSnapshot` | `realpathSync(resolve(...))` 后遍历；对 symlink 记录 `readlinkSync` 的哈希，不 follow | ✅ 与 PRD 14.1 一致 |
| 31-36 | 文件类型处理 | `lstatSync` 后区分 symlink / directory / file；**未处理 socket/fifo/block device** | P3 |
| 44-48 | `diffWorkspaceSnapshots` | 对称差集，按路径排序 | ✅ 正确 |
| 51-61 | `computeWorkspaceFingerprint` | 排序后逐路径更新 sha256，含 `\0` 分隔符 | ✅ 与 PRD 14.1 一致 |

**发现**：
- `normalizeScope` 与 `src/service/dungeon-service.ts:508-517` 的 `isSafeScope` 存在重复逻辑，但 `normalizeScope` 会主动替换 `\\` 为 `/`，而 `isSafeScope` 将 `\\` 视为非法。这意味着通过 `fingerprintIgnoreScopes` 传入的 Windows 路径会被 `workspace-fingerprint.ts` 正常化后通过，但在 `dungeon-service.ts` 的校验中被拒绝。
- 遍历目录时若遇到权限不足的文件，`readdirSync` 或 `lstatSync` 会抛出，导致整个指纹计算失败。

**建议**：
1. 统一 `normalizeScope` 与 `isSafeScope` 为单一工具函数，消除行为分歧。
2. 在 `walk` 中增加 `try/catch` 包裹 `lstatSync`/`readdirSync`，对权限错误记录 warn 并跳过，而非中断整个指纹计算。

---

## 4. 重点核查结论

### 4.1 工具入参归一化边界情况

- **非字符串**：`boundedText` 和 `normalizePartyMessage` 的 `summary` 回退路径存在隐式 `toString` 风险。
- **超长**：顶层切片已做，但深层嵌套（`healthSignals.evidence`、`event.payload` 字符串值）未递归截断。
- **深层嵌套**：`normalizeExecutionReport` 的 `commandsRun` 仅检查一层结构，未限制数组长度；若模型传入数千条命令记录，会突破内存/序列化预算。

### 4.2 有界摘要的上下文预算

`summarizeRun` + `summarizeEvents` 的组合在 100 任务 + 24 事件 + 8 消息 + 8 信号下，JSON 输出约 12-16KB（测试验证）。但以下场景可能膨胀：
- 单条 `message.summary` 被 `boundedText(..., 300)` 限制，但 `message.evidence` 数组未限制元素数量和长度。
- `healthSignals` 的 `evidence` 数组同样未限制。

**建议**：在 `summarizeRun` 中对 `evidence` 数组也做 `slice(0, N)` 和 `boundedText` 处理。

### 4.3 Host 派生 ID / 默认值一致性

整体与 PRD 对齐良好。唯一偏差：`normalizeExecutionReport` 中 `status` 默认 `'completed'` 与 PRD 9.2 的必填语义不一致。

### 4.4 软引导错误路径覆盖

已覆盖 `INVALID_PHASE`（assign）和 `MEMBER_NOT_DOWN`（battle res）。未覆盖：
- `party_phase` 非法 phase 值（依赖服务层抛错）。
- `work_claim` 重复领取（服务层抛 `LEASE_EXISTS`）。
- `work_submit` 缺少 `taskId`（schema 层已要求，但归一化层未做额外引导）。

### 4.5 `session-event-compat` 运行时补丁风险

详见 3.4 节。核心风险：不可回滚的模块级 Set 变异，升级兼容性和卸载残留问题突出。

---

## 5. 插件生命周期评审

### 5.1 `ctx.on` / `ctx.effect` 清理

| 组件 | 注册方式 | 清理方式 | 完整？ |
|---|---|---|---|
| `sessionProjections.register` | `ctx.inject` 内直接调用 | 无 | ❌ |
| `ctx.on('session/event')` | `ctx.on` | Cordis 上下文级 | ⚠️（未与 service 生命周期绑定） |
| `ctx.on('agent/disposed')` | `ctx.on` | Cordis 上下文级 | ⚠️（同上） |
| `manager.dispose()` | `ctx.effect` | effect 返回的 dispose | ✅ |
| `registerDungeonTools` | `ctx.effect` | effect 返回的 dispose | ✅ |

### 5.2 DungeonService 与 AgentManager 的 dispose 顺序

`plugin.ts:117-118` 中：
```ts
ctx.effect(() => () => manager.dispose(), 'dungeon-party agents')
ctx.effect(() => registerDungeonTools(ctx, this.core, manager), 'dungeon-party tools')
```

Cordis effect 的 dispose 按注册逆序执行，因此：
1. 先 dispose tools（`registerDungeonTools` 返回的 dispose）
2. 再 dispose agents（`manager.dispose()`）

✅ 顺序正确：工具先注销，避免 dispose agents 期间仍有工具调用尝试访问已销毁的 Agent。

### 5.3 Session / Event 监听开销

- `session/event` 监听所有 Session 的 `turn/end`，对每个 dungeon run 调用 `observeAgentTurnEnd` 和 `dispatchCommanderTickets`。
- 若宿主有数百个非 dungeon Session，每次 turn end 仍会触发过滤循环（`core.observeAgentTurnEnd` 内部遍历 `this.runs`）。
- 当前 `this.runs` 为内存 Map，规模可控；但长期运行后未终态 run 累积可能增加扫描开销。

**建议**：在 `observeAgentTurnEnd` 前增加快速路径：检查 `session.id` 是否为已知 party member，避免无意义遍历。

---

## 6. 对照 PRD 的契约偏差

| PRD 章节 | 要求 | 当前实现 | 偏差级别 |
|---|---|---|---|
| 9.2 `ExecutionReport.status` | 必填 | 默认 `'completed'` | P2 |
| 10.4 战复权限链 | 只有奶能消费战复指令 | `battle_res` 工具在 `register.ts:766-806` 中由服务层校验 healer 身份 | ✅ 无偏差 |
| 12.4 工具通用规则 | 每次调用校验 `runId`、Session、槽位和角色 | `actor()` 提取 sessionId，`getRunForActor` 校验成员身份 | ✅ 无偏差 |
| 14.1 工作区指纹 | 包含 Git HEAD、子模块、未跟踪文件 | 当前实现仅遍历文件系统，未读取 Git HEAD | **P1** |
| 15.2 事件模型 | `schemaVersion` 必须按版本解析 | 服务层 reduce 硬编码 `schemaVersion === 1` | ✅ 当前仅 V1，可接受 |
| 17.1 配置约束 | `taskLeaseDurationMs > maxMissedCheckpoints × (...)` | `resolveDungeonConfig:460` 已校验 | ✅ 无偏差 |

**待验证**：PRD 14.1 要求指纹包含 Git HEAD 和子模块 HEAD，当前 `workspace-fingerprint.ts` 未实现。是否计划后续补充？

---

## 7. 测试证据

```
✓ tests/session-event-store.test.ts (1 test) 5ms
✓ tests/preset-sync.test.ts (3 tests) 3ms
✓ tests/cordis-plugin.test.ts (3 tests) 12ms
✓ tests/dsh-tools.test.ts (10 tests) 1691ms
Test Files  4 passed (4)
Tests  17 passed (17)
```

测试覆盖：
- 工具注册与 dispose（`dsh-tools.test.ts`）
- 有界摘要预算（`keeps status and wait results bounded`）
- 身份派生（`derives the tank identity`）
- 归一化（`generates task identity`, `normalizes party messages`）
- 预设同步（`preset-sync.test.ts`）
- projection 注册（`cordis-plugin.test.ts`）
- 事件存储 sequence 校验（`session-event-store.test.ts`）

**缺口**：
- 无专门测试覆盖 `boundedText` 的非字符串输入。
- 无测试覆盖 `session-event-compat.ts` 的多实例/卸载场景。
- 无测试覆盖 `workspace-fingerprint.ts` 的权限错误和超大目录。

---

## 8. 结论与可执行建议汇总

### 8.1 立即执行（P0）

1. **`src/tools/register.ts:31`**：`boundedText` 增加 `typeof value !== 'string'` 防御。
2. **`src/session-event-compat.ts`**：将 Set 变异改为防御式（try/catch + has 检查），并推动宿主提供官方注册 API。

### 8.2 短期改进（P1）

3. **`src/tools/register.ts`**：对 `summarizeRun` 中的 `evidence` 数组做递归有界化。
4. **`src/tools/register.ts:173`**：移除 `report.status` 的默认值，强制模型显式传入。
5. **`src/plugin.ts:81-92`**：保存 `sessionProjections.register` 的 dispose 句柄，在 service dispose 时清理。
6. **`src/plugin.ts:106-116`**：将 `ctx.on` 监听器改为 `ctx.effect` 绑定，确保与 service 生命周期一致。
7. **`src/adapters/workspace-fingerprint.ts`**：统一 `normalizeScope` 与 `isSafeScope`，增加目录遍历的容错。
8. **PRD 14.1 偏差**：确认 Git HEAD 纳入指纹的计划，或在当前实现中补充文档说明 MVP 范围。

### 8.3 中期优化（P2-P3）

9. **`src/adapters/session-event-store.ts`**：将 `jsonClone` 替换为 `structuredClone`，并增加 runId→Session 索引。
10. **`src/tools/register.ts:222-229`**：`currentTurnId` 增加缓存或遍历窗口限制。
11. **软引导覆盖**：对 `party_phase` 非法值、`work_claim` 重复领取等高频误用路径增加结构化拒绝。
12. **性能**：在 `observeAgentTurnEnd` 前增加非 dungeon Session 的快速排除路径。

---

*本报告仅针对指定文件进行只读评审，未修改任何源文件。所有发现均附行号与证据，不确定处已标注「待验证」。*
