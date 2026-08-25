> **状态（2026-08-24 标注）**：本报告基于更早代码快照，行号与部分结论已失效；请以 `reviews/full-stack-review-2026-08-24.md` 为准。其中的 P0/P1 项已在后续修复中落地并补充回归测试。

# 核心状态机与事件溯源评审报告（src/service）

> **评审范围**：`src/service/dungeon-service.ts`（2204 行）、`src/service/memory-event-store.ts`（31 行）、`src/index.ts`（13 行）  
> **对照文档**：`docs/dsh-dungeon-party-prd.md`（2001 行）  
> **测试参考**：`tests/dungeon-service.test.ts`（483 行）  
> **评审日期**：2026-08-21  
> **评审人**：Pyra the Flameblade（DPS-1）  
> **状态**：只读评审，未修改 src/、tests/、docs/ 下任何文件

---

## 1. 逐文件覆盖声明

| 文件 | 已读行数范围 | 说明 |
|---|---|---|
| `src/service/dungeon-service.ts` | 1–2204（全文） | 核心状态机、事件溯源 reducer、租约/检查点/战复/门禁 |
| `src/service/memory-event-store.ts` | 1–31（全文） | 内存事件存储实现 |
| `src/index.ts` | 1–13（全文） | 包导出入口 |
| `docs/dsh-dungeon-party-prd.md` | 1–2001（全文） | 产品需求与验收标准 |
| `tests/dungeon-service.test.ts` | 1–483（全文） | 单元测试覆盖参考 |

---

## 2. 发现汇总（按严重级别排序）

### 🔴 P0-001：事件序列号在并发追加时存在竞态窗口（正确性）

- **位置**：`src/service/dungeon-service.ts:1769`
- **代码**：
  ```ts
  sequence: this.eventStore.load(run.id).length + 1,
  ```
- **问题**：`append()` 方法在内存中先计算 sequence，再调用 `eventStore.append()`。若两个并发调用同时执行到该点，会生成相同的 sequence 号。`MemoryDungeonEventStore` 虽有 sequence 校验（第 16 行），但抛出的是 `DungeonError('EVENT_SEQUENCE_CONFLICT')`，这会导致**其中一个合法操作被错误拒绝**，而非自动重试。
- **影响**：在高并发场景（如多个 DPS 同时提交 checkpoint 或执行报告）下，合法事件可能被错误拒绝，导致任务状态无法推进。
- **建议**：
  1. 在 `DungeonEventStore` 接口中增加原子 `append` 语义，由存储层负责分配 sequence；或
  2. 在 `DungeonService` 中使用按 runId 的互斥锁（如 `AsyncLock`）序列化 `append` 调用；或
  3. 捕获 `EVENT_SEQUENCE_CONFLICT` 后自动重试（需确保幂等键不变）。
- **PRD 对照**：PRD §15.2 要求"同一 runId 的 sequence 必须单调递增"，但未明确并发策略；§18.1 要求"关键写操作具备幂等性"。

---

### 🔴 P0-002：`reduce` 中 `clone(current)` 与 `Object.assign(run, updated)` 双重变异导致 reducer 不纯（正确性）

- **位置**：`src/service/dungeon-service.ts:1780`, `1785–2142`
- **代码**：
  ```ts
  const updated = this.reduce(this.runs.get(run.id), canonicalEvent)
  this.runs.set(run.id, updated)
  Object.assign(run, updated)   // 就地变异传入的 run 对象！
  ```
- **问题**：`reduce` 先 `clone(current)`，但 `Object.assign(run, updated)` 在 `append()` 中**就地变异**了调用者传入的 `run` 对象。更关键的是，`append` 中的 `Object.assign(run, updated)` 会导致**旧引用与新对象混合**，如果调用者持有 `run` 的引用，其内部嵌套对象（如 `tasks`）会被部分替换，产生不一致状态。
- **影响**：
  1. 若外部代码缓存了 `DungeonRun` 引用（如 GUI 层），`Object.assign` 会导致其状态部分更新、部分陈旧；
  2. `reduce` 理论上应是纯函数，但 `Object.assign(run, updated)` 使其调用者产生副作用。
- **建议**：
  1. 移除 `Object.assign(run, updated)`，让 `append` 的调用者自行处理返回值；或
  2. 在 `append` 中不传入可变 `run` 对象，而是始终从 `this.runs` 获取并替换。
