# DSH Dungeon Party 全栈审查与改进计划

> **落地状态（后续提交标注）**：本报告的 P0 全部项与 P1 核心项（调度不变量、重试路径、finish CAS、投影最终一致、审计累计、重启恢复、healer 冻结）已修复并补充 21 个回归测试；依赖已升级至 `0.1.1-rc.2`。UI 层与打包治理在后续提交中跟进；性能重构（原地 reducer/版本化快照）仍待独立立项。

> 审查日期：2026-08-24  
> 范围：底层状态机、事件存储、Agent 调度、工作区隔离、工具协议、React UI、构建测试、CI/CD、发布包与文档  
> 方式：源码逐层审查、4 路独立复核、现有测试/构建/打包验证、Web Interface Guidelines 与 React 性能规则对照  
> 说明：本报告基于当前 `0.1.11` 源码；`reviews/` 中 2026-08-21 的分项报告对应更早代码，部分结论已失效，本报告优先级更高。

## 1. 执行结论

项目不是“不可用”，相反它已经具备较完整的事件溯源、Lease、Checkpoint、战复、两阶段完成门禁、结构化工具 Schema 和 Web Overlay，153 个测试全部通过。但当前仍不适合把“严格写入隔离”和“独立验收”作为强安全承诺直接发布，主要原因有两项发布阻断问题：

1. `verification_run` 的命令分词写成了匹配字面量 `\\s`，默认的 `npm test` 等命令不会被拆成程序与参数；spawn 失败又会被记录成无退出码的普通验证记录，可能形成假验收证据。
2. DPS 的 `writeScopes` 不是完整的预执行边界：`bash` 可直接写其他任务范围，文件工具的词法路径校验可被 workspace 内符号链接绕过；`party_start` 还允许模型提供任意 host 可读目录作为 `workspaceRoot`。

其次，调度状态机存在“一名 DPS 多任务/多 Lease”“down 成员仍能接活”“required 任务 blocked/failed 后无可达重试路径”等 P1 正确性问题；UI 也会受到投影永久滞后、跨会话残留确认指令和键盘/读屏语义不完整的影响。

### 风险数量

| 等级 | 定义 | 数量 |
|---|---|---:|
| P0 | 发布阻断；核心安全/验收承诺可被确定性绕过 | 2 |
| P1 | 高优先级正确性、恢复、并发或长期性能问题 | 11 |
| P2 | 可靠性、UX、工程治理和契约一致性问题 | 13 |
| P3 | 优化与维护性问题 | 5 |

## 2. 已验证基线

- `npm test`：16/16 test files、153/153 tests 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；构建后 Git 工作区无差异。
- `npm pack --dry-run --json`：成功，34 files，tarball 127,185 B，解包 782,210 B。
- 生产依赖审计：使用 npm 官方 registry 执行 `npm audit --omit=dev --audit-level=moderate`，当前为 0 vulnerabilities。
- GitHub Actions `checkout@v7`、`setup-node@v7`、`upload-artifact@v7` 的 tag 当前均真实存在；不应把 v7 本身列为故障，但仍建议 SHA pin。
- `session.prompt()` 的 `RpcResult` 确实使用 `{ ok: true, value } | { ok: false, error }`，所以 `client/index.tsx:531` 的 `result.ok` 是正确用法，不是缺陷。

## 3. 架构与数据流

```text
Tank Session / UI prompt
        │
        ▼
26 个结构化 Tool ──► DungeonService 状态机
        │                    │
        │                    ├─► dungeon/event（事实日志）
        │                    ├─► DungeonRun（内存聚合）
        │                    └─► dungeon/projection（Web UI）
        │
        ├─► PartyAgentManager ──► DPS / Healer Agent
        │          │
        │          ├─► pre-execute guard
        │          ├─► per-run dispatch/audit lock
        │          └─► workspace snapshot audit
        │
        └─► WorkspaceComputationQueue（单 Worker FIFO）
```

架构方向是合理的，但“权限边界、聚合状态、投影、UI 控制”目前耦合在同一进程和同一完整 `DungeonRun` 对象上，导致安全边界依赖事后快照、状态增长导致克隆成本增长、投影节流导致永久陈旧。

---

## 4. P0：发布阻断问题

### P0-01 验证命令无法正确执行，spawn 失败可伪装成正常验证记录

**证据**

