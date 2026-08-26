# 三大主要问题总结与修复点清单

> 审查日期：2026-08-25
> 范围：Agent 命名链、多 Agent 调度/租约/检查点/中断链路、`work_submit` 提交审计链路
> 方式：源码逐层走查（`src/`、`preset/`、`client/`、`tests/`），并对照依赖包契约（`@deepseek-ai/dsh-subagent` descriptor/label 语义、`dsh-agent` AgentRegistry、`dsh-client-runtime` SessionSummary）
> 版本基线：`0.1.11`。本文汇总本轮讨论确认的三个主要问题及其全部修复点，作为后续实施的唯一依据；与 `full-stack-review-2026-08-24.md` 的既有结论互补，不重复。

> **落地状态（2026-08-25 更新）**：全部 10 个代码侧 P0 项已按 TDD 实施完成（新增/改写 16 个测试，全量 196/196 通过，`tsc --noEmit` 与 `eslint .` 干净）。明细见第 7 节；P1/P2 项仍待后续排期。

## 0. 摘要

| # | 问题 | 一句话结论 | 核心修复点数 |
|---|---|---|---|
| 1 | Agent 命名不明确 | 身份链（runId → sessionId → descriptor label）全部落在裸 UUID 上，人设名只存在于系统提示词和自制 overlay | 4 |
| 2 | 多个 subagent 相互打架、任务执行不成功 | 默认串行写租约 + 并行派发 + 3 分钟心跳误判 + 中断救援死代码，形成“抢锁空转 → 误判卡死 → 租约到期 → 接力打架 → 全队冻结”的级联 | 7 |
| 3 | `work_submit` 提交失败 | 串行模式要求“模型自报文件列表 == 主机实测 diff”精确相等，副产物/删除/他人写入/重启重建基线都会打破它，且报错不回显 diff | 7 |

优先级总表见文末第 4 节。

---

## 1. 问题一：Agent 命名不明确（UUID 当名字）

### 1.1 现象

- DSH GUI 的会话列表 / 子代理列表中，队伍成员显示为 `f47ac10b-58cc-…-dps-1-g1`、`f47ac10b-… · dps-1` 之类的 UUID 串，无法区分哪个是 DPS-1、哪个是 Healer。
- 插件自制 overlay（`client/index.tsx`）里有完整人设名（守誓者/焰刃/影行者/星术师/圣谕者），与底层身份完全割裂。

### 1.2 根因链（逐层证据）

1. **runId 默认是裸 UUID**：`src/service/dungeon-service.ts:639` 默认 `idGenerator = crypto.randomUUID()`；`startRun`（`:653`）`runId = input.runId ?? this.idGenerator()`。`party_start`（`src/tools/register.ts:479`）只有模型显式传 `runId` 才携带，而 Tank 人设（`preset/dungeon-party/agent.cordis.yml:11`）明确写 “the host supplies runId”，诱导模型不传 → 必然命中裸 UUID。
   - 不一致点：`party_recover` 重启分支（`src/tools/register.ts:825`）却生成 `` `run-${randomUUID()}` ``，两处生成逻辑互不统一。
2. **子 Agent sessionId 直接拼 runId**：`src/adapters/party-agent-manager.ts:1029`（`createMember`）与 `:599`（战复 replace 分支）：`sessionId = \`${runId}-${slot}-g${generation}\``。
3. **子代理“展示名”也是 UUID**：`ensureSubagentDescriptor`（`party-agent-manager.ts:978-988`）写 `label: \`${runId} · ${slot}\``。按 `@deepseek-ai/dsh-subagent` descriptor 契约（`lib/types/descriptor.d.ts:54-67`），该 `label` 正是 GUI 子代理枚举识别会话的“durable creation label”。
4. **会话侧栏无可读标题**：`dsh-client-runtime` 的 `SessionSummary.displayTitle` 回退链为“持久 title → 工作区 basename → session id”。项目从未给子 Session 写 `session/title` 事件，而全队共用同一 `workspaceRoot` → 侧栏要么五个成员同名（工作区名），要么直接显示带 UUID 的 session id。
5. **人设名只用在看不见的地方**：`rolePersonas`（`party-agent-manager.ts:43-48`）只注入系统提示词；`partyIdentity`（`client/index.tsx:24-36`）只画在 overlay。

