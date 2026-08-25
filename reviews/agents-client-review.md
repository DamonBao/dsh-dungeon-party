> **状态（2026-08-24 标注）**：本报告基于更早代码快照，行号与部分结论已失效；请以 `reviews/full-stack-review-2026-08-24.md` 为准。其中的 P0/P1 项已在后续修复中落地并补充回归测试。

# Agent 调度器与 UI 客户端评审报告

> 评审范围：`src/adapters/party-agent-manager.ts`（666 行）+ `client/index.tsx`（313 行）  
> 对照文档：`docs/dsh-dungeon-party-prd.md`（2001 行）  
> 测试覆盖：`tests/agent-manager.test.ts`（407 行）+ `tests/client-overlay.test.tsx`（122 行）+ `tests/client-bundle.test.ts`（26 行）  
> 评审日期：2026-08-21  
> 评审人：DPS-3（Aster the Starweaver）

---

## 执行摘要

本次评审覆盖 **PartyAgentManager**（子 Agent 编排调度器）与 **DungeonPartyOverlay**（Web UI 客户端）。整体架构清晰，核心流程（创建/恢复/替换、派发循环、战复、工作区审计）与 PRD 基本一致，23 项测试全部通过。但在**资源泄漏防护、并发竞态、agentOptions 继承完整性、UI 事件清理、无障碍与性能**等方面发现若干需要关注的问题。共记录 **P0 1 项、P1 4 项、P2 13 项、P3 3 项**，并列出 Top 5 改进项。

---

## 一、逐文件评审

### 1.1 `src/adapters/party-agent-manager.ts`（666 行）

#### 1.1.1 子 Agent 创建/恢复/替换路径

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 183–202 | `ensureMember` | 使用 `pending` Map 防止并发重复创建，正确。但 `existing && this.handles.has(key)` 的短路返回（L190）在**冷恢复后 Manager 重启但 Agent 仍存活**的场景下会跳过 `ensureSubagentDescriptor`，导致 descriptor 缺失。 |
| 193–195 | `restoreMember` / `createMember` 分支 | `restoreMember` 在 `existing` 为真时调用，但 `existing` 仅表示 `run.slots[slot].currentSessionId` 存在，不代表 Session 仍存活。若 Session 已死而 `currentSessionId` 未清理，会走入 `restoreMember` 并可能失败。 |
| 596–623 | `restoreMember` | 若 `live = this.agents.get(sessionId)` 存在（L598），直接构造 `dispose: async () => undefined` 的伪 Handle（L601）。这**绕过 `agents.resume` 的 setup 钩子**，导致 `installExecutionGuard`、`presets.composeFrom`、工具限制和 persona 注入全部缺失，形成**安全漏洞**。 |
| 625–661 | `createMember` | 正确：通过 `tankAgent.ctx.agents.create` 创建，完整执行 setup。`try/catch` 在 `bindMember` 失败时调用 `handle.dispose()`（L658），防止泄漏。 |
| 251–365 | `completeDpsResurrection` | resume 分支（L264–323）与 replace 分支（L324–365）逻辑正确。但 resume 分支中 `previousHandle` 为 `undefined` 时（L267），若 `live` 存在，构造的伪 Handle 同样**缺失执行守卫**（与 `restoreMember` 相同问题）。 |
| 204–249 | `recoverCommander` | 正确：优先 `cancel + whenIdle` 原地恢复，否则 `agents.resume`。`resumedHandle.dispose()` 在 catch 中清理（L233），`commanderHandles` 在成功后注册（L240）。 |

**关键发现：**

- **P1 — `restoreMember` 原地恢复时缺失执行守卫与角色注入**（`party-agent-manager.ts:598–601`）  
  当 Session 仍存活时，Manager 直接复用原 Agent 而不经过 `agents.resume` 的 setup 流程。这意味着：
  - `installExecutionGuard` 未注册，`write`/`edit`/`bash` 工具调用**不受 writeScopes 限制**；
  - `roleTools[slot]` 未重新限制，工具集可能包含不应授予的工具；
  - `rolePersonas[slot]` 未注入，Agent 可能丢失角色上下文。
  
  **证据：** L598–601 直接构造 `{ agent: live, dispose: async () => undefined }`，跳过 setup。  
  **建议：** 即使 Session 存活，也应通过 `agents.resume` 或等效机制重新执行 setup，或至少显式调用 `installExecutionGuard`、`tools.restrict` 和 `systemPrompt.section`。

- **P2 — `ensureMember` 冷恢复后可能跳过 descriptor 注入**（`party-agent-manager.ts:190`）  
  若 Manager 重启后 `run.slots[slot].currentSessionId` 存在且 `handles` 已重建（通过 `restoreBoundParty`），`ensureMember` 直接返回现有 sessionId，不调用 `ensureSubagentDescriptor`。  
  **建议：** 在 `restoreBoundParty` 或 `ensureMember` 中增加 descriptor 存在性校验，缺失时补注入。