- `src/tools/register.ts:388-400`：`command.trim().split(/\\s+/)` 匹配字面量 `\s`，`npm test` 会被作为单个 executable 名称。
- `src/tools/register.ts:400`：spawn `error` 只返回空 excerpt/无 exitCode，不携带错误码。
- `src/tools/register.ts:831-837`：只把 `timedOut` 当失败；spawn error 仍进入 `recordVerificationCommand`。
- `src/service/dungeon-service.ts:949-966`：`exitCode` 可缺省，空输出也可持久化为 `dungeon/verification-command-run`。
- `docs/dsh-dungeon-party-prd.md:1290`：契约要求命令真实执行，超时也结构化记录。

**影响**

默认白名单里的 `npm test`、`npm run typecheck`、`git status --short` 等全部可能 ENOENT；Healer 却得到一条外观正常、无退出码的持久化记录，独立验收证据失真。

**修复**

1. 最好把配置从字符串改成 `{ command, args }`，彻底避免 shell/引号解析；最低限度先改成 `/\s+/`。
2. `runVerification` 返回判别联合：`success | nonzero-exit | timeout | spawn-error | aborted`。
3. spawn error 必须持久化 `errorCode/errorMessage`，验证报告引用失败结果时不得判 pass。
4. 超时先 SIGTERM，短暂 grace 后 SIGKILL，并清理整个进程树；接入 `exec.signal`。
5. 新增真实 `npm --version`、ENOENT、nonzero、timeout、abort、输出截断测试。

### P0-02 `writeScopes` 与 workspace 边界可被 bash、符号链接和任意 root 绕过

**证据**

- `src/adapters/party-agent-manager.ts:806-845`：bash 只拦截有限 destructive git 和部分“global command”，没有限制重定向、`cp`、`sed -i`、`python/node -e` 或绝对路径。
- `src/adapters/party-agent-manager.ts:820-825`：write/edit 仅 `resolve + relative` 词法检查，没有对目标或父目录做 `realpath`/no-follow。
- `src/adapters/workspace-fingerprint.ts:37-57`：快照故意不跟随 symlink，因此经 symlink 写到 root 外不会被审计发现。
- `src/tools/register.ts:412-430`：`party_start` 直接使用模型输入的 `workspaceRoot` 做 host 级递归读取。
- `src/adapters/party-agent-manager.ts:919-923`：同一 root 被直接用于 child Agent `cwd`。
- `src/adapters/party-agent-manager.ts:637-655`：默认 aggregate/telemetry 审计只检查所有 active scopes 的并集，不能归因到当前 Agent。

**影响**

即使底层 DSH 沙箱限制了 workspace 外写入，DPS 仍可用 bash 修改同一 workspace 中其他任务的文件，绕过每任务 `writeScopes`；workspace 内 symlink 还可能把 write/edit 引到 root 外。未经约束的 `workspaceRoot` 让提示注入可以驱动 host Worker 扫描其他目录。

**修复**

1. 不再接受模型自由提供 root；由 host/session 注入 canonical workspace root，并验证等于当前 Session 的授权 cwd。
2. root、目标路径及最近存在父目录都做 realpath containment；文件打开使用 no-follow 语义，或直接拒绝任务写范围内的 symlink。
3. DPS 的 bash 放入真正的 OS/DSH capability sandbox；不能只靠正则解析 shell。短期可仅允许只读/测试 argv 白名单，写操作统一走 write/edit。
4. 每个 Agent/Lease 使用独立 worktree/overlayfs 是更稳妥的中期方案，完成后再 merge。
5. 默认切到 serial，直到 per-Agent write telemetry 真正接入；所有模式都校验“本 Lease 实际 delta == 本报告 changedFiles”。
6. 增加 bash 重定向、解释器写盘、绝对路径、symlink、跨 active scope、任意 workspaceRoot 的攻击回归测试。

---

## 5. P1：高优先级正确性与可靠性

### P1-01 一名 DPS 可同时拥有多个任务和 Lease，且 down/unavailable 成员仍可接活

**证据**

- `src/adapters/party-agent-manager.ts:255-262`：`busySlots` 只统计 `running`，已分配但尚未 claim 的 `ready` 槽位仍被认为空闲。
- `src/service/dungeon-service.ts:803-824`：assign 不检查该 slot 是否已有 ready/running task，也不检查 life/readiness。
- `src/service/dungeon-service.ts:841-847`：若 `activeDps.has(actorSlot)`，同一 DPS 可继续 claim 另一个 Lease。
- `src/service/dungeon-service.ts:2381-2384`：`requireDps` 只验证 session 绑定，不验证成员是否 alive/healthy。
- `src/service/dungeon-service.ts:1915-1926`：执行 guard 只 `find` 第一个 running task，多 Lease 时授权范围变得不确定。

**触发**