### 1.3 修复点

| 编号 | 修复点 | 位置 | 具体改动 |
|---|---|---|---|
| 1.1 | 可读默认 runId | `src/service/dungeon-service.ts:639` | 默认 `idGenerator` 改为 `` `run-<yyyyMMdd-HHmmss>-<rand4>` ``（或 objective 短 slug + 随机尾缀），保持唯一、短小、可排序；sessionId/事件存储均为字符串键，不受影响 |
| 1.2 | 统一 runId 生成 | `src/tools/register.ts:825` | `party_recover` 重启分支复用 1.1 的同一生成器，消除 `run-` 前缀不一致 |
| 1.3 | descriptor label 用人设名 | `src/adapters/party-agent-manager.ts:978-988` | 新增角色短名映射（复用 `rolePersonas`/`partyIdentity` 的名字，如 “Pyra · DPS-1”），`label` 改为人设名 + 槽位（如需跨 run 消歧附 runId 短尾）；这是 GUI 可读性的关键一行 |
| 1.4 | （可选）子会话标题 | `createMember`/`restoreMember`/`completeDpsResurrection` | 创建后追加 `session/title` 事件（`{ title, messageSeqs, source }`，host 有 `dsh-session-title` 机制），让侧栏 `displayTitle` 可读；实施前需验证 host 对 `provider` 来源 title 的接受语义 |
| 1.5 | 人设名单一数据源 | `rolePersonas` 与 `client/index.tsx:24-36` | 收敛为一处定义、两端引用，避免“名字两套、展示三处”漂移（与既有 review P3-2/P3-3 呼应） |
| 1.6 | 测试同步 | `tests/agent-manager.test.ts:103` | 现有宽松断言 `label: expect.stringContaining('dps-1')` 需随 1.3 收紧为人设名断言 |

---

## 2. 问题二：多个 subagent 相互打架、任务执行不成功

### 2.1 现象

任务经常执行不成功；表面上像多个 DPS 互相冲突，实际上默认串行模式下两个写租约根本无法并存——真正的问题是下述机制级联让 Agent 与系统互搏。

### 2.2 故障级联（按发生顺序）

**① 默认串行写租约 vs 并行派发 → 3 个 DPS 抢 1 把锁**
- 默认 `scopeEnforcementMode: 'auto'` 且无写遥测 → 实际生效 `'serial'`（`src/service/dungeon-service.ts:428-432, 476-482`）。
- serial 模式下同一时间只允许一个写租约：第二个 `work_claim` 抛 `WRITE_DISPATCH_SERIALIZED`（`dungeon-service.ts:880-887`）。
- 但 `dispatchAvailableTasksUnlocked`（`src/adapters/party-agent-manager.ts:295-341`）照样把 3 个任务分给 3 个 DPS 并全部下发工作令 → 1 个干活、2 个空转重试。
- 空转 slot 因持有 `ready` 任务被 `busySlots` 判忙，`work_submit` 后的 kickScheduler 也不会重新调度；只能靠 DPS 自己重试或看门狗**每 5 分钟**重推工作令（`party-agent-manager.ts:198-211`），重推还会反复注入“立刻 work_claim”，加剧空转。

**② 3 分钟检查点心跳 vs LLM 长回合 → 误判“卡死”**
- 检查点 3 分钟到期、1 分钟宽限、连续 2 次未交即 `stalled`（`dungeon-service.ts:443-445, 1526-1555`）。
- DPS 只能在回合内的工具调用里交 `member_checkpoint`；跑测试/大量编辑的回合轻松超过 8 分钟，物理上无法心跳。
- 看门狗调用 `evaluateTaskProgress(runId, taskId, {})`（`party-agent-manager.ts:216`）**永远传空 observations**：`hasActiveLongTask / hasRecentActivity` 豁免位从未接线，“正在干活”与“死了”不可区分。