#### 1.1.2 agentOptions 继承与覆盖

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 276–278 | `agentOptions: { ...tankAgent.options }` | resume 分支中正确浅拷贝 tank options。 |
| 332–333 | `agentOptions: { ...tankAgent.options }` | replace 分支中同样正确。 |
| 608 | `agentOptions: { ...tankAgent.options }` | `restoreMember` 的 resume 路径中正确。 |
| 633 | `agentOptions: { ...tankAgent.options }` | `createMember` 中正确。 |

**发现：**

- **P2 — `agentOptions` 浅拷贝可能丢失深层配置**（多处）  
  `{ ...tankAgent.options }` 是浅拷贝。若 `tankAgent.options` 包含嵌套对象（如 `tools`、`context` 等），子 Agent 可能意外共享引用。当前代码未观察到对此类嵌套字段的修改，但属于潜在风险。  
  **建议：** 标注为已知限制，或在 setup 中显式覆盖关键嵌套字段。

- **P2 — replace 模式未传递 `agentPreset` 到 `agentOptions`**（`party-agent-manager.ts:332`）  
  `createMember` 在 `meta.agentPreset` 中设置 `'dungeon-party'`（L338），但 `agentOptions` 中未设置 `preset` 字段。若宿主框架依赖 `agentOptions.preset` 而非 `meta.agentPreset`，可能导致 preset 未生效。  
  **建议：** 确认宿主框架的 preset 解析优先级，必要时在 `agentOptions` 中同步注入。

#### 1.1.3 自动派发循环终止条件与重入风险

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 78–89 | `kickScheduler` | 由 tank session 触发，catch 所有异常并返回 `[]`，防止单次调度失败阻塞整体流程。正确。 |
| 91–122 | `dispatchAvailableTasks` | 核心派发循环。正确检查 `EXECUTING` 或 `REPAIR` 阶段（L94），过滤 busy slots（L95–98），按优先级排序（L99–102）。 |
| 104–120 | 任务派发 for 循环 | 对每个任务调用 `preflightTaskAssignment`、`ensureMember`、`assignTask`、`dispatchTask`。异常处理中，对可恢复错误（SCOPE_OVERLAP 等）将 slot 放回队列（L115），继续下一个任务。正确。 |

**发现：**

- **P0 — `dispatchAvailableTasks` 存在并发重入导致重复派发风险**（`party-agent-manager.ts:91–122`）  
  该方法是 `async` 但未加互斥锁。若 `kickScheduler` 被高频触发（如状态变更事件密集），或 tank Agent 并发调用，可能产生多个并行的 `dispatchAvailableTasks` 执行。虽然 `preflightTaskAssignment` 和 `assignTask` 在 `DungeonService` 层有状态校验，但 `ensureMember` 是异步的，在 `pending` Map 保护下不会重复创建，**`assignTask` 和 `dispatchTask` 之间没有原子性**。两个并发调用可能先后通过 `preflight`，然后都调用 `assignTask`，后者会因 `TASK_NOT_ASSIGNABLE` 抛出并被 catch 处理，但已造成一次不必要的异常路径。  
  **更严重的是：** 若 `freeSlots` 在并发执行间共享（它们不共享，因为是局部变量），但 `run.tasks` 的状态在 `await ensureMember` 期间可能被其他并发调用修改，导致排序和过滤结果过时。  
  **建议：** 在 `PartyAgentManager` 层为每个 `runId` 增加派发互斥锁（如 `Map<string, Promise<void>>`），确保同一 run 的派发循环串行执行。

- **P1 — `kickScheduler` 的 `catch` 吞掉所有异常，可能掩盖严重错误**（`party-agent-manager.ts:82–88`）  
  注释说明调度是 best-effort，但 `catch` 未区分错误类型。若 `DungeonService` 抛出 `RUN_NOT_FOUND` 或内部错误，也会被静默吞掉。  
  **建议：** 至少记录日志，或仅吞掉预期的调度类错误（如 `TASK_NOT_READY`），将意外错误抛出或上报。

#### 1.1.4 并发派发竞态

- 与 1.1.3 的 P0 相关。补充一点：

- **P2 — `ensureMember` 的 `pending` Map 不防跨 runId 竞态**（`party-agent-manager.ts:191–201`）  
  `pending` 的 key 是 `runId:slot`，这正确隔离了不同 run。但同一 run 内，若 `ensureMember` 被 tank 和 healer 同时调用（理论上不应发生，因为 healer 的创建也由 tank 触发），不会冲突。主要风险仍在 `dispatchAvailableTasks` 的并发重入。

#### 1.1.5 资源泄漏与生命周期

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 502–509 | `forgetDisposedAgent` | 遍历 `handles` 和 `commanderHandles`，按 sessionId 匹配删除。O(n) 但通常数量很小，可接受。 |
| 511–528 | `disposeRun` | 正确收集所有前缀匹配的 handles，先删除 Map 条目再并发 dispose。注意：`leaseAudits` 清理了但 `pending` 和 `dispatchedRecoveryIds` 未清理。 |
| 530–536 | `dispose` | 全量 dispose，清理所有 Map。正确。 |

**发现：**