任务数大于 3 时，首轮派发后 DPS 尚未 claim，第二次 scheduler kick 可把第 4 个任务再次分给 DPS-1；同一 Agent 随后可持有多个 Lease。已标记 down 的原 Session 若恢复在线，也能直接 claim，绕过 battle-res 流程。

**修复**

- 建立硬不变量：每个 DPS slot 最多一个 `ready|running` task、最多一个 active Lease。
- `assignTask`/`claimTask` 同时校验 `lifeState === alive`、允许的 readiness、controlState。
- guard view 必须按明确 taskId/leaseId 绑定，而不是 `find`。
- 用 reducer invariant/property tests 覆盖 4+ tasks、重复 kick、down/resurrect、并发 claim。

### P1-02 required 任务提交 blocked/failed 后进入不可恢复死路

**证据**

- `src/service/dungeon-service.ts:873-945`：执行报告允许 `blocked|failed`，提交后任务直接进入该状态并释放 Lease。
- `src/service/dungeon-service.ts:734-736`：required 任务未 completed 时不能进入 VALIDATING。
- `src/service/dungeon-service.ts:1588-1615`：`reopenTask` 只允许在 REPAIR 且必须已有 failed validation report。

**影响**

required 任务在 EXECUTING 阶段 blocked/failed 后，既不能 VALIDATING 产生 failed report，也不能满足 reopen 的前置条件；除了整 run 失败/取消，没有正式重试、重派或降级路径。

动态复现确认：同一 DPS 可同时拿到 2 个 Lease；blocked 后进入 VALIDATING 返回 `INCOMPLETE_TASKS`，转入 REPAIR 后 reopen 返回 `FAILED_VALIDATION_REQUIRED`。

**修复**

增加 `retry/reopen-after-execution-failure` 事件和 Tank 工具，允许在 EXECUTING/REPAIR 基于原 report 重派或修订 WorkOrder；明确最大执行重试次数，并保留旧 report/lease 审计链。

### P1-03 Activity 聚合状态不闭合，UI 会长期显示错误成员状态

**证据**

- `src/service/dungeon-service.ts:2123-2131`：claim 时 slot 设为 `running`。
- `src/service/dungeon-service.ts:2136-2154`：submit 后未把 slot 改回 `idle/waiting`。
- `src/service/dungeon-service.ts:2172-2181`：Lease revoke 同样未更新 slot activity。
- `client/index.tsx:438-449`：队伍页直接用持久化 activityState 渲染边框和活动标签，因此任务结束后仍可能显示“执行中”。

**修复**

把 slot activity 作为 reducer 中可推导状态，或完全删除持久化 activityState，按 tasks/lease/recovery 计算；提交、撤销、中断、重派、战复都加 invariant tests。

### P1-04 Healer 不可用状态没有统一冻结门禁

**证据**

- `src/service/dungeon-service.ts:1297-1342`：健康信号可把 healer readiness 置为 unavailable，但只有 tank 有特殊 pause 逻辑。
- `src/service/dungeon-service.ts:731-733`、`:827-848`：进入执行/claim 只检查 healer sessionId，不检查 healer readiness/lifeState。
- `src/service/dungeon-service.ts:1661-1665`：提交验证也只检查 healer session 绑定。

**影响**

通过 health signal 进入 unavailable 的 Healer 不一定冻结新写 Lease；被恢复但仍 unavailable 的旧 Session 仍可提交验收。

**修复**

集中实现 `assertOperationalMember(slot, operation)`；Healer unavailable 统一触发 pause，只有健康恢复事件后才能 resume/validate。

### P1-05 投影节流不是“最终一致”，最后 1–19 次变化可能永远不发布

**证据**

- `src/adapters/session-event-store.ts:57-74`：只在 phase change、terminal 或每第 20 次调用发布，没有 trailing flush timer。
- `tests/session-event-store.test.ts:50-87`：测试只验证第 20 次发布，没有验证停止更新后的最终投影。

**影响**

例如 run-created 首次投影后，紧随其后的 tank member-bound 不发布；如果用户暂不切 phase，UI 会一直显示未绑定。任务、健康、消息等最后几次变化也可能永久陈旧。

**修复**

改成 leading + trailing debounce/coalesce：首个事件可立即发布，窗口结束必须发布最新状态；或仅发布增量 projection。增加 fake-timer 最终一致测试。

### P1-06 `finishRun` 在 await 窗口缺少终态 CAS/锁

**证据**

- `src/service/dungeon-service.ts:1777-1801`：写 prepared 后 await 指纹重算，再用旧 `prepared` 追加 completed。
- `src/service/dungeon-service.ts:1939-1961`：append 不检查最新 run 是否已 terminal。