- **PRD 对照**：PRD §15.4 要求"快照只用于加速恢复，Session Log 仍是可审计事实来源"，隐含 reducer 必须可重放、无副作用。

---

### 🔴 P0-003：`staleReports` 在 `validation-submitted` 事件处理中被错误调用（正确性）

- **位置**：`src/service/dungeon-service.ts:2129–2131`
- **代码**：
  ```ts
  case 'dungeon/validation-submitted':
    this.staleReports(run)
    run.validationReports.push(payload.report)
  ```
- **问题**：`staleReports` 将**所有**现有报告标记为 `stale`，包括刚刚要添加的新报告。虽然 `push` 在 `staleReports` 之后执行，新报告不会被标记，但逻辑上**提交新报告时不需要使旧报告失效**——旧报告应该已经在之前的事件（如 `workspace-fingerprint-observed`、`task-reopened`、`validation-manifest-created`）中被标记为 `stale` 了。更严重的是，如果同一 validation attempt 因网络重试导致 `validation-submitted` 事件被重放，`staleReports` 会把**已经 current 的报告再次 stale**，然后 push 一个重复的 current 报告，导致有两个 current 报告。
- **影响**：重放或并发提交时可能产生多个 `current` 报告，破坏完成门禁的"唯一 current pass"假设。
- **建议**：移除 `dungeon/validation-submitted` 事件处理中的 `this.staleReports(run)` 调用。报告失效应由版本变化事件（task/manifest/fingerprint 变更）触发。
- **PRD 对照**：PRD §9.3 规定"新清单生成时，所有引用旧 manifestVersion 的验收报告立即变为 stale"；代码中 `validation-manifest-created` 和 `task-reopened` 已正确调用 `staleReports`。

---

### 🟠 P1-001：`waitForChange` 的 `onChange` 竞态可能导致事件丢失（健壮性）

- **位置**：`src/service/dungeon-service.ts:1675–1721`
- **代码**：
  ```ts
  const onChange = () => finish(false)
  // ...
  listeners.add(onChange)
  const timer = setTimeout(() => finish(true), timeoutMs)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  else onChange()   // <-- 立即调用 onChange
  ```
- **问题**：`onChange()` 在注册监听器后被**立即调用**。此时如果 `newerEvents()` 返回空数组，`finish(false)` 会因 `!timedOut && events.length === 0` 而提前返回（不 resolve）。这是正确的。但如果在 `onChange()` 执行和 `finish` 的 `settled` 检查之间，有新事件被追加，`notify()` 可能因 `listeners` 中尚未完全稳定而被错过。
  更实际的问题是：`onChange()` 立即调用时，`newerEvents()` 可能为空，此时 `finish` 不 resolve，等待者继续等待。这是正常行为。但代码中 `else onChange()` 在 `signal.aborted` 为 false 时立即触发一次检查，这在语义上是多余的（因为上面已经检查过 `immediate.length > 0`），且可能因 `settled` 标志的竞态导致微妙问题。
- **影响**：在极端竞态下，等待者可能错过事件通知，导致超时后才返回。
- **建议**：移除 `else onChange()`，或确保 `onChange` 的立即调用与 `immediate` 检查逻辑一致。当前逻辑已在上文检查 `immediate.length > 0`，无需再次调用。
- **PRD 对照**：PRD §12.1 中 `party_wait` 是核心工具，事件丢失会导致 T 调度延迟。

---

### 🟠 P1-002：`submitCheckpoint` 续签 lease 但不校验 `task.status === 'running'`（正确性）

- **位置**：`src/service/dungeon-service.ts:1412–1443`
- **代码**：`submitCheckpoint` 只校验 lease 存在且未过期，但未显式校验 `task.status === 'running'`。
- **问题**：如果任务已被中断（`interruptState === 'completed'`）但 lease 尚未被撤销，或任务处于 `blocked`/`failed` 状态，checkpoint 仍可能被接受。
- **影响**：中断后的竞态 checkpoint 可能被错误接受，导致任务状态混乱。
- **建议**：增加 `assert(task.status === 'running', 'TASK_NOT_RUNNING', ...)`。
- **PRD 对照**：PRD §10.9.3 要求"lease 到期后旧 owner 不得继续产生新写入或提交完成报告，Agent 也不能自行续签"。

---

### 🟠 P1-003：`evaluateTaskProgress` 的 `nextCheckpointDueAt` 计算不基于原始 lease grantedAt（正确性）