- **P2 — `disposeRun` 未清理 `pending` 和 `dispatchedRecoveryIds`**（`party-agent-manager.ts:511–528`）  
  若 run 被 dispose 时仍有进行中的 `ensureMember`（`pending` 中有 Promise），或已派发的 recovery（`dispatchedRecoveryIds` 中有记录），这些状态会残留。虽然 key 含 `runId` 前缀的不会泄漏到其他 run，但内存中残留无意义。  
  **建议：** 在 `disposeRun` 中同步清理 `pending` 和 `dispatchedRecoveryIds` 中前缀匹配的记录。

- **P2 — `completeDpsResurrection` replace 分支中 `previousHandle.dispose()` 在 `handles.set` 之后调用**（`party-agent-manager.ts:362–363`）  
  若 `previousHandle.dispose()` 抛出异常，`handles` 已更新为新 handle，但旧 handle 未成功 dispose，可能导致资源泄漏。虽然 dispose 通常不应抛出，但防御性编程建议先 dispose 旧 handle 成功后再注册新 handle。  
  **建议：** 调整顺序：先 `await previousHandle.dispose()`，成功后 `this.handles.set(key, handle)`。

#### 1.1.6 工作区审计与 Scope 执行守卫

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 380–388 | `beginLeaseAudit` | 正确记录 lease 与 workspace snapshot 的关联。 |
| 390–417 | `auditWorkspaceBeforeSubmit` | 正确检查 `ACTUAL_WRITE_SCOPE_VIOLATION` 和 `CHANGED_FILES_MISMATCH`（serial 模式）。 |
| 538–567 | `installExecutionGuard` | 在 Agent Context 上注册 `tools/pre-execute` 钩子，拦截 `write`/`edit`/`bash`。 |

**发现：**