**影响**

两个并发 finish 可写多个 prepared/completed；更严重的是 await 期间 Tank 若 cancel/fail，旧 finish 返回后仍可追加 completed，把 terminal 结果覆盖为 COMPLETED。动态复现已确认：prepared 后执行 CANCELLED，再释放指纹 Promise，最终 durable phase 被改回 `COMPLETED`。

**修复**

按 run 序列化 completion；prepared 生成 completion token/expected sequence，重算后重新读取最新 run 并 CAS 校验 phase、control、manifest、report、fingerprint 与 sequence。指纹回调 reject/worker 失败也必须写结构化 `run-completion-aborted`，或由 prepared TTL/recovery 关闭未完成 attempt。

### P1-07 事件提交后 projection 失败会向调用方返回失败，但状态已经提交

**证据**

- `src/service/dungeon-service.ts:1952-1960`：eventStore append、reduce、runs/sequence 更新完成后才调用可抛错的 `publishProjection`，waiters 也在其后通知。

**影响**

调用方会把已成功的命令当失败并重试；根据工具幂等语义，重试可能产生额外语义事件，也可能返回冲突。`startRun` 还可能只写 run-created、未写 member-bound，形成半初始化 run。

**修复**

明确 commit point：projection 必须是非阻断 outbox/best-effort side effect；失败进入日志/指标并可重放，不能改变工具调用的业务提交结果。多进程场景则需要 store 级原子 `append(expectedSequence)`。

### P1-08 Checkpoint 重设审计 baseline 会抹掉任务前半段真实改动

**证据**

- `src/adapters/party-agent-manager.ts:662-675`：每次 checkpoint 后直接把 baseline 替换成当前 snapshot。
- `src/adapters/party-agent-manager.ts:647-654`：serial 模式要求最终 report.changedFiles 等于“当前 baseline 之后”的 delta。

**影响**

checkpoint 发生前没有先做 delta 归属审计。任务先改文件、再 checkpoint、最后提交累计 changedFiles 时，审计只能看到 checkpoint 后的增量并错误报 `CHANGED_FILES_MISMATCH`；更严重的是，checkpoint 前的越界变化也会被新 baseline 吸收。

**修复**

保留 immutable lease baseline，并维护 checkpoint delta 链；允许单独记录“确认过的外部噪声”，不能整体重置。最终审计对所有 checkpoint delta 做并集和归属验证。

### P1-09 telemetry 模式与真实实现不一致

**证据**

- `src/service/dungeon-service.ts:355-381` 声明 `sessionWriteTelemetryAvailable`。
- `src/plugin.ts:62-87` 暴露 `scopeEnforcementMode=telemetry`，却不暴露 `sessionWriteTelemetryAvailable`。
- `src/adapters/party-agent-manager.ts:637-655` 没有消费 Session write telemetry；telemetry 与 aggregate 走同一路径。

**影响**

配置 telemetry 在常规插件配置中会因 capability=false 报错；即使程序化设为 true，审计也没有真实 per-Agent telemetry，状态标签会夸大隔离能力。

**修复**

短期删除/隐藏 telemetry 选项并默认 serial；中期接入宿主 write event，按 agent/session/lease 归因并加入 capability negotiation。

### P1-10 聚合状态和恢复成本随事件数二次增长

**证据**

- `src/service/dungeon-service.ts:1995-1997`：每个事件 reducer 都 `structuredClone` 整个 current run。
- `src/service/dungeon-service.ts:694-704`：冷恢复逐事件调用该 reducer。
- `src/service/dungeon-service.ts:2075-2325`：messages、healthSignals、reports、requests、verificationRuns 等持续 append，无 retention。
- projection 继续传整个 `DungeonRun`。

**影响**

长 run 的 append/replay 接近 O(E²)，完整 projection 和 UI raw JSON 也持续变大；事件多时会出现 host 卡顿、启动慢和内存膨胀。

**修复**

使用原地内部 reducer + 对外只读 snapshot，定期持久化版本化 snapshot，从 snapshot 后增量 replay；projection 改成 bounded view model，历史分页/归档；给每类数组和总 event bytes 设上限。

### P1-11 Commander 在 Healer 尚未绑定时 disposed，会让恢复监听器抛错

**证据**

- `src/service/dungeon-service.ts:990-1012`：tank disposed 直接调用 `markCommanderUnavailable`。
- `src/service/dungeon-service.ts:1100-1107`：要求 tank 和 healer 都已绑定，否则抛 `PARTY_NOT_RECOVERABLE`。
- `src/plugin.ts:141-145`：agent/disposed 监听没有降级/捕获该业务分支。