**③ 判停后唯一救援手段 `party_interrupt` 是死代码**
- 中断要求精确活跃 turnId（`dungeon-service.ts:1445-1453`），但**没有任何面向 tank 的输出暴露 `currentTurnId`**：`party_status` 的 tasks 摘要、`party_health` 的 taskProgress、stall 告警文案（`party-agent-manager.ts:226-232`）都不含。
- 测试靠直接调 `service.registerTaskTurn` bypass（`tests/interrupt-and-reassign.test.ts:39`）；真实运行中 tank 必然 `TURN_ID_MISMATCH`。

**④ 卡死任务霸占唯一写租约 → 全队冻结 → 到期后“接力打架”**
- 结合 ①③：stalled 任务握着唯一写租约，其他 DPS 全部被 `WRITE_DISPATCH_SERIALIZED` 拒绝，整个 run 冻结至租约到期（默认 10 分钟）。
- 到期后 `task-lease-revoked(reason='lease-expired')` **删除 ownerSlot、任务回池**（`dungeon-service.ts:2325-2339`），看门狗改派给另一个 DPS；新 DPS 审计基线取“当前工作区快照”（`party-agent-manager.ts:677-686`），前任的半成品编辑被整体吸收 → 两代 Agent 在同一批文件上接力。
- 给原 DPS 的停止通知只是排队中的 `next-step` 消息，回合未结束时拦不住。

**⑤ tank 无写保护，随时下场乱写**
- 执行守卫只装在子 Agent setup（`ensureGuardInstalled`，`party-agent-manager.ts:894-900`；healer 也跳过）；tank 是根 Session、全量工具、零守卫。
- tank 改动租赁范围内文件 → 串行提交审计要求上报==实测（`party-agent-manager.ts:731-739`）→ `CHANGED_FILES_MISMATCH` → 提交失败 → 任务 failed → 重试返工（与问题三 A 直接耦合）。

**⑥ 健康信号过敏雪上加霜**
- `observeAgentTurnEnd`（`dungeon-service.ts:1317-1346`）把 `blocked`/`error`/`max-tokens` 结束的回合记为 warning/critical，2 分钟内 2 次 → `degraded`/`unavailable`。
- `unavailable` 的 slot 不能 claim（`claimTask`，`dungeon-service.ts:860`）；healer unavailable 还会冻结所有新租约（`:866`）。空转中的等待审批、上下文上限都会加速队伍降级。

### 2.3 修复点

| 编号 | 优先级 | 修复点 | 位置 | 具体改动 |
|---|---|---|---|---|
| 2.1 | P0 | 接线活动信号，杜绝误判停 | `src/plugin.ts:129-135`、`party-agent-manager.ts:216` | `session/event` 监听器已在，顺手记录每个 DPS session 的最近活动时间（`turn/start`、`step/start`、`tool/call`、`assistant/chunk`）；看门狗评估时传 `hasRecentActivity`（或按 owner handle 活跃状态传 `hasActiveLongTask`） |
| 2.2 | P0 | 暴露 `currentTurnId`，救活中断路径 | `src/tools/register.ts`（`summarizeRun` tasks、`party_health` taskProgress）、`party-agent-manager.ts:226-232` | 面向 tank 的输出中加入 `currentTurnId`，stall 告警文案直接携带；否则 `party_interrupt` 永远是死代码 |
| 2.3 | P0 | serial 模式改“排队派发” | `party-agent-manager.ts:295-341` | serial 且已有活跃写租约时，不再 assign+dispatch 新的写任务（留在池中）；`WRITE_DISPATCH_SERIALIZED` 报错文案改为明确指引“用 `party_wait` 等待，勿重试” |
| 2.4 | P1 | 改派/重领前确认原 Agent 停手 | `party-agent-manager.ts`（租约到期改派分支，仿 `interruptTask` `:765-796`） | 先 `cancel` + `whenIdle` 原 owner agent，再允许新 claim，防止接力写 |
| 2.5 | P1 | 给 tank 加守卫 | `ensureGuardInstalled`/`installExecutionGuard` | EXECUTING/REPAIR 期间拦截 tank 对已租约 scope 的 write/edit/bash（复用现有守卫逻辑），消除 ⑤ |
| 2.6 | P1 | 健康信号降噪 | `dungeon-service.ts:1317-1346` | `blocked`（等待用户审批）不计入降级；`max-tokens` 窗口放宽；避免空转自伤 |
| 2.7 | P2 | 真并行：按租约归因审计 | `party-agent-manager.ts:710-740`（`leaseAudits` 已有每任务基线） | 提交审计从“全体活跃 scope 并集”改为“本租约自身基线的 diff ⊆ 本任务 writeScopes”；随后解除 serial，让 3 个 DPS 真正并行 |