- **位置**：`src/service/dungeon-service.ts:1368–1382`
- **代码**：`nextCheckpointDueAt: new Date(now + this.config.progressCheckpointIntervalMs).toISOString()`
- **问题**：`nextCheckpointDueAt` 被设置为 `now + progressCheckpointIntervalMs`，而不是基于 `task.activeLease.grantedAt` 的固定间隔。这导致：
  1. 如果 DPS 在接近 deadline 时提交 checkpoint，`nextCheckpointDueAt` 会从当前时间重新计算，可能**缩短**实际观察窗口；
  2. 多次 missed checkpoint 后，due 时间会逐渐漂移，不再与 lease 的原始时间线对齐。
- **影响**：停滞判定的时间窗口可能不一致，导致过早或过晚标记 stalled。
- **建议**：`nextCheckpointDueAt` 应基于 `activeLease.grantedAt` 计算：`new Date(Date.parse(activeLease.grantedAt) + (missedCount + 1) * progressCheckpointIntervalMs).toISOString()`。
- **PRD 对照**：PRD §10.9.3 要求"计时规则：任务领取时创建首个 checkpoint due；每经过一个 progressCheckpointIntervalMs 后进入响应窗"。

---

### 🟠 P1-004：`finishRun` 缺少"完成操作前重新计算工作区指纹"的防竞态校验（正确性）

- **位置**：`src/service/dungeon-service.ts:1625–1673`
- **代码**：`finishRun` 直接写入 `dungeon/run-completed`，没有 `prepared → 二次校验` 的两阶段提交。
- **问题**：PRD §14.1 明确要求完成操作使用两阶段提交：先写 `run-completion-prepared`，再重新计算指纹，只有两次一致才写 `run-completed`。当前实现直接写入 `run-completed`，缺少二次校验。
- **影响**：MVP 无法锁定外部进程修改，存在完成门禁被绕过的风险。
- **建议**：按 PRD 实现两阶段提交：
  1. `append(run, 'dungeon/run-completion-prepared', { ... })`；
  2. 重新计算指纹；
  3. 若一致则 `append(run, 'dungeon/run-completed', ...)`，否则 `append(run, 'dungeon/run-completion-aborted', ...)` 并 stale 报告。
- **PRD 对照**：PRD §14.1 第 4–7 点明确要求两阶段提交。

---

### 🟠 P1-005：`consumeCommanderRescueTicket` 不校验 `commanderBattleResChargesRemaining > 0`（正确性）

- **位置**：`src/service/dungeon-service.ts:1039–1051`
- **代码**：`consumeCommanderRescueTicket` 未校验剩余次数。
- **问题**：`markCommanderUnavailable` 在签发票据时已扣减 `commanderBattleResChargesRemaining`，但 `consumeCommanderRescueTicket` 未校验剩余次数。如果票据被重放或存储层异常，可能消费不存在的次数。
- **影响**：战复次数可能被透支。
- **建议**：增加 `assert(run.commanderBattleResChargesRemaining > 0, 'NO_COMMANDER_RES_CHARGES', ...)`。
- **PRD 对照**：PRD §10.4 要求"消费时票据必须未过期、未消费，且 commanderBattleResCharges > 0"。

---

### 🟡 P2-001：`MemoryDungeonEventStore` 的 `append` 使用 `JSON.stringify` 做重复检测，无法处理 `undefined`、`BigInt`、循环引用（健壮性）

- **位置**：`src/service/memory-event-store.ts:10`
- **代码**：`if (JSON.stringify(duplicate) !== JSON.stringify(event))`
- **问题**：`JSON.stringify` 对 `undefined` 值的处理与 `structuredClone` 不一致，可能导致内容相同但序列化结果不同的误报冲突。
- **影响**：事件 payload 若包含 `undefined`，可能被错误判定为冲突。
- **建议**：使用 `structuredClone` 后的深度比较，或引入稳定序列化库。

---

### 🟡 P2-002：`resolveDungeonConfig` 对 `commanderBattleResCharges` 要求 `>= 1`，但 PRD 允许配置为 0（可维护性）

- **位置**：`src/service/dungeon-service.ts:457`
- **代码**：`assert(config.commanderBattleResCharges >= 1 ...)`
- **问题**：PRD §17.1 要求"正式五人本模式的 commanderBattleResCharges 至少为 1"，但"仅开发调试环境可关闭"。代码中硬编码 `>= 1`，不允许调试时设为 0。
- **影响**：开发调试不便。
- **建议**：放宽为 `>= 0`，或增加 `strictMode` 标志区分生产与调试环境。