**修复**

FORMING/PLANNING 阶段无 Healer 时，将 run 明确标记 FAILED/PAUSED 并记录 reason；事件监听器不得把 domain failure 抛回宿主事件总线。

---

## 6. P2：前端 UI、边界校验与工程治理

### P2-01 UI 跨当前 Session/run 保留危险确认状态

- `client/index.tsx:302-320`：`pendingInstruction`、feedback、tab 等组件状态不随 `run.id` 重置。
- `client/index.tsx:480-492`：确认文本内嵌旧 runId；提交时 `requestAction` 在 `client/index.tsx:527-530` 获取当前 Session。
- 用户在确认框打开时切换 Session，旧 run 指令会被发给新当前 Session。

**改进**：以 `run.id/sessionId` 为 key 隔离状态；run 切换立即取消 pending/feedback/submission；提交载荷携带 expected runId 并在注入层二次校验；忽略旧 in-flight 请求在新 run/unmount 后的迟到状态更新。

### P2-02 异步动作缺少 reject/abort 和真实执行结果

- `client/index.tsx:485-492` 只有 `try/finally`，`requestAction` reject 会成为未处理 Promise，用户无错误提示。
- 当前动作只是 queue 一条自然语言 prompt，`result.ok` 仅代表队列接受，不代表 party tool 真正执行成功。

**改进**：catch 并展示可操作错误；组件卸载/run 切换时 AbortController；中期改为结构化 command/action API，展示 queued → running → succeeded/failed 状态和 event correlation id。

### P2-03 Tabs、Dialog、确认框和 resize handle 无障碍语义不完整

- `client/index.tsx:395-425`：dialog/tabs 缺 `aria-labelledby`、tablist/tab/tabpanel、aria-selected/controls 与 Arrow/Home/End。
- `client/index.tsx:400-403`：separator 不可聚焦、无 aria-valuenow/min/max、无键盘调整。
- `client/index.tsx:483-493`：alertdialog 无焦点进入/陷阱/恢复、Escape、aria-describedby、aria-busy。
- `client/index.tsx:418`：总进度条缺 `role=progressbar` 和数值属性。
- `client/index.tsx:253-254`：纯 `div` 只有 aria-label、没有可访问语义 role，战复计数不一定被可靠暴露。

**改进**：按 WAI-ARIA APG 实现；增加 axe/Testing Library 键盘与焦点测试。

### P2-04 拖拽/尺寸没有 viewport clamp，移动端与安全区处理不足

- `client/index.tsx:322-379`：offset 无视口钳制，也未处理 lostpointercapture/键盘替代。
- `client/index.tsx:63-96`：modal-like panel 无 `overscroll-behavior: contain`、safe-area inset；拖拽依赖 pointer gesture。

**改进**：clamp、Escape 取消、lostpointercapture、独立“重置位置”按钮、键盘 resize、safe area 与 200% zoom 视觉回归。

### P2-05 非 validation 主视图对 malformed projection 不够防御

- `client/index.tsx:321,384,431,466-468` 直接假设 tasks/messages/slots 与 slot enum 完整；坏 projection 可让整个 overlay render throw。
- `client/index.tsx:380` 把“没有 run、投影尚未到达、断线/投影错误”统一成空 UI，无法给用户诊断或重试入口。
- `src/plugin.ts:98-111` 的 projection schema 只检查 object.id 是 string。

**改进**：服务端使用版本化完整 wire schema；客户端区分 no-run/loading/error，做 parse/fallback + Error Boundary；对 unknown slots/missing arrays/oversized payload 测试。

### P2-06 CSS 生命周期、宿主隔离和可读性不足

- `client/index.tsx:64-96`：除变量根外 `.dp-*` 规则全局生效，未统一以前缀根限定。
- `client/index.tsx:507-515`：已有同 id style 时直接 no-op；HMR/多实例先后 dispose 可能让新实例失去样式或继续用旧 CSS。
- 大量 8–10px 文本和较暗颜色，需重新验证 WCAG 对比与缩放可读性。

**改进**：CSS Modules/Shadow DOM 或全部 `[data-dungeon-party-root] .dp-*`；style 节点 hash/ref-count；正文状态至少 12–14px；加入高对比度测试。

### P2-07 日期、文案和长内容未做 locale/content 处理

- `client/index.tsx:232,263,272,468` 直接显示 ISO 时间，没有 `Intl.DateTimeFormat`。
- 文案硬编码中英混合；scope、ID、message、raw JSON 缺系统性 `overflow-wrap:anywhere`/长度上限。