- **P1 — `installExecutionGuard` 的 path 解析在 Windows 上可能不正确**（`party-agent-manager.ts:551–553`）  
  `relative(root, absolutePath).replaceAll('\\', '/')` 在 Windows 上会将反斜杠替换为正斜杠，但 `resolve(root, suppliedPath)` 在 `suppliedPath` 为绝对路径时会直接返回该路径（忽略 root）。若 Agent 传入绝对路径且该路径恰好在工作区内，`relative` 可能返回正确结果；若传入工作区外的绝对路径，`relative` 返回 `..` 开头路径，被 `startsWith('../')` 拦截。整体逻辑正确，但 `resolve(root, suppliedPath)` 的行为在 Node.js 中：若 `suppliedPath` 是绝对路径，直接返回 `suppliedPath`。这意味着若 Agent 传入 `C:\outside\file.ts`，`resolve(root, 'C:\outside\file.ts')` 返回 `C:\outside\file.ts`，`relative(root, ...)` 返回大量 `..\..\`，被拦截。  
  **建议：** 增加对 `suppliedPath` 本身是否为绝对路径的显式检查，提前拒绝。

- **P2 — `installExecutionGuard` 未拦截 `glob` 和 `grep` 的潜在信息泄露**（`party-agent-manager.ts:540–541`）  
  守卫仅拦截 `write`、`edit`、`bash`。`glob` 和 `grep` 可以读取任意路径，虽然它们不修改文件，但可能泄露工作区外敏感信息。PRD 未明确要求限制读工具，但 `readScopes` 的存在暗示应有读范围限制。  
  **建议：** 考虑为 `read`/`glob`/`grep` 增加类似的 readScope 守卫，或至少在 PRD 中明确读工具的边界策略。

- **P2 — `auditWorkspaceBeforeSubmit` 的 `activeScopes` 计算包含所有任务的 writeScopes**（`party-agent-manager.ts:398`）  
  `Object.values(run.tasks).flatMap((task) => task.activeLease ? task.workOrder.writeScopes : [])` 只收集有 active lease 的任务。若一个任务已完成但文件仍在工作区中，其 writeScopes 不再被计入，可能导致已完成的合法修改被误判为越界。不过这是设计意图（只保护活跃 lease），需确认与 PRD 一致。  
  **待验证：** PRD 第 14 节提到 "活动任务范围并集之外的修改" 作为门禁，当前实现与此一致。

#### 1.1.7 战复与恢复流程

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 157–169 | `dispatchBattleRes` | 正确校验 tank 权限和 resurrection 状态。 |
| 171–181 | `dispatchCommanderRescue` | 正确校验 ticket 状态。 |
| 569–581 | `dispatchRecoveryToHealer` | 使用 `dispatchedRecoveryIds` 去重，防止重复发送。正确。 |

**发现：**

- **P2 — `dispatchedRecoveryIds` 无过期清理机制**（`party-agent-manager.ts:43, 569–580`）  
  已派发的 recoveryId 永久保留在 Set 中。虽然数量通常很小，但长期运行可能累积。  
  **建议：** 在 run 完成或失败时清理对应 recoveryId，或设置 LRU 上限。

- **P2 — `recoverCommander` 在 `commander` 已存在时未更新 `commanderHandles`**（`party-agent-manager.ts:212–219`）  
  若原 tank Agent 仍存活，`commander` 直接复用，不创建新 Handle。但 `commanderHandles` 中可能已无该 run 的记录（如 Manager 重启后），导致后续 `disposeRun` 无法 dispose tank。  
  **建议：** 在原地恢复路径中，若 `commanderHandles` 缺失，应补充注册一个伪 Handle 或从 `agents.get` 获取的引用。

#### 1.1.8 其他代码质量问题

- **P3 — `sendPartyMessage` 对 tank 的目标解析使用 `this.agents.get` 而非 `commanderHandles`**（`party-agent-manager.ts:465–467`）  
  若 tank 是 commander 恢复后的新 Session，`commanderHandles` 中可能有更准确的 Handle。当前直接从 `agents` registry 获取，逻辑正确但不够统一。

- **P3 — `roleTools` 和 `rolePersonas` 的重复定义**（`party-agent-manager.ts:26–38`）  
  `dps-1`/`dps-2`/`dps-3` 的 tools 和 personas 完全重复，可用模板生成减少维护成本。

---

### 1.2 `client/index.tsx`（313 行）

#### 1.2.1 React 性能与重渲染

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 90–281 | `DungeonPartyOverlay` 组件 | 整体为一个大组件，所有状态（open, tab, panel尺寸, drag状态, feedback等）集中在顶层。 |
| 91–93 | `useSessions` selector | 仅订阅 `dungeon-party` projection，正确。但 selector 返回对象引用不稳定时可能触发不必要的重渲染。 |
| 108 | `tasks = useMemo(...)` | 正确缓存任务数组，避免每次渲染重新创建。 |
| 169–171 | `accepted`, `progress`, `messages` | 每次渲染重新计算，但计算量很小，可接受。 |

**发现：**

- **P1 — 大量事件处理器在每次渲染时重新创建**（`client/index.tsx:109–166`）  
  `beginDrag`, `moveDrag`, `endDrag`, `beginResize`, `moveResize`, `endResize`, `beginHeightResize`, `moveHeightResize`, `endHeightResize`, `beginLauncherDrag`, `moveLauncherDrag`, `endLauncherDrag` 等 12 个处理器函数在每次渲染时重新创建。虽然 React 18+ 的渲染优化通常能处理，但大量内联箭头函数会导致：
  - 子组件（如 `TaskRow`）若接收这些函数作为 props，可能因引用变化而重渲染（当前 `TaskRow` 只接收 `task`，不受影响）；
  - 事件绑定和解绑的潜在开销。
  
  **建议：** 使用 `useCallback` 包裹事件处理器，减少不必要的函数重建。

- **P2 — `styles` 字符串在模块级别定义，但每次渲染都通过 `installStyles` 注入**（`client/index.tsx:40–58, 285–294, 296–313`）  
  `apply` 函数在 `ctx.effect(installStyles, ...)` 中调用。`installStyles` 检查 `document.querySelector` 避免重复注入（L287），但 `ctx.effect` 的依赖和清理机制是否会导致样式在组件卸载/重新挂载时反复添加/移除，取决于宿主框架行为。当前实现返回清理函数（L293），在 effect 重新运行时先移除旧样式再添加新样式，可能导致样式闪烁。  
  **建议：** 将样式注入改为一次性操作（仅在插件初始化时执行），或确保 effect 的依赖稳定以避免不必要的重新运行。

#### 1.2.2 拖拽/缩放事件清理

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 103–107 | drag/resize refs | 使用 `useRef` 存储拖拽状态，正确。 |
| 109–121 | header drag handlers | 使用 Pointer Events 和 `setPointerCapture`，正确。 |
| 122–135 | width resize handlers | 正确。 |
| 136–149 | height resize handlers | 正确。 |
| 150–166 | launcher drag handlers | 正确。使用 `launcherMoved` ref 区分点击和拖拽。 |

**发现：**

- **P2 — 未处理 `lostpointercapture` 事件**（`client/index.tsx`）  
  若浏览器因系统原因（如切出窗口、按 Esc）取消 pointer capture，`onPointerCancel` 会被调用，但组件未显式监听 `lostpointercapture`。当前 `onPointerCancel` 处理（L121, 135, 149, 165）在 React 中通常能覆盖大部分情况，但某些浏览器/平台可能只触发 `lostpointercapture` 而不触发 `pointercancel`。  
  **建议：** 增加 `onLostPointerCapture` 处理，确保拖拽状态在任何情况下都能重置。

- **P2 — `launcherMoved` ref 在快速点击时可能误判**（`client/index.tsx:152, 161, 178`）  
  阈值 `Math.abs(deltaX) + Math.abs(deltaY) > 3`（L161）在快速点击伴随微小抖动时可能误判为移动，导致点击不打开面板。测试用例中通过 `onPointerUp` 后 `onClick` 的顺序处理（L164–178），但 React 的合成事件系统在某些情况下可能不保证此顺序。  
  **建议：** 增加时间阈值（如 pointerDown 到 pointerUp < 200ms 视为点击），或改用 `onPointerUp` 中根据移动距离和时间综合判断。

#### 1.2.3 无障碍与健壮性

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 174 | `aria-label="打开副本面板"` | launcher 按钮有正确的 aria-label。 |
| 182 | `role="dialog" aria-label="永夜秘境副本状态"` | 面板有 dialog 角色和标签。 |
| 187, 189 | `role="separator" aria-label="..."` | resize 手柄有 separator 角色和方向标签。 |
| 200 | `aria-label="关闭副本面板"` | 关闭按钮有标签。 |
| 204 | `aria-label={`副本进度 ${progress}%`}` | 进度条有动态标签。 |
| 208 | `aria-label="副本面板标签"` | tab 导航有标签。 |
| 226 | `aria-label={`${identity.name} 状态`}` | 成员状态条有标签。 |
| 264 | `role="alertdialog" aria-label="确认副本操作"` | 确认对话框有 alertdialog 角色。 |
| 275 | `role="status"` | feedback 消息有 status 角色。 |

**发现：**

- **P2 — 部分交互元素缺少键盘支持**（`client/index.tsx`）  
  - Tab 切换（L208–212）使用 `<button>`，默认可聚焦，正确。
  - 拖拽和 resize 完全依赖 Pointer Events，**键盘用户无法移动或调整面板大小**。
  - 关闭按钮（L200–202）可聚焦，正确。
  - launcher（L174–181）可聚焦，正确。
  
  **建议：** 为拖拽和 resize 增加键盘替代操作（如方向键微调位置/大小，或提供重置按钮）。

- **P2 — 空态/加载态/异常态展示不完整**（`client/index.tsx`）  
  - 空态：`quests` tab 无任务时展示 `dp-empty`（L239），`chronicle` tab 无消息时展示 `dp-empty`（L252），正确。
  - 加载态：无显式 loading 状态。`requestAction` 调用时 `isSubmitting` 禁用按钮（L266），但无全局 loading 指示器。
  - 异常态：无错误边界（Error Boundary）。若 `useSessions` 返回的 projection 数据结构异常（如 `run.tasks` 为 `undefined`），组件可能崩溃。
  
  **建议：** 增加 Error Boundary 包裹 `DungeonPartyOverlay`，在 projection 数据异常时展示降级 UI。

- **P3 — `partyIdentity` 和 `phaseName` 等文案分散在组件内**（`client/index.tsx:16–38`）  
  角色名称、阶段名称、任务状态名称均为硬编码对象。虽然当前为中文 UI 且无需国际化，但集中管理有助于维护和主题切换。  
  **建议：** 将文案提取为独立的 `i18n` 或 `labels` 模块，便于后续扩展。

- **P3 — `run.messages.slice(-8).reverse()` 在消息频繁更新时可能闪烁**（`client/index.tsx:171`）  
  每次渲染取最后 8 条并反转，若消息列表高频更新，反转操作导致 DOM 顺序变化，可能产生视觉闪烁。  
  **建议：** 使用 `useMemo` 缓存消息列表，或改为正序展示（最新在底部）并自动滚动到底部。

#### 1.2.4 溢出保护

| 行号 | 代码 | 评审结论 |
|------|------|----------|
| 185 | `max-width: calc(100vw - 36px)` | 面板最大宽度限制，正确。 |
| 185 | `max-height: calc(100vh - 32px)` | 面板最大高度限制，正确。 |
| 131 | `Math.min(480, Math.max(300, ...))` | 宽度钳制在 300–480，正确。 |
| 145 | `Math.min(720, Math.max(380, ...))` | 高度钳制在 380–720，正确。 |
| 56 | `@media(max-width:720px)` | 移动端适配：全屏展示，正确。 |

**发现：**

- **P2 — 拖拽偏移无边界限制**（`client/index.tsx:117`）  
  `setPanelOffset({ x: active.x + event.clientX - active.clientX, y: active.y + event.clientY - active.clientY })` 未对 `x`/`y` 做边界限制。用户可将面板完全拖出视口，导致无法找回。  
  **建议：** 限制 `panelOffset` 使面板始终有部分区域在视口内（如至少保留 40px 在边界内）。

- **P2 — `launcherOffset` 同样无边界限制**（`client/index.tsx:162`）  
  launcher 可被拖出视口，虽然双击可重置（L177），但用户可能不知道此操作。  
  **建议：** 增加边界限制，或提供显式的 "重置位置" 按钮/提示。

#### 1.2.5 其他 UI 质量问题

- **P3 — `TaskRow` 组件的 `key` 使用 `task.workOrder.id`**（`client/index.tsx:75`）  
  若任务列表重新排序或任务被替换（如返工后新 version），`workOrder.id` 不变但内容变化，React 可能复用 DOM 节点导致状态不一致。当前 `TaskRow` 无内部状态，风险较低。

- **P3 — `details` 元素的 `summary` 未翻译且样式可能不统一**（`client/index.tsx:276`）  
  "开发者模式 · 原始事件投影" 为硬编码中文，与整体风格一致，但 `details` 的默认浏览器样式可能与自定义主题冲突。

---

## 二、对照 PRD 检查调度与 UI 需求偏差

### 2.1 PRD 需求覆盖检查

| PRD 章节 | 需求 | 实现状态 | 偏差 |
|----------|------|----------|------|
| FR-001 | 创建固定逻辑队伍 | ✅ `DungeonService.startRun` | 无 |
| FR-002 | 成员角色隔离 | ✅ `roleTools`/`rolePersonas` + `installExecutionGuard` | **P1：原地恢复时守卫缺失** |
| FR-003 | 副本冷恢复 | ✅ `recoverRun` + `restoreBoundParty` | **P2：descriptor 可能未补注入** |
| FR-010 | 结构化拆解 | ✅ `createTask` | 无 |
| FR-011 | 最大三路并发 | ✅ `maxConcurrentDps` | 无 |
| FR-012 | 依赖控制 | ✅ `blockedBy` + `dependencyChainIncludes` | 无 |
| FR-013 | 写入范围冲突提示 | ✅ `scopesOverlap` + `WRITE_SCOPE_CONFLICT` | 无 |
| FR-014 | 全局命令单一归属 | ✅ `globalCommands` 去重 | 无 |
| FR-015 | Scope 执行模式 | ✅ `scopeEnforcementMode` | 无 |
| FR-020 | 任务领取与执行 | ✅ `claimTask` | 无 |
| FR-021 | 结构化提交 | ✅ `submitExecution` | 无 |
| FR-022 | 证据记录 | ✅ `ExecutionReport` 校验 | 无 |
| FR-023 | 任务与 Lease 版本校验 | ✅ 多版本校验 | 无 |
| FR-030 | 发起验收 | ✅ `createValidationManifest` | 无 |
| FR-031 | 奶独立验收 | ✅ `submitValidation` | 无 |
| FR-032 | 结构化验收报告 | ✅ `ValidationReport` | 无 |
| FR-033 | 报告失效 | ✅ `staleReports` | 无 |
| FR-034 | 强制完成门禁 | ✅ `finishRun` | 无 |
| FR-035 | 返工闭环 | ✅ `reopenTask` | 无 |
| FR-040 | 故障检测 | ✅ `observeHealthSignal` + `markMemberDown` | 无 |
| FR-041 | 战复申请 | ✅ `requestBattleRes` | 无 |
| FR-042 | 战复执行 | ✅ `startBattleRes` + `completeBattleRes` | 无 |
| FR-043 | 原地恢复优先 | ✅ resume-first | **P1：原地恢复时守卫缺失** |
| FR-044 | 槽位重绑 | ✅ `member-rebound` 事件 | 无 |
| FR-045 | 有限资源 | ✅ `battleResCharges` + `maxGenerationsPerSlot` | 无 |
| FR-046 | 恢复上下文 | ✅ ResurrectionPacket | 无 |
| FR-047 | 可审计健康信号 | ✅ `HealthSignal` | 无 |
| FR-048 | 奶自我稳定授权 | ✅ `directValidatorMaintenance` | 无 |
| FR-049 | 验收 attempt 作废 | ✅ `recoveryInstructions` 状态管理 | 无 |
| FR-050 | DPS 停滞检测 | ✅ `evaluateTaskProgress` | 无 |
| FR-051 | 安全重派 | ✅ `reassignTask` + `interruptTask` | 无 |
| FR-052 | T 调度背压 | ✅ `observeCommanderLoad` | 无 |
| FR-053 | T 不可用保护 | ✅ `markCommanderUnavailable` | 无 |
| FR-054 | 奶直接战复 T | ✅ `consumeCommanderRescueTicket` | 无 |
| FR-055 | DPS Turn 中断 | ✅ `requestTaskInterrupt` + `completeTaskInterrupt` | 无 |
| FR-060 | 队伍面板 | ✅ `party` tab | **P2：键盘支持不足** |
| FR-061 | 阶段与任务面板 | ✅ `quests` tab | 无 |
| FR-062 | 验收面板 | ⚠️ 未显式展示验收报告详情 | **P2：验收区域未完整实现** |
| FR-063 | 战复交互 | ⚠️ 无显式战复按钮 | **P2：战复区域未完整实现** |
| FR-064 | 控制操作 | ✅ `actions` tab 提供部分操作 | 无 |

### 2.2 主要偏差

1. **P1 — 原地恢复路径缺失执行守卫**（已详述）  
   违反 PRD 第 6.2 节 "角色权限必须由服务端依据调用者的精确 Agent/Session 身份强制校验" 和第 14 节 "若底层沙箱支持按 Agent 限制路径，插件应进一步执行运行时硬隔离"。

2. **P2 — UI 未完整实现验收面板和战复面板**（`client/index.tsx`）  
   PRD FR-062 要求展示 "当前验收状态、关联任务集版本、每项标准的检查结果、findings 按严重级别分组、报告是否已失效"。当前 UI 的 `quests` tab 只展示任务列表，`chronicle` tab 只展示消息时间线，无专门的验收面板。  
   PRD FR-063 要求展示 "剩余战复次数、当前申请和倒计时、故障诊断、原地恢复或替身恢复结果"。当前 UI 无此区域，仅在 `actions` tab 提供间接操作。  
   **建议：** 在后续迭代中增加 `validation` 和 `resurrection` 专用面板，或扩展现有 tab。

---

## 三、Top 5 改进项

### 🔴 Top 1 — 修复原地恢复路径的安全守卫缺失（P1）
**文件：** `src/adapters/party-agent-manager.ts:598–601`  
**问题：** `restoreMember` 和 `completeDpsResurrection` 的 resume 分支在 Session 存活时直接复用 Agent，跳过 `installExecutionGuard`、`tools.restrict` 和 persona 注入。  
**建议：** 强制通过 `agents.resume` 重新执行 setup，或在复用前手动补全守卫注册。

### 🔴 Top 2 — 为派发循环增加互斥锁防止并发重入（P0）
**文件：** `src/adapters/party-agent-manager.ts:91–122`  
**问题：** `dispatchAvailableTasks` 是 async 且无锁，高频事件触发时可能并发执行，导致任务重复派发或状态竞态。  
**建议：** 增加 `Map<runId, Promise<void>>` 派发锁，确保同一 run 的派发循环串行。

### 🟡 Top 3 — 增强 UI 键盘可达性与事件边界保护（P2）
**文件：** `client/index.tsx`  
**问题：** 拖拽/resize 无键盘替代操作；`lostpointercapture` 未处理；panel/launcher 偏移无边界限制。  
**建议：** 增加方向键微调、边界钳制、`onLostPointerCapture` 处理。

### 🟡 Top 4 — 补全验收与战复可视化面板（P2）
**文件：** `client/index.tsx`  
**问题：** PRD 要求的验收面板（FR-062）和战复面板（FR-063）未在 UI 中显式实现。  
**建议：** 新增或扩展现有 tab，展示验收报告详情、findings、战复次数和进度。

### 🟢 Top 5 — 优化事件处理器引用稳定性与样式注入策略（P2）
**文件：** `client/index.tsx:109–166, 285–294`  
**问题：** 12 个拖拽处理器每次渲染重新创建；`installStyles` 在 effect 中可能反复添加/移除。  
**建议：** 使用 `useCallback` 包裹处理器；将样式注入改为插件初始化时一次性执行。

---

## 四、完整发现清单

### P0（阻塞性）

| # | 文件 | 行号 | 问题 | 证据 | 建议 |
|---|------|------|------|------|------|
| P0-1 | `party-agent-manager.ts` | 91–122 | `dispatchAvailableTasks` 无互斥锁，并发重入可能导致任务重复派发或状态竞态 | 方法为 `async`，无 `Map<runId, Promise>` 锁；`await ensureMember` 期间状态可能变化 | 增加派发互斥锁，确保同一 run 串行派发 |

### P1（高优先级）

| # | 文件 | 行号 | 问题 | 证据 | 建议 |
|---|------|------|------|------|------|
| P1-1 | `party-agent-manager.ts` | 598–601 | `restoreMember` 原地恢复时跳过 setup，缺失执行守卫和角色注入 | 直接构造伪 Handle，不调用 `installExecutionGuard`、`tools.restrict`、`systemPrompt.section` | 通过 `agents.resume` 重新执行 setup，或手动补全守卫 |
| P1-2 | `party-agent-manager.ts` | 82–88 | `kickScheduler` 吞掉所有异常，可能掩盖严重错误 | `catch` 无错误类型区分，未记录日志 | 仅吞掉预期调度错误，意外错误抛出或上报 |
| P1-3 | `party-agent-manager.ts` | 551–553 | `installExecutionGuard` 的 path 解析在绝对路径传入时依赖 `relative` 的 `..` 检测 | `resolve(root, suppliedPath)` 对绝对路径直接返回 | 增加对 `suppliedPath` 绝对路径的显式前置拒绝 |
| P1-4 | `client/index.tsx` | 109–166 | 12 个事件处理器每次渲染重新创建，可能导致性能问题和子组件不必要重渲染 | 所有处理器为内联箭头函数，无 `useCallback` | 使用 `useCallback` 包裹处理器 |

### P2（中优先级）

| # | 文件 | 行号 | 问题 | 证据 | 建议 |
|---|------|------|------|------|------|
| P2-1 | `party-agent-manager.ts` | 190 | `ensureMember` 冷恢复后可能跳过 `ensureSubagentDescriptor` | `existing && this.handles.has(key)` 直接返回 | 在 `restoreBoundParty` 中补注入缺失的 descriptor |
| P2-2 | `party-agent-manager.ts` | 多处 | `agentOptions` 浅拷贝可能丢失深层配置 | `{ ...tankAgent.options }` 为浅拷贝 | 标注限制或显式覆盖关键嵌套字段 |
| P2-3 | `party-agent-manager.ts` | 332 | replace 模式未在 `agentOptions` 中传递 `agentPreset` | `meta.agentPreset` 已设置，但 `agentOptions.preset` 未设置 | 确认宿主框架解析优先级，必要时同步注入 |
| P2-4 | `party-agent-manager.ts` | 511–528 | `disposeRun` 未清理 `pending` 和 `dispatchedRecoveryIds` | 仅清理 `handles`、`leaseAudits`、`commanderHandles` | 同步清理前缀匹配的 `pending` 和 `dispatchedRecoveryIds` |
| P2-5 | `party-agent-manager.ts` | 362–363 | replace 分支中 `previousHandle.dispose()` 在 `handles.set` 之后，异常时可能泄漏 | 顺序为先 set 后 dispose | 调整为先 dispose 成功后再 set |
| P2-6 | `party-agent-manager.ts` | 540–541 | `installExecutionGuard` 未拦截 `glob`/`grep` 的潜在信息泄露 | 守卫仅拦截 `write`/`edit`/`bash` | 考虑增加 readScope 守卫或明确读工具边界策略 |
| P2-7 | `party-agent-manager.ts` | 43, 569–580 | `dispatchedRecoveryIds` 无过期清理 | Set 只增不减 | run 终态时清理或设 LRU 上限 |
| P2-8 | `party-agent-manager.ts` | 212–219 | `recoverCommander` 原地恢复时未更新 `commanderHandles` | 仅 `resumedHandle` 路径注册，原地恢复不注册 | 补充注册伪 Handle |
| P2-9 | `client/index.tsx` | 整体 | 拖拽/resize 无键盘替代操作 | 仅支持 Pointer Events | 增加方向键微调和重置按钮 |
| P2-10 | `client/index.tsx` | 整体 | 无 Error Boundary，projection 数据异常时可能崩溃 | 无 `componentDidCatch` 或 `ErrorBoundary` | 增加 Error Boundary 包裹 |
| P2-11 | `client/index.tsx` | 117, 162 | panel/launcher 拖拽偏移无边界限制 | `setPanelOffset`/`setLauncherOffset` 无钳制 | 限制偏移使面板始终部分可见 |
| P2-12 | `client/index.tsx` | 171 | `run.messages.slice(-8).reverse()` 可能闪烁 | 每次渲染反转数组 | 使用 `useMemo` 缓存或改为正序 |
| P2-13 | `client/index.tsx` | 整体 | 验收面板和战复面板未完整实现 | 无专用 tab 展示验收详情和战复状态 | 新增或扩展 tab |

### P3（低优先级/建议）

| # | 文件 | 行号 | 问题 | 证据 | 建议 |
|---|------|------|------|------|------|
| P3-1 | `party-agent-manager.ts` | 465–467 | `sendPartyMessage` 对 tank 使用 `agents.get` 而非统一 `commanderHandles` | 直接查询 registry | 统一使用 `commanderHandles` |
| P3-2 | `party-agent-manager.ts` | 26–38 | `roleTools`/`rolePersonas` 重复定义 | dps-1/2/3 内容完全相同 | 使用模板生成减少维护成本 |
| P3-3 | `client/index.tsx` | 16–38 | 文案分散在组件内 | 硬编码对象 | 提取为独立 labels 模块 |

---

## 五、测试覆盖评估

| 测试文件 | 测试数 | 覆盖情况 | 不足 |
|----------|--------|----------|------|
| `tests/agent-manager.test.ts` | 17 | 创建、恢复、派发、战复、中断、消息、守卫、审计 | 未覆盖：并发重入、disposeRun 清理、commanderHandles 更新、绝对路径守卫 |
| `tests/client-overlay.test.tsx` | 5 | 渲染、拖拽、resize、确认对话框、键盘可达性基础 | 未覆盖：Error Boundary、键盘操作、边界限制、消息闪烁、移动端适配 |
| `tests/client-bundle.test.ts` | 1 | 包导出和 bundle 结构 | 无 |

**建议补充的测试场景：**
1. 并发调用 `dispatchAvailableTasks` 的互斥行为（应验证不重复派发）。
2. `restoreMember` 在 Session 存活时是否正确重新注入守卫（当前测试用 mock 的 `resume` 覆盖，但未验证 live 路径）。
3. `disposeRun` 后 `pending` 和 `dispatchedRecoveryIds` 的清理。
4. UI 的 Error Boundary 行为（projection 数据异常时）。
5. `lostpointercapture` 事件的拖拽状态重置。

---

## 六、结论

`party-agent-manager.ts` 和 `client/index.tsx` 整体实现了 PRD 的核心需求，架构清晰，测试通过。但存在以下需要优先处理的问题：

1. **原地恢复路径的安全守卫缺失**（P1-1）是最大风险，可能导致 DPS 在恢复后绕过 writeScopes 限制。
2. **派发循环的并发重入**（P0-1）在高频事件场景下可能引发状态不一致。
3. **UI 的键盘可达性和边界保护**（P2-9, P2-11）需要增强以提升无障碍体验。
4. **验收和战复面板未完整实现**（P2-13）与 PRD 的 GUI 需求存在偏差。

以上问题均可在不破坏现有架构的前提下修复，建议按 Top 5 改进项优先级推进。

---

*报告生成时间：2026-08-21*  
*报告大小：约 15 KB*