---

## 3. 问题三：`work_submit` 提交失败

### 3.1 现象

任务干完了却提交不上去，常见报错：`CHANGED_FILES_MISMATCH`、`LEASE_EXPIRED`/`STALE_LEASE`、`WORKSPACE_AUDIT_MISSING`、`GLOBAL_COMMAND_UNOWNED`、`IDEMPOTENCY_CONFLICT`、`MODIFIED_ASSERTIONS_REQUIRED`。

### 3.2 失败模式

**A. `CHANGED_FILES_MISMATCH`：串行精确匹配审计（最大提交杀手）**
语义（`party-agent-manager.ts:710-740`）：提交时主机重新快照并与 claim 基线求 diff，串行模式要求 `JSON.stringify(模型上报 changedFiles) === JSON.stringify(实测 diff ∩ 本任务 writeScopes)`。打破它的情形：
1. **工具链副产物不在忽略名单**：默认 `fingerprintIgnoreScopes` 只有 `.git/**`、`node_modules/**`、`.npm-cache/**`、`lib/**`、`dist/**`、`coverage/**`、`.dsh/dungeon-party/tmp/**`（`dungeon-service.ts:454-456`）。`tsconfig.tsbuildinfo`、`.eslintcache`、`package-lock.json` 变动、`test-results/**`、`playwright-report/**`、`.pytest_cache/**`、`__pycache__/**`、`build/**`、`.next/**`、`*.log`、`.DS_Store` 全部计入 diff，模型几乎不会上报 → 必然 mismatch。
2. **删除的文件也算 diff**（`diffWorkspaceSnapshots` 是前后键集对称差，`src/adapters/workspace-fingerprint.ts:60-64`），模型很少上报删除。
3. **无 Agent 归因**：审计是“工作区发生了什么”。tank（无守卫）触碰租赁范围内文件、或 DPS 用 bash 起的 dev/watch 进程持续写入（守卫不拦）→ `actual` 被污染；后台进程还会导致每次重试 diff 都不同，永远修不对。
4. **宿主重启过的租约必然对不上**：`rebuildMissingLeaseAudits` 用当前工作区重建基线且错误被静默吞掉（`party-agent-manager.ts:105, 193, 693-708`），重启前该租约已做的编辑从 `actual` 消失 → 如实上报反而失败。
5. **报错不回显 diff**（`party-agent-manager.ts:736-738`），模型不知道多报还是漏报，只能盲重试。

**B. `LEASE_EXPIRED` / `STALE_LEASE`：活干完了，提交不了**
- 租约 10 分钟、心跳 3 分钟，长回合交不了检查点 → 到期（与问题二 ② 同源）。
- **sweep 被所有人即时触发**：`party_status`、`party_wait` 都执行 `sweepExpiredState`（`register.ts:541, 555`；`dungeon-service.ts:1207-1216`）。串行模式下空转 DPS 不停 poll → 干活的 DPS 租约一到期立刻被公开吊销 → 提交得 `LEASE_EXPIRED`（`dungeon-service.ts:929`）；任务回池被他人领走，成果被接力。
- 竞态窗口：审计快照与 `submitExecution` 提交非原子，中间并发 sweep 吊销租约 → 审计通过、提交抛 `STALE_LEASE`。