**改进**：接入宿主 locale、集中 message ids、Intl 时间/数字、identifier `translate="no"`、超长内容折叠/复制/下载。

### P2-08 输入与事件 payload 缺少统一条数/字节上限

- `src/tools/register.ts:529-567,780-797,934-995`：多数字符串/数组无 max items/length。
- `src/service/dungeon-service.ts:741-799,873-945,1661-1726`：core public API 运行时校验不完整，依赖工具层/TypeScript。
- task ID 还应拒绝 `__proto__`、`constructor` 等 plain-object 保留键。

**改进**：定义共享 Zod/Schema 边界，在 tool 与 core 双层 parse；限制单字段、数组、单事件和单 run 总字节；tasks 使用 Map 或 null-prototype object。

### P2-09 事件恢复和 projection 缺少按 type 的完整 schema

- `src/service/dungeon-service.ts:694-704,1964-2342`：恢复只检查 sequence/schemaVersion，payload 直接索引。
- `src/plugin.ts:98-111`：wire schema 仅验证 id。

**改进**：每个 event type 使用 discriminated schema；坏日志隔离并产出诊断，不允许 TypeError；加入 corrupt/fuzz/property tests。

### P2-10 Workspace Worker 缺取消、超时和资源上限

- `src/adapters/workspace-computation-queue.ts:80-147`：全局单 Worker FIFO，无 AbortSignal、job timeout、queue cap；一个慢目录会阻塞所有 run。
- `src/adapters/workspace-fingerprint.ts:37-57`：同步读取整个普通文件，没有 file count/size 预算；特殊文件会被静默跳过且没有诊断，Worker 中还有一份重复实现，容易漂移。

**改进**：取消/超时/重启 worker、queue backpressure、文件数/字节预算、跳过特殊文件、统一一份 traversal 模块；长期按 mtime/size 增量缓存。

### P2-11 生命周期清理存在 in-flight 竞态和静默错误

- `src/adapters/party-agent-manager.ts:392-410,767-796`：dispose 不等待/cancel pending create、dispatch locks、turnEndNudges、dispatchedRecoveryIds，也没有 disposed generation token。
- `src/plugin.ts:136-140`：watchdog 顶层错误被完全吞掉。
- process-wide `workspaceComputationQueue` 没有插件卸载清理路径。

**改进**：统一 lifecycle controller；dispose 先阻止新任务、取消并等待 in-flight，再清 Map/Agent/Worker；错误进入 bounded diagnostics + logger/metric。

### P2-12 配置与 PRD 存在失效项/偏差

- `validationRequired` 只在 `src/service/dungeon-service.ts:381,447` 和 `src/plugin.ts:86` 定义，完成逻辑始终要求 validation，配置无效。
- `docs/dsh-dungeon-party-prd.md:1287` 声称 Healer 可用 member_checkpoint，但 preset healer tools 不含该工具。
- verification timeout 的“持久化转录”当前未实现。

**改进**：每个配置做 usage test；删除无效配置或实现；生成 tool catalog 文档，CI 对 PRD/README 声明与注册表做一致性检查。

### P2-13 CI/发布和兼容性门禁不足

- `package.json:54-68` 接受 DSH peers `>=0.1.1-rc.1 <0.2.0`，但 devDependencies 固定 rc.1；`.npmrc:1-3` 使用 legacy-peer-deps，可能掩盖 peer 冲突。
- `tsconfig.json:14` 的 skipLibCheck 会跳过第三方声明检查；当前 client runtime 声明引用的部分 transitive peer 类型（例如 `@deepseek-ai/dsh-api-remotes`）未直接安装，集成类型错误可能退化为 any。
- `tsdown.config.ts:27` clean=false；删除源码后旧 `lib/**` 可能继续被打包。
- `tests/client-bundle.test.ts:26-29` 在 CI build 前读取已提交产物，不是独立的当前构建 smoke test。
- CI 无 lint、format、coverage、持续 dependency audit；release 使用漂移的 `npm@latest`。
- `package.json:107-109` 宣称 Node `>=22`，但 `node:path.matchesGlob` 从 Node 22.5.0 才提供。

**改进**：

1. peer matrix：rc.1 + 当前 rc.2/最新 0.1.x 的 clean consumer install/typecheck/runtime smoke；移除或局部化 legacy-peer-deps。
2. build 前清空临时 outDir，成功后原子替换 lib；tarball 在干净临时目录安装并 import 所有 exports。
3. 加 ESLint/Biome、format check、Vitest coverage threshold、官方 registry audit/OSV。
4. 固定 npm 版本；Actions pin 完整 commit SHA；权限下沉到 job。
5. engines 改成 `>=22.5.0`，并测最低版本和最新 Node 22。