---

### 🟡 P2-003：`DungeonService` 构造函数中 `recoverRun` 可能抛出异常，导致整个服务初始化失败（健壮性）

- **位置**：`src/service/dungeon-service.ts:586`
- **代码**：`for (const runId of this.eventStore.listRunIds?.() ?? []) this.recoverRun(runId)`
- **问题**：如果某个 run 的事件日志损坏，`recoverRun` 会抛出 `DungeonError`，导致**整个 `DungeonService` 初始化失败**。
- **影响**：单点故障扩散，服务完全不可用。
- **建议**：在循环中捕获单个 run 的恢复异常，记录错误并跳过损坏的 run，或将其标记为 `FAILED`。

---

### 🟡 P2-004：`observeAgentDisposed` 对 healer 的处理过于简单，未触发冻结副本（健壮性）

- **位置**：`src/service/dungeon-service.ts:903–923`
- **代码**：仅将 healer readiness 设为 `unavailable`，不冻结副本。
- **问题**：根据 PRD §10.3，奶连续超时且无法自我稳定时应"标记 down/unavailable，冻结副本并转人工恢复或失败"。
- **影响**：healer 故障后，DPS 可能继续提交执行报告，T 可能尝试完成副本，导致无验收的完成。
- **建议**：healer `unavailable` 时，至少将 `controlState` 设为 `paused`，并阻止新 lease 和完成操作。

---

### 🟡 P2-005：`requestBattleRes` 的幂等性基于 `resurrectionId`，但调用者通常不传该参数（可维护性）

- **位置**：`src/service/dungeon-service.ts:925–954`
- **代码**：`resurrectionId = this.idGenerator()`
- **问题**：`resurrectionId` 默认由服务生成，调用者（T）通常不传。如果 T 因网络超时而重试 `requestBattleRes`，会生成两个不同的 `resurrectionId`，导致两次扣减 `battleResChargesRemaining`。
- **影响**：T 的重试可能意外消耗多余战复次数。
- **建议**：要求调用者提供幂等键（如 `idempotencyKey`），或由工具层在重试时保持相同的 `resurrectionId`。

---

### 🟢 P3-001：`scopeEnforcementMode` 为 `telemetry` 时未实现精确审计（规范）

- **位置**：`src/service/dungeon-service.ts:798–805`
- **问题**：`telemetry` 模式下仅设置配置，但 `submitExecution` 中未实现按 Session 的写入审计。
- **影响**：PRD 中 P0 要求的"telemetry 模式能阻止单 Agent 越界"在代码中无实际支撑。
- **建议**：补充实现或明确标记为 TODO。

---

### 🟢 P3-002：`run-completion-prepared` 事件类型未使用（规范）

- **问题**：PRD §15.2 事件列表中包含 `dungeon/run-completion-prepared` 和 `dungeon/run-completion-aborted`，但代码中未处理。
- **建议**：按 P1-004 建议实现两阶段提交。

---

### 🟢 P3-003：`causationId` 在 `DungeonEvent` 接口中定义但从未使用（可维护性）

- **位置**：`src/service/dungeon-service.ts:298–308`
- **建议**：在 `append` 中支持传入 `causationId`，或移除该字段以避免误导。

---

### 🟢 P3-004：测试覆盖率不足（可维护性）

- **位置**：`tests/dungeon-service.test.ts`
- **问题**：483 行测试仅覆盖基础流程。以下关键路径无测试：战复、紧急指挥战复、任务中断与重派、停滞检测、checkpoint、健康信号、指挥官负载、冷恢复、并发场景。
- **建议**：补充上述路径的单元测试。

---

## 3. PRD 偏差清单