**C. `WORKSPACE_AUDIT_MISSING`：提交时没有审计基线**
- 重启后重建异步且吞错；`WorkspaceComputationQueue` 单 worker FIFO，worker 异常退出会把**队列中所有任务一起 reject**（`src/adapters/workspace-computation-queue.ts:138-147`）→ claim/checkpoint/submit 审计同时失效。

**D. 服务层报表校验的隐藏门槛**（`dungeon-service.ts:904-959`）
- `GLOBAL_COMMAND_UNOWNED`：`commandsRun` 提交时复核全局命令归属；跑过 `npm install` 但 tank 未声明 ownership → 被拒（`:949-959`）。
- `IDEMPOTENCY_CONFLICT`：提交成功但结果丢失后重试，内容稍有差异即被拒，且错误不回显已存 payload。
- `MODIFIED_ASSERTIONS_REQUIRED`：`changedFiles` 命中 `tests/` 或 `*.test.*` 即强制声明“修改断言”，纯新增测试也被逼编造披露（`:938-947`）。
- `INVALID_REPORT`：status=completed 必须带非空 evidence（`:948`）。

**E. 配置与性能陷阱**
- `fingerprintIgnoreScopes` 自定义是**整体替换**而非合并（`dungeon-service.ts:464-466`）；漏配 `node_modules/**` 会让快照遍历 node_modules，worker 可能跑挂并触发 C。
- 每次 claim/checkpoint/submit 全量读文件算 SHA-256，单 worker 串行；大工作区 + 高频检查点下，提交可能在排队中耗光租约。

### 3.3 修复点

| 编号 | 优先级 | 修复点 | 位置 | 具体改动 |
|---|---|---|---|---|
| 3.1 | P0 | 报错回显 diff | `party-agent-manager.ts:736-738` | `CHANGED_FILES_MISMATCH` 错误体带上 `actual vs reported` 的有界差集（复用 `boundedText`/上限约定），让模型一次重试自纠 |
| 3.2 | P0 | 串行精确匹配降级 | `party-agent-manager.ts:731-739` | 改为“`reported ⊆ actual` 且 `actual ∖ reported` 仅含副产物白名单则放行”，或“返回 diff 并要求确认式重报”；越界写仍按 `ACTUAL_WRITE_SCOPE_VIOLATION` 硬拒 |
| 3.3 | P0 | 忽略名单扩充 + 合并语义 | `dungeon-service.ts:454-456, 464-466` | 默认名单补充常见副产物（`tsconfig.tsbuildinfo`、`.eslintcache`、`test-results/**`、`playwright-report/**`、`.pytest_cache/**`、`__pycache__/**`、`build/**`、`.next/**`、`*.log`、`.DS_Store` 等）；自定义 `fingerprintIgnoreScopes` 与默认**合并**而非替换 |
| 3.4 | P0 | 提交与 sweep 互斥 | `party-agent-manager.ts:664-671`、`dungeon-service.ts:1207-1216` | `submitExecutionWithAudit` 期间禁止吊销该租约（或给提交一个短宽限窗口），消灭 B 类竞态 |
| 3.5 | P1 | rebuild 不再吞错 | `party-agent-manager.ts:105, 193, 693-708` | 重建失败即冻结该任务提交并返回明确错误码（如 `AUDIT_REBUILD_FAILED`），不再静默 |
| 3.6 | P1 | 幂等冲突回显 | `dungeon-service.ts:912-922` | `IDEMPOTENCY_CONFLICT` 返回 priorReport 摘要，供模型按原样重放 |
| 3.7 | P1 | 测试披露规则放宽 | `dungeon-service.ts:938-947` | 仅“删改既有断言”需披露；纯新增测试不强制 `modifiedAssertions` |

---

## 4. 全局优先级汇总