---

## 7. P3：维护性与包体积

1. **发布包重复客户端产物**：`npm pack` 同时包含未导出的 `lib/client/index.js`（51 KB）、实际导出的 `lib/client.js`（56 KB）和 source map（62 KB）。类型构建应只产 d.ts 到临时目录。
2. **超大内部声明文件**：`lib/types/tools/output-schemas.d.ts` 273,574 B，约占解包体积 35%；给导出常量显式标注 `ValueSchemaSpec` 或把内部 schema 从 public types 排除。
3. **npm README 链接断裂**：README 链接 `./docs/dsh-dungeon-party-prd.md`，但 `package.json:39-44` 不打包 docs，已发布 npm 包中的相对链接不可用。改为 GitHub 绝对 URL或包含文档。
4. **README 发布说明过期**：`README.md:232-247`、`README.zh-CN.md:232-247` 声称需要 NPM_TOKEN、上传 GitHub Release asset、`--clobber`；当前 release workflow 使用 OIDC 且没有 asset upload。
5. **历史 review 治理**：旧分项报告行号和结论已与当前代码不一致，应加 `superseded-by` 标记，避免后续把已修复/错误项重新当现状。

---

## 8. UI Guidelines 简表

### `client/index.tsx`

- `client/index.tsx:400-403` - pointer-only separator；缺键盘处理和 aria value。
- `client/index.tsx:395-425` - dialog/tabs 缺完整 APG 语义与焦点行为。
- `client/index.tsx:418` - progress 缺 role/min/max/now。
- `client/index.tsx:483-493` - alertdialog 缺 labelledby/describedby、Escape、焦点进入/恢复。
- `client/index.tsx:232,263,272,468` - 原始时间串，应使用 `Intl.DateTimeFormat`。
- `client/index.tsx:64-96` - 8–10px 文字和 muted token 需对比度/缩放复核。
- `client/index.tsx:322-379` - drag/resize 缺 viewport clamp、lostpointercapture 与键盘替代。
- `client/index.tsx:495-498` - 大 projection raw JSON 无大小限制。
- `client/index.tsx:94-96` - 已正确处理 `prefers-reduced-motion`，这一点保留。
- `client/index.tsx:66` - 已提供明显 `focus-visible`，这一点保留。

---

## 9. 分阶段改进计划

### Phase 0：安全与验收止血（1–3 天，发布前必须完成）

1. 修复 verification argv 解析、spawn error、timeout/abort/进程树清理与持久化。
2. `party_start` 改为 host 注入 canonical root；增加 root realpath/authorization。
3. DPS bash 暂时收紧为只读/测试 argv 白名单；write/edit 增加 symlink/no-follow 防护。
4. 默认强制 serial scope audit，aggregate/telemetry 标记 experimental 或关闭。
5. 加上述 exploit 与真实验证命令回归测试。

**退出标准**

- 默认验证命令真实执行；ENOENT/nonzero/timeout 均不可伪装成功。
- 任意 bash、符号链接、绝对路径、其他任务 scope 均无法产生未授权写入。
- 模型无法选择 host 任意目录。

### Phase 1：状态机与调度闭环（3–7 天）

1. 每 DPS 单 ready/running/Lease 不变量；down/unavailable 禁止 assign/claim/submit。
2. required blocked/failed 的 retry/reassign/reopen 路径。
3. Activity/owner 改为可推导或完整 reducer 转移。
4. Healer unavailable 统一 pause，恢复后显式 healthy 才可 resume/validate。
5. finish completion lock + CAS；projection 变成非阻断 outbox。
6. checkpoint audit 使用累计 delta 链。

**退出标准**

- property tests 覆盖 phase/task/lease/member 组合，不存在不可达恢复路径。
- 并发 finish/cancel 只有一个合法终态。
- 所有 committed event 即使 UI projection 失败也返回一致业务结果。

### Phase 2：UI 与 projection（1–2 周）

1. trailing projection flush；改成 bounded UI projection，而非完整 run。
2. run/session keyed UI state、Error Boundary、malformed projection fallback。
3. 结构化 action API 与状态回执，替代自由文本 prompt 控制。
4. APG tabs/dialog/alertdialog/resizer、focus/keyboard/viewport/safe-area。
5. locale + Intl + 长内容/高对比/200% zoom。

**退出标准**

- 最后一条状态更新在约定窗口内必达 UI。
- axe 无 critical/serious；纯键盘可完成开关、切 tab、确认/取消和 resize。
- 切 Session 不可能把旧 run 指令发给新 Session。