| PRD 要求 | 代码状态 | 偏差说明 |
|---|---|---|
| **§8.2 强制完成门禁 #5**：验收报告关联当前 workspaceFingerprint，且完成前重新计算 | ❌ 缺失 | `finishRun` 仅比对传入的 fingerprint，无二次计算（P1-004） |
| **§8.2 强制完成门禁 #6**：验收完成后没有产生新的文件修改或任务变更 | ⚠️ 部分 | 代码检查 fingerprint，但无两阶段 prepared → completed 机制 |
| **§8.2 强制完成门禁 #9**：RunControlState 为 normal，T 与奶均不处于 degraded/recovering/unavailable | ✅ 已实现 | `finishRun` 检查 `controlState === 'normal'` 和 readiness |
| **§10.4**：消费紧急票据时 `commanderBattleResCharges > 0` | ❌ 缺失 | `consumeCommanderRescueTicket` 未校验（P1-005） |
| **§10.5.2**：T 紧急战复成功后保持 `recovering` 直到 T 主动恢复 | ✅ 已实现 | `commander-resurrection-completed` 设置 `controlState = 'recovering'` |
| **§10.9.3**：`nextCheckpointDueAt` 基于固定间隔 | ⚠️ 偏差 | 代码使用 `now + interval`，导致漂移（P1-003） |
| **§14.1**：两阶段完成提交（prepared → aborted/completed） | ❌ 缺失 | 直接写入 `run-completed`（P1-004, P3-002） |
| **§15.2 事件列表**：`dungeon/run-completion-prepared` | ❌ 未使用 | 事件类型未在代码中处理 |
| **§15.2 事件列表**：`dungeon/run-completion-aborted` | ❌ 未使用 | 事件类型未在代码中处理 |
| **§17.1**：`commanderBattleResCharges` 调试环境可为 0 | ❌ 限制过严 | 代码要求 `>= 1`（P2-002） |
| **§21.5 恢复**：插件重启后重建队伍、任务和阶段 | ⚠️ 部分 | `recoverRun` 实现存在，但无测试覆盖，且 `reduce` 的纯度问题可能影响恢复正确性（P0-002） |

---

## 4. 状态机相位转换不变量核查

| 检查项 | 结果 | 说明 |
|---|---|---|
| 终态不可迁移 | ✅ | `terminalPhases` 检查在 `assertMutable` 中 |
| 允许迁移列表 | ✅ | `phaseTransitions` 显式定义 |
| EXECUTING 需 healer | ✅ | `changePhase` 第 685 行检查 |
| VALIDATING 需必需任务完成 | ✅ | `assertRequiredTasksComplete` 检查 |
| 完成需 VALIDATING 阶段 | ✅ | `finishRun` 检查 |
| REPAIR 需失败验收报告 | ✅ | `reopenTask` 检查 |
| 返工轮次上限 | ✅ | `maxRepairRounds` 检查 |

**潜在风险**：`changePhase` 中 `nextPhase === 'EXECUTING'` 时检查 healer 已绑定，但未检查 healer 的 `lifeState === 'alive'`。

---

## 5. 事件溯源 reducer 纯度与 structuredClone 使用

| 检查项 | 结果 | 说明 |
|---|---|---|
| `structuredClone` 用于事件存储 | ✅ | `MemoryDungeonEventStore.append` 和 `load` 均使用 |
| `structuredClone` 用于返回值 | ✅ | `clone()` 函数包装 `structuredClone` |
| reducer 内部不修改输入 | ⚠️ 风险 | `reduce` 中 `clone(current)` 正确，但 `append` 中 `Object.assign(run, updated)` 破坏纯度（P0-002） |
| 事件 payload 深度克隆 | ✅ | `append` 中使用 `jsonClone(event)` |

---

## 6. 租约/检查点/战复/Scope 门禁核查

| 检查项 | 结果 | 说明 |
|---|---|---|
| 租约版本校验 | ✅ | `submitExecution` 和 `submitCheckpoint` 均校验 leaseId + leaseVersion |
| 租约过期检查 | ✅ | `Date.parse(this.clock()) <= Date.parse(expiresAt)` |
| 检查点续签 lease | ✅ | `submitCheckpoint` 增加 version 并延长 expiresAt |
| 战复次数限制 | ✅ | `requestBattleRes` 检查 `battleResChargesRemaining > 0` |
| 战复代次限制 | ✅ | 检查 `generation < maxGenerationsPerSlot` |
| Scope 重叠检测 | ✅ | `createTask` 中 `scopesOverlap` 检查 |
| 全局命令唯一归属 | ✅ | `createTask` 和 `submitExecution` 均检查 |
| 写入范围越界检查 | ✅ | `submitExecution` 中 `matchesGlob` 检查 |
| 串行模式强制单写 | ✅ | `claimTask` 中 `WRITE_DISPATCH_SERIALIZED` 检查 |

---

## 7. 等待者唤醒机制