| 优先级 | 编号 | 修复点 | 同时缓解的问题 |
|---|---|---|---|
| P0 | 2.1 | 看门狗接线活动信号 | 二②、三B |
| P0 | 2.2 | 暴露 `currentTurnId` | 二③④ |
| P0 | 2.3 | serial 排队派发 + 等待指引 | 二①、三B（减少 poll 触发 sweep） |
| P0 | 3.1 | mismatch 报错回显 diff | 三A |
| P0 | 3.2 | 串行精确匹配降级 | 三A、二⑤ |
| P0 | 3.3 | 忽略名单扩充 + 合并语义 | 三A、三E |
| P0 | 3.4 | 提交与 sweep 互斥 | 三B |
| P0 | 1.1 | 可读默认 runId | 一 |
| P0 | 1.2 | 统一 runId 生成 | 一 |
| P0 | 1.3 | descriptor label 人设名 | 一 |
| P1 | 2.4 | 改派前确认原 Agent 停手 | 二④、三A |
| P1 | 2.5 | tank 加写保护守卫 | 二⑤、三A |
| P1 | 2.6 | 健康信号降噪 | 二⑥ |
| P1 | 3.5 | rebuild 不吞错 | 三A、三C |
| P1 | 3.6 | 幂等冲突回显 | 三D |
| P1 | 3.7 | 测试披露规则放宽 | 三D |
| P1 | 1.5 | 人设名单一数据源 | 一 |
| P2 | 2.7 | 按租约归因审计、解除 serial | 二①、三A（根治并行） |
| P2 | 1.4 | 子会话 `session/title` | 一 |
| P2 | 1.6 | 测试断言收紧 | 一 |

## 5. 不改代码的临时缓解（配置层）

1. **放宽租约/心跳时序**（缓解问题二②④、三B），插件配置 `dungeon` 字段（注意约束 `taskLeaseDurationMs > maxMissedCheckpoints × (progressCheckpointIntervalMs + checkpointResponseTimeoutMs)`）：
   ```yaml
   dungeon:
     progressCheckpointIntervalMs: 600000    # 10 分钟
     checkpointResponseTimeoutMs: 120000     # 2 分钟
     maxMissedCheckpoints: 4
     taskLeaseDurationMs: 3600000            # 60 分钟 > 4×(10+2) 分钟 ✔
   ```
2. **忽略名单补齐**（缓解三A）：`dungeon.fingerprintIgnoreScopes` = 默认 7 条 **全部带上** + 项目副产物（配置是整体替换语义，漏掉 `node_modules/**` 会引发三E）。
3. **行为约束**：tank 在 EXECUTING/REPAIR 期间不直接 write/edit 工作区；任务期间不起 dev/watch 后台进程；`changedFiles` 上报包含删除的文件；任务切到“一个回合内可 claim→完成→submit”的粒度。

## 6. 实施注意事项

- 问题二的 2.1/2.3 与问题三的 3.4 互为前提：减少空转 poll 能降低 sweep 压力，而提交互斥是兜底。
- 2.7（按租约归因）落地后，3.2 的“副产物白名单”可进一步收紧，因为跨任务写入将被精确归因。
- 1.3 改动会影响 `tests/agent-manager.test.ts` 的 label 断言；1.1 会影响所有内嵌 runId 的 sessionId 快照测试，需一并更新。
- 既有 `reviews/full-stack-review-2026-08-24.md` 的 P0/P1 修复项与本文无重叠；若其“性能重构（原地 reducer/版本化快照）”立项，可顺带解决 3.2/E 中的快照成本问题。

## 7. 已落地实施明细（2026-08-25，TDD）

全部按“先写失败测试 → 实现 → 转绿”推进；基线 180 测试不回归，新增/改写后 196/196 通过。