### Phase 3：性能、恢复与事件治理（2–4 周）

1. 版本化 snapshot + 增量 replay，避免 O(E²)。
2. 事件 payload discriminated schema、总字节预算、历史分页/归档。
3. Worker job timeout/cancel/backpressure/资源预算与增量 fingerprint。
4. store 原子 `append(expectedSequence)`，为未来多进程做 CAS/幂等键。
5. 生命周期 controller、结构化日志、metrics、scheduler/watchdog diagnostics。

**退出标准**

- 10k 事件 run 的 append/recovery/projection 有可量化 SLO。
- crash injection 后可重放到唯一状态，无半初始化 run。
- worker 卡住不会拖死其他 run，所有后台资源可在插件卸载后释放。

### Phase 4：工程与发布治理（可与 Phase 2/3 并行）

1. clean build、tarball clean-install/import smoke、peer compatibility matrix。
2. lint/format/coverage/audit；最低 Node 22.5 与最新 Node 22 matrix。
3. 固定 npm，Actions SHA pin，最小权限。
4. 收窄 package files，修正文档链接与 OIDC release 说明。
5. 标记旧 review 为 superseded，并在 PR 模板要求风险/测试/契约更新。

---

## 10. 建议新增测试矩阵

### 状态机/调度

- 4+ ready tasks 连续 scheduler kick，不得重复占用 slot。
- 同一 slot 第二个 Lease 拒绝；down/degraded/unavailable 成员操作矩阵。
- required blocked/failed → retry/reassign → completed。
- finish vs finish、finish vs cancel、projection throw、append throw。
- Healer health unavailable → pause → maintenance → resume。
- activity/owner 在 submit/revoke/interrupt/res/reassign 后一致。

### 安全/工作区

- bash `>`, `cp`, `sed -i`, `node/python -e` 跨 scope。
- root 外绝对路径、workspace symlink、symlink parent、root symlink。
- DPS-A 修改 DPS-B active scope 的归因。
- 任意 root、home/root/.git、文件而非目录、无权限目录。

### 工具/验收

- 每个默认 verification 命令 argv；ENOENT、exit 1、timeout、abort、子进程残留。
- validation 自动 ID 跨 service/plugin 重启。
- checks/findings/workOrder/report 大小上限。
- fail/blocked report 也覆盖所有 required criteria 的策略测试。

### UI

- run 切换时 pending action 清理；request reject/abort/unmount。
- tabs/focus/Escape/resize keyboard/aria progress。
- unknown slot、missing arrays、oversized projection、Error Boundary。
- 320/375/720/1024、200% zoom、reduced motion、high contrast、中英文时间格式。

### 构建发布

- 删除源文件后 clean build 不残留旧 lib。
- 从 tgz 干净安装并 import `.`, `./runtime`, `./client`, `./preset-sync`, `./package.json`。
- rc.1、rc.2/最新 peer matrix；关闭 legacy-peer-deps 的 consumer install。

---

## 11. 保留的优点

- `tsconfig.json:7-14` 已启用 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes。
- 事件 sequence/schemaVersion、幂等冲突、Lease/代际/版本检查基础扎实。
- 两阶段 fingerprint completion 思路正确，只需补并发 CAS。
- 指纹遍历已放到单 Worker，避免直接阻塞宿主主事件循环。
- 工具输入/输出多数使用 closed schema，输出摘要已有部分长度控制。
- React Overlay 使用原生 button、可见 focus、reduced-motion、空态和确认步骤。
- CI 有 typecheck/test/build/committed artifact 校验、npm provenance 与 Dependabot。
- 测试覆盖了主 happy path、战复、中断/重派、watchdog、workspace fingerprint、客户端静态渲染和 bundle 入口。

## 12. 总体评级

| 维度 | 当前 | 完成 Phase 0–2 后目标 |
|---|---:|---:|
| 核心状态机 | B- | A- |
| 安全/隔离 | C | B+（worktree/OS sandbox 后 A-） |
| 事件一致性/恢复 | B- | A- |
| UI/可访问性 | C+ | A- |
| 性能/可扩展性 | C+ | B+ |
| 测试与工程治理 | B | A- |
| 发布就绪度 | 暂缓 | Phase 0/1 完成后可 RC |

结论：优先修复 P0 与调度闭环，再做 UI 美化。当前最大的风险不是“页面不好看”，而是底层验收可能没有真正执行、写入权限承诺可被绕过，以及任务/成员状态存在不可达或歧义状态。把这些不变量修稳后，现有架构可以继续演进，无需整体推倒重写。