| 检查项 | 结果 | 说明 |
|---|---|---|
| 事件追加后唤醒 | ✅ | `append` 第 1782 行遍历 `this.waiters.get(run.id)` 并调用 `notify()` |
| 等待者清理 | ✅ | `cleanup()` 从 Set 中删除 listener，Set 为空时删除 runId 键 |
| AbortSignal 支持 | ✅ | `waitForChange` 支持 `AbortSignal` |
| 竞态保护 | ⚠️ 风险 | `settled` 标志防止重复 resolve，但 `onChange` 的立即调用可能引入竞态（P1-001） |

---

## 8. 配置校验完备性

| 检查项 | 结果 | 说明 |
|---|---|---|
| 正整数校验 | ✅ | `positiveIntegers` 数组遍历校验 |
| `maxConcurrentDps <= 3` | ✅ | 显式断言 |
| `taskLeaseDurationMs > minLease` | ✅ | 计算并断言 |
| `fingerprintIgnoreScopes` 安全校验 | ✅ | `isSafeScope` 检查 |
| `scopeEnforcementMode` 有效性 | ✅ | `includes` 检查 |
| `commanderBattleResCharges >= 1` | ⚠️ 过严 | 调试环境无法设为 0（P2-002） |
| `battleResCharges >= 0` | ✅ | 允许为 0 |

---

## 9. 时间与 ID 生成可测试性

| 检查项 | 结果 | 说明 |
|---|---|---|
| `idGenerator` 可注入 | ✅ | 构造函数支持自定义 |
| `clock` 可注入 | ✅ | 构造函数支持自定义 |
| 测试中使用时序递增 | ✅ | `tests/dungeon-service.test.ts` 使用 `tick++` 的 ISO 时间 |
| `Date.parse` 依赖系统时钟 | ⚠️ 风险 | 生产代码使用 `new Date().toISOString()`，但 `clock` 可覆盖 |

---

## 10. Top 5 改进项（按优先级排序）

### 1. [P0] 修复事件序列号并发竞态（P0-001）
**优先级：P0 | 分类：正确性**
- 在 `DungeonEventStore` 中增加原子 sequence 分配，或在 `DungeonService` 中引入按 runId 的互斥锁。
- 若不引入锁，至少应在 `EVENT_SEQUENCE_CONFLICT` 时自动重试（保持幂等键不变）。

### 2. [P0] 消除 `append` 中的 `Object.assign` 副作用，确保 reducer 纯度（P0-002）
**优先级：P0 | 分类：正确性**
- 移除 `Object.assign(run, updated)`，改为始终从 `this.runs` 获取最新状态。
- 确保 `reduce` 是纯函数，不依赖外部可变状态。

### 3. [P0] 移除 `validation-submitted` 中多余的 `staleReports` 调用（P0-003）
**优先级：P0 | 分类：正确性**
- 报告失效应由版本变化事件触发，而非提交事件本身。
- 避免重放时产生多个 `current` 报告。

### 4. [P1] 实现两阶段完成提交机制（P1-004）
**优先级：P1 | 分类：正确性**
- 按 PRD §14.1 实现 `run-completion-prepared` → 二次指纹校验 → `run-completed`/`run-completion-aborted`。
- 补充 `run-completion-prepared` 和 `run-completion-aborted` 的事件处理。

### 5. [P1] 修复 `nextCheckpointDueAt` 的漂移问题（P1-003）
**优先级：P1 | 分类：正确性**
- 基于 `activeLease.grantedAt` 的固定间隔计算 `nextCheckpointDueAt`，确保停滞判定窗口一致。

---

## 11. 其他值得关注的改进

- **测试缺口**：战复、中断、停滞检测、冷恢复等核心路径无测试覆盖（P3-004）。
- **Healer 故障保护**：`observeAgentDisposed` 对 healer 的处理过于简单，应冻结副本（P2-004）。
- **`causationId` 未使用**：建议填充或移除（P3-003）。
- **`telemetry` 模式未实现**：精确审计能力为 P0 要求，需补充实现或明确 TODO（P3-001）。

---

## 12. 结论

`src/service/dungeon-service.ts` 整体架构清晰，状态机定义完整，核心门禁（租约、Scope、战复次数、完成条件）基本实现到位。但存在 **3 个 P0 级正确性风险**（并发 sequence 竞态、reducer 副作用、validation stale 逻辑错误）和 **5 个 P1 级问题**（完成提交两阶段缺失、checkpoint 时间漂移、战复次数校验缺失等），需要在进入生产环境前优先修复。测试覆盖率严重不足，核心故障恢复路径缺乏自动化验证。

**总体评估**：核心框架合格，关键路径需加固。