| 编号 | 修复点 | 实现位置 | 覆盖测试 |
|---|---|---|---|
| 1.1 | 可读默认 runId `run-<UTC日期>-<UTC时间>-<4hex>` | `src/service/dungeon-service.ts` 新增 `createReadableRunId`，`startRun` 默认改用它 | `dungeon-service.test.ts` 格式确定性 + 缺省唯一性 2 例 |
| 1.2 | 统一 runId 生成 | `src/tools/register.ts` `party_recover` 重启分支改用 `createReadableRunId`，移除 `randomUUID` 依赖 | 随 `dsh-tools.test.ts` 回归 |
| 1.3 | descriptor label 人设名 | `party-agent-manager.ts` 新增 `rolePersonaNames`（Pyra/Nyx/Aster/Lumina），label 改为 `Pyra · dps-1` 形态 | `agent-manager.test.ts` 四槽位 label 断言（原宽松断言收紧） |
| 2.1 | 看门狗接线活动信号 | `PartyAgentManager` 增加 `clockMs` 注入、`observeSessionActivity`/`lastActivityAt`，`runWatchdog` 评估时传 `hasRecentActivity`（窗口=`readinessEvaluationWindowMs`）；`plugin.ts` 将所有 `session/event` 转发为活动信号；服务新增 `getReadinessEvaluationWindowMs` | `watchdog.test.ts` 活跃豁免/静默判停 2 例；`cordis-plugin.test.ts` 接线断言 |
| 2.2 | 暴露 `currentTurnId` | `summarizeRun` tasks、`party_health` taskProgress 增加 `currentTurnId`；`output-schemas.ts` 两处补字段；stall 告警文案携带精确 turnId 与 `party_interrupt` 指引 | `dsh-tools.test.ts` 工具输出断言；`watchdog.test.ts` 告警含 `turn-9` |
| 2.3 | serial 排队派发 | `dispatchAvailableTasksUnlocked` 经 `serialWriteBlocked`（读实时 run 状态）跳过已有活跃写租约/已分配待领的写任务；`WRITE_DISPATCH_SERIALIZED` 文案指引 `party_wait` | `agent-manager.test.ts` 排队/续派 2 例 + 改写双分配回归用例；`dungeon-service.test.ts` 文案断言 |
| 3.1 | 报错回显 diff | `CHANGED_FILES_MISMATCH` 错误体含“未上报/多报”两个有界清单（`boundedPathList` 上限 20） | `agent-manager.test.ts` 漏报/多报均断言错误含具体路径 |
| 3.2 | 串行精确匹配降级 | 新增 `submitByproductScopes` 配置（默认含三种 lockfile、`*.tsbuildinfo`、`.eslintcache`、`*.log`、`.DS_Store`），审计改为“差集仅含副产物即放行”；副产物豁免同时作用于越界检查 | `agent-manager.test.ts` lockfile 豁免用例；`repair-and-config.test.ts` 默认值+合并断言 |
| 3.3 | 忽略名单扩充 + 合并语义 | 默认 `fingerprintIgnoreScopes` 增 10 项常见副产物；`resolveDungeonConfig` 改为与默认**合并去重**（不再整体替换），并做 `isSafeScope` 校验 | `repair-and-config.test.ts` 2 例（原“替换”用例改写为合并断言） |
| 3.4 | 提交与 sweep 互斥 | 服务新增 `protectSubmit`/`releaseSubmit`（`SUBMIT_PROTECTION_GRACE_MS=60s`，窗口锚定租约到期点），`sweepExpiredState` 跳过受保护租约，`submitExecution` 在窗口内容忍到期租约；`submitExecutionWithAudit` 全程保护并在 finally 释放 | `dungeon-service.test.ts` 窗口内保活/释放后恢复吊销 2 例；`agent-manager.test.ts` 长回合到期仍可提交全链路用例 |

**行为变更提示**（对部署方可见）：
- `fingerprintIgnoreScopes` 配置语义从“替换”变为“与默认合并”，依赖旧替换语义排除默认项的部署需复核（第 5 节缓解配置示例已按合并语义给出）。
- serial 模式下并行派发多写任务不再发生：第二个写任务保持 `pending` 直到首个写租约提交/失效；依赖旧“三写并行派发”行为的集成需适配。
- 子代理枚举标签由 `<uuid> · <slot>` 变为 `<人设名> · <slot>`；若有外部系统按旧标签解析需适配。
- 未配置 `runId` 的 run 从裸 UUID 变为 `run-<UTC日期>-<UTC时间>-<4hex>`。

**未实施（后续排期）**：1.4（session/title）、1.5（人设单一数据源）、1.6 已随 1.3 收紧、2.4、2.5、2.6、2.7、3.5、3.6、3.7。
