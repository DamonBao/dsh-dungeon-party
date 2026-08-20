# DSH 五人本模式（dsh-dungeon-party）产品需求文档

> 文档版本：V1.2<br>
> 文档状态：待评审<br>
> 产品名称：五人本模式<br>
> 插件名称：`dsh-dungeon-party`<br>
> Agent Preset ID：`dungeon-party`<br>
> Cordis Service：`ctx.dungeonParty`

---

## 目录

- [1. 文档目的](#1-文档目的)
- [2. 背景与问题](#2-背景与问题)
- [3. 产品定位](#3-产品定位)
- [4. 产品目标与非目标](#4-产品目标与非目标)
- [5. 产品术语](#5-产品术语)
- [6. 角色与权限](#6-角色与权限)
- [7. 核心用户流程](#7-核心用户流程)
- [8. 副本状态机](#8-副本状态机)
- [9. 任务与报告协议](#9-任务与报告协议)
- [10. DPS 故障识别与战复机制](#10-dps-故障识别与战复机制)
- [11. 功能需求](#11-功能需求)
- [12. 模型工具设计](#12-模型工具设计)
- [13. 上下文与模型策略](#13-上下文与模型策略)
- [14. 共享工作区规则](#14-共享工作区规则)
- [15. 持久化与事件模型](#15-持久化与事件模型)
- [16. GUI 产品需求](#16-gui-产品需求)
- [17. 配置项](#17-配置项)
- [18. 非功能需求](#18-非功能需求)
- [19. 产品成功指标](#19-产品成功指标)
- [20. MVP 范围与版本规划](#20-mvp-范围与版本规划)
- [21. MVP 验收清单](#21-mvp-验收清单)
- [22. 风险与应对](#22-风险与应对)
- [23. 依赖与技术边界](#23-依赖与技术边界)
- [24. 待确认产品决策](#24-待确认产品决策)
- [25. 最终产品原则](#25-最终产品原则)

---

## 1. 文档目的

本文档定义 DSH 五人本模式插件的产品目标、角色模型、运行流程、功能需求、异常恢复机制、验收标准及版本规划，作为产品、设计、研发和测试的共同实施依据。

五人本模式借鉴 MMORPG 中“1 坦克、3 输出、1 治疗”的队伍结构，但底层采用通用工程领域模型，避免业务协议与游戏术语强耦合：

- **1T（指挥）**：负责理解目标、拆解任务、调度成员、处理冲突和汇总结果；
- **3DPS（执行）**：负责并行完成被分配的执行任务；
- **1奶（验收）**：负责独立验收、质量把关，在执行 Agent 故障时按 T 授权实施“战复”，T 挂掉时直接执行紧急战复，并在自身运行压力过高时按 T 的指令进行自我稳定。

核心产品原则是：

> 用固定角色、结构化任务和强制验收门禁，把一次复杂 Agent 任务变成可观察、可恢复、可验证的团队协作过程。

---

## 2. 背景与问题

单 Agent 执行复杂软件工程任务时，通常存在以下问题：

1. **规划、执行和验收混在同一上下文中**，容易产生自我确认偏差；
2. **复杂任务难以有效并行**，长链路工作耗时较高；
3. **子任务边界不清晰**，多个 Agent 共享工作区时容易互相覆盖；
4. **完成标准主要依赖 Prompt**，缺乏服务层强制门禁；
5. **执行 Agent 中断后缺少标准恢复机制**，任务状态和已有成果容易丢失；
6. **用户无法直观看到团队当前阶段、成员状态、执行进度和验收结果**。

DSH 已具备 Agent Teams、持久任务、消息通信和 continuable Agent 等基础能力。五人本模式不重新实现 Agent Loop，而是在现有能力上增加一层固定队伍、角色权限、状态机、验收门禁和故障恢复协议。

---

## 3. 产品定位

### 3.1 产品定义

`dsh-dungeon-party` 是一个面向复杂任务的 DSH 多 Agent 编排插件。用户选择“五人本模式”预设并提交目标后，系统自动组成固定逻辑队伍，由指挥 Agent 调度最多三个执行 Agent，并由独立验收 Agent 对最终产物进行检查。只有当前版本的工作成果通过验收，副本才允许完成。

### 3.2 目标用户

- 使用 DSH 完成中大型软件开发任务的开发者；
- 需要并行研究、修改、测试和审查的技术团队；
- 希望获得比普通子 Agent 更明确的协作过程、质量门禁和恢复能力的高级用户；
- 需要观察多 Agent 运行状态、失败原因和返工记录的插件开发者或调试人员。

### 3.3 典型场景

1. 跨多个模块开发一项功能；
2. 并行进行代码实现、测试补充和文档更新；
3. 大范围缺陷修复与回归验证；
4. 代码库审计、兼容性排查或迁移；
5. 一个执行 Agent 中途超时或崩溃后，在保留工作区成果的前提下继续任务；
6. 对最终结果有明确、可执行验收标准的复杂任务。

### 3.4 不适用场景

- 只需一次问答或单文件微小修改的简单任务；
- 无法拆分、必须完全串行完成的短任务；
- 要求五个 Agent 同时修改同一小段代码的任务；
- 没有明确目标、约束或可验证完成标准的开放式聊天。

---

## 4. 产品目标与非目标

### 4.1 产品目标

1. 提供固定的 1T、3DPS、1奶逻辑队伍模型；
2. 将规划、执行、验收三个角色在职责和权限上分离；
3. 支持最多三个执行 Agent 并行工作，但不强制所有槽位始终参与；
4. 使用结构化任务单、执行报告和验收报告传递关键信息；
5. 在服务层强制执行“验收通过后才能完成”的质量门禁；
6. 支持执行 Agent 故障识别、原地恢复和替身恢复；
7. 支持运行状态持久化，在 DSH 或插件重启后重建副本状态；
8. 提供清晰的队伍、任务、验收和返工可观察性；
9. 在共享工作区模式下尽量降低多 Agent 文件冲突风险；
10. 以可审计信号识别成员低血线，并支持 T 指令下的奶自我稳定；
11. 以 lease、checkpoint 和证据识别 DPS 停滞，支持安全重派；
12. 在 T 承压过高时自动背压和保存指挥快照，避免调度失控；
13. T 挂掉时允许奶无需 T 授权，直接使用紧急战复恢复原 Lead Session；
14. 在 MVP 验证有效后，为 GUI 面板和更多工作区隔离模式预留扩展点。

### 4.2 非目标

首版不包含以下能力：

1. 不重新实现 DSH Agent Loop、Session 或模型调用层；
2. 不将一次性 Workflow 作为核心运行机制；
3. 不在 MVP 自动创建、合并和清理 Git Worktree；
4. 不允许验收 Agent 直接修改实现代码；
5. 不承诺三个 DPS 必须平均分配工作量；
6. 不支持治疗 Agent 自我战复；
7. 不允许无限返工或无限重启 Agent；
8. 不以游戏化数值、装备或战斗系统替代真实工程指标。

---

## 5. 产品术语

| 产品术语 | 工程术语 | 说明 |
|---|---|---|
| 副本（Run） | 一次团队任务实例 | 从组队开始到完成、失败或取消的完整运行过程 |
| T / 坦克 | Commander / Lead | 根 Session，对用户负责并拥有调度权 |
| DPS | Executor | 执行一个或多个结构化工作单的子 Agent |
| 奶 / 治疗 | Validator | 独立验收 Agent，同时负责执行战复动作 |
| 槽位（Slot） | Logical Role Slot | 稳定逻辑身份，如 `dps-2`，不等于具体 Session |
| 代数（Generation） | Slot Instance Version | 同一槽位发生替身恢复后的实例序号 |
| 战复 | Agent Resurrection | 恢复原 Agent 或创建替代 Agent 继续任务 |
| 血线 | Member Readiness | 基于客观运行信号的可用性趋势，不是虚拟生命值 |
| 自我回血 | Self Maintenance | 奶按 T 指令在原 Session 内 checkpoint、减载和恢复能力，不是战复 |
| 紧急战复 T | Commander Emergency Resurrection | T down/unavailable 时，奶凭服务签发的一次性紧急票据直接恢复原 Lead Session，无需 T 授权 |
| 划水 | Task Progress Stall | 由 lease、checkpoint 和证据持续缺失确认的任务停滞 |
| T 扛不住/开减伤 | Commander Backpressure | 暂停新派工、降低并发和保存指挥快照 |
| 灭团 | Run Failed | 副本达到不可恢复失败条件 |
| 返工 | Repair Cycle | 验收失败后重新打开任务并交回 DPS 修复 |
| 任务单 | Work Order | T 分配给 DPS 的结构化任务对象 |
| 验收门禁 | Completion Gate | 阻止未验收或验收已失效的结果被标记完成 |

所有持久化接口、数据结构和服务 API 应优先使用工程术语；游戏术语主要用于 UI 展示、预设名称和用户体验文案。

---

## 6. 角色与权限

### 6.1 队伍结构

一个标准副本包含五个逻辑槽位：

| 槽位 | 数量 | Agent 类型 | 核心职责 |
|---|---:|---|---|
| `tank` | 1 | 根 Session / Commander | 面向用户、规划、分配、协调、集成和结束副本 |
| `dps-1` | 1 | Continuable Executor | 执行被分配的任务并提交证据 |
| `dps-2` | 1 | Continuable Executor | 执行被分配的任务并提交证据 |
| `dps-3` | 1 | Continuable Executor | 执行被分配的任务并提交证据 |
| `healer` | 1 | Continuable Validator | 审核计划、验收结果、诊断和执行战复 |

根 Agent 自身即为 T，因此标准情况下只需创建四个子 Agent。“五人”固定的是五个逻辑槽位；为控制成本，DPS 可按需延迟创建，奶可延迟到规划结束，但在首个写任务开始前必须激活，以保证 T 挂掉时可直接战复；这不代表运行期间始终有五个活跃 Session。

### 6.2 T（Commander）

**职责：**

- 接收并澄清用户目标；
- 生成任务计划和验收标准；
- 将任务拆成可并行或有依赖关系的工作单；
- 决定启用几个 DPS；
- 为每个任务划定修改范围；
- 监控任务状态、处理阻塞和文件冲突；
- 发起验收、接收 findings 并派发返工；
- 判断是否使用一次战复机会；战复次数的扣留与消耗由服务层按配置执行；
- 监控成员 readiness、任务进展和自身调度负载；
- 奶进入 `degraded` 时下达自我稳定指令，DPS 疑似停滞时请求 checkpoint；
- 自身进入高压状态时主动限流、暂停新派工并保存指挥快照；
- 汇总最终结果并向用户报告。

**禁止行为：**

- 在正常执行阶段承担大部分实现工作；
- 绕过验收门禁直接完成副本；
- 将同一可写范围同时分配给多个 DPS；
- 将业务阻塞错误标记为 Agent 死亡。

### 6.3 DPS（Executor）

**职责：**

- 领取并执行分配给自己的结构化工作单；
- 修改授权范围内的文件；
- 在修改前重新读取目标文件和当前工作区状态；
- 运行必要检查并保留执行证据；
- 按任务 lease 和里程碑提交进度 checkpoint；
- 提交结构化执行报告；
- 遇到业务阻塞时明确上报，而不是静默失败。

**禁止行为：**

- 擅自扩展到未授权的写入范围；
- 自行宣布整个副本完成；
- 代替奶提交最终验收结论；
- 在共享工作区中运行未被指派的全局格式化、代码生成或依赖安装命令。

### 6.4 奶（Validator）

**职责：**

- 可选地在执行前审核计划和验收标准；
- 在执行完成后独立验收当前工作区版本；
- 对每项验收标准记录检查结果和证据；
- 输出 `pass`、`fail` 或 `blocked` 结论；
- 将问题归属到具体任务或范围；
- 在收到 T 的自我稳定指令后，在原 Session 内保存 checkpoint、压缩上下文并重启验收 attempt；
- 在收到 T 的战复授权后，诊断故障 DPS 并执行恢复动作；
- T 进入 `down/unavailable` 时，无需 T 授权，消费服务签发的紧急指挥战复票据直接恢复原 Lead Session。

**禁止行为：**

- 直接修改业务实现以“顺手修复”验收问题；
- 未经 T 授权主动战复 DPS；唯一例外是 T 已被服务确认 `down/unavailable` 且存在有效紧急指挥战复票据；
- 主动发起自我稳定；
- 在验收不完整时提交 `pass`；
- 自我战复；自我稳定只能在原 Session 内执行，不能创建替身；
- 在 `unavailable` 或 `down` 后继续自行恢复；该情况必须暂停并交由人工处理或失败；
- 使用旧工作区指纹的报告通过当前版本门禁。

### 6.5 权限矩阵

| 能力 | T | DPS | 奶 | 服务层 |
|---|:---:|:---:|:---:|:---:|
| 创建副本 | ✅ | ❌ | ❌ | 执行 |
| 拆分和分配任务 | ✅ | ❌ | ❌ | 校验并记录 |
| 修改任务范围内文件 | 原则上不执行 | ✅ | ❌ | 分配时硬门禁；按 Session 遥测可用时精确审计，否则聚合审计 |
| 提交执行报告 | ❌ | ✅ | ❌ | 校验并记录 |
| 提交验收报告 | ❌ | ❌ | ✅ | 校验并记录 |
| 发起返工 | ✅ | ❌ | ❌ | 执行状态迁移 |
| 申请战复 | ✅ | ❌ | ❌ | 创建授权指令 |
| 执行 DPS 战复 | 授权 | ❌ | ✅ | 实际恢复/替换 DPS Session |
| T 挂掉后紧急战复 T | 无法授权 | ❌ | ✅（直接施放） | 自动签发一次性票据，仅恢复原 Lead Session |
| 查看运行健康状态 | ✅ | 仅自己 | 仅自己 | 聚合客观信号 |
| 指示奶自我稳定 | ✅ | ❌ | ❌ | 创建恢复指令 |
| 执行自我稳定 | ❌ | ❌ | ✅（仅自己） | 校验原 Session 与恢复边界 |
| 请求/提交进度 checkpoint | 请求 | 提交 | 提交 | 记录、判定停滞；overload 时可自动请求安全 checkpoint |
| 暂停/恢复新派工 | ✅ | ❌ | ❌ | 高压时可自动安全限流 |
| 重派或中断 DPS 任务 | ✅ | ❌ | ❌ | 校验工作区和任务 lease |
| 完成副本 | 申请 | ❌ | ❌ | 强制校验门禁 |
| 取消副本 | ✅/用户 | ❌ | ❌ | 清理和持久化 |

角色权限必须由服务端依据调用者的精确 Agent/Session 身份强制校验，不能只依赖 Prompt 或工具描述。

---

## 7. 核心用户流程

### 7.1 标准流程

```text
用户提交目标
  ↓
FORMING：创建队伍并绑定槽位
  ↓
PLANNING：T 拆解任务、定义范围和验收标准
  ↓
PLAN_REVIEW（可选）：奶审核计划是否完整、可测
  ↓
EXECUTING：最多 3 个 DPS 按依赖并行执行
  ↓
VALIDATING：奶对当前工作区版本进行独立验收
  ├─ PASS    → T 汇总 → COMPLETED
  ├─ FAIL    → T 映射 findings → REPAIR → EXECUTING
  └─ BLOCKED → T 处理阻塞，或进入 FAILED
```

### 7.2 简单任务降级流程

三个 DPS 是最大并发而不是最低使用数：

- 任务只有一个独立工作单时，只启用一个 DPS；
- 任务存在两个并行工作单时，只启用两个 DPS；
- 强依赖任务按 DAG 顺序唤醒 DPS；
- 未参与当前阶段的 DPS 保持 `idle`，不视为故障；
- 如果创建团队的成本高于任务收益，T 可建议用户改用普通 Agent 模式，但不得在已进入执行后无记录地切换。

### 7.3 验收失败返工流程

1. 奶提交 `fail` 和结构化 findings；
2. T 根据 `ownerTaskId`、文件范围和问题性质确定责任任务；
3. 服务将相关任务重新打开，并将副本切换为 `REPAIR`；
4. T 向原 DPS 或重新指定的 DPS 派发修复工作单；
5. DPS 完成修复并提交新证据；
6. 工作区版本发生变化，旧验收报告自动失效；
7. 奶必须对新版本重新验收；
8. 超过最大返工轮次后，副本进入 `FAILED`，并向用户报告剩余问题。

### 7.4 奶低血线自我稳定流程

```text
服务发现奶 readiness 降为 degraded
  ↓
向 T 暴露客观 health signals
  ↓
T 下达 validator-maintenance 指令
  ↓
奶保存当前 checkpoint，废弃在途验收 attempt
  ↓
奶在原 Session 内压缩上下文、重试能力探测并重新开始被中断的验收或诊断 attempt
  ├─ 成功 → readiness 恢复 healthy，继续当前阶段
  └─ 失败 → unavailable，暂停副本并请求人工处理或进入 FAILED
```

自我稳定不是自我战复，不创建新 Session、不消耗战复次数，也不能绕过独立验收。

### 7.5 DPS 疑似划水处理流程

```text
任务 lease 内长期无进度或证据增量
  ↓
服务标记 suspected-stalled，并通知 T
  ↓
T 请求结构化 checkpoint
  ├─ 有有效进展/阻塞证据 → 恢复 on-track 或按 blocked 处理
  └─ 连续缺少有效 checkpoint → 标记 stalled
  ↓
T 选择缩小任务、拆分、重派或中断
  ↓
重派前检查原 DPS 的已有修改和工作区指纹
```

“划水”是 UI 文案，底层必须使用可观测的进度状态；停滞不等于死亡，不消耗战复。只有 DPS 满足 `down` 判定后，才进入 T 授权、奶执行的普通战复流程；T down 使用紧急指挥战复。

### 7.6 T 承压过高流程

```text
T 的待决策队列、事件延迟或上下文压力达到阈值
  ↓
服务将 commanderLoad 标记为 pressured/overloaded
  ↓
自动停止新派工，保存指挥快照
  ↓
T 启用减伤：降低并发、要求成员 checkpoint、处理关键阻塞
  ├─ 压力恢复 → T 恢复派工
  └─ T down/unavailable → 冻结副本并自动签发紧急指挥战复票据
                         ↓
                    奶直接战复 T
                      ├─ 成功 → 原 Lead Session 恢复并复核指挥快照
                      └─ 失败 → 保持 paused，人工恢复或 FAILED
```

奶直接战复 T 是恢复原指挥，不是接管指挥。服务只负责冻结、签发票据和恢复 Session；奶、DPS 和服务本身都不能继承 T 的任务决策权。

---

## 8. 副本状态机

### 8.1 状态定义

| 状态 | 说明 | 允许的主要下一状态 |
|---|---|---|
| `FORMING` | 创建副本、槽位和成员 | `PLANNING`、`FAILED`、`CANCELLED` |
| `PLANNING` | T 拆解任务和定义验收标准 | `PLAN_REVIEW`、`EXECUTING`、`FAILED`、`CANCELLED` |
| `PLAN_REVIEW` | 奶审核计划 | `EXECUTING`、`PLANNING`、`FAILED`、`CANCELLED` |
| `EXECUTING` | DPS 执行工作单 | `VALIDATING`、`REPAIR`、`FAILED`、`CANCELLED` |
| `VALIDATING` | 奶验收当前工作区版本 | `COMPLETED`、`REPAIR`、`FAILED`、`CANCELLED` |
| `REPAIR` | T 根据 findings 组织返工 | `EXECUTING`、`VALIDATING`、`FAILED`、`CANCELLED` |
| `COMPLETED` | 当前版本通过验收且已完成汇总 | 终态 |
| `FAILED` | 达到不可恢复失败条件 | 终态，可基于历史创建新副本 |
| `CANCELLED` | 用户或 T 主动取消 | 终态 |

### 8.2 强制完成门禁

服务层只有在以下条件全部成立时，才允许进入 `COMPLETED`：

1. 所有必须任务均为 `completed`；
2. 不存在 `pending`、`running`、`blocked` 或待修复的必需任务；
3. 最新验收报告状态为 `current` 且结论为 `pass`；
4. 验收报告关联当前 `taskSetVersion` 和 `manifestVersion`，并完整覆盖全部必需验收标准；
5. 验收报告中的 `workspaceFingerprint` 与完成操作前重新计算的当前工作区指纹一致；
6. 验收完成后没有产生新的文件修改或任务变更；
7. 当前 `pass` 报告中不存在 `critical` 或 `major` finding；历史失败报告及其 findings 保留用于审计，但不要求单独执行关闭状态迁移；
8. 修复轮次未超过配置上限；
9. `RunControlState` 为 `normal`，T 与奶均不处于 `degraded`、`recovering` 或 `unavailable`；
10. 队伍中不存在尚未处理的战复、成员故障、已确认停滞事件或隔离中的工作区变更；
11. T 已生成面向用户的结果摘要。

任何条件不满足时，`party_finish` 必须拒绝操作，并返回可执行的阻塞原因。

### 8.3 失败条件

满足任一条件时，T 可申请或服务可强制进入 `FAILED`：

- 关键任务存在不可解决的业务阻塞；
- 奶无法完成关键验收，且没有可替代验收方案；
- 返工轮次达到上限后仍有阻断性问题；
- 战复次数或槽位最大代数耗尽，且任务无法重新分配；
- 工作区出现无法安全恢复的冲突或损坏；
- 关键依赖永久不可用；
- 权限、安全策略或沙箱策略禁止继续执行。

### 8.4 运行控制状态

运行时承压不新增主阶段，而使用与 `phase` 正交的控制状态，避免状态组合爆炸：

```ts
type RunControlState =
  | 'normal'
  | 'throttled'
  | 'paused'
  | 'recovering'
```

- `normal`：按计划调度；
- `throttled`：允许当前安全操作继续，但禁止拉起新的写任务；
- `paused`：冻结任务领取、重派、验收提交和完成，仅允许状态查询、checkpoint 与恢复操作；
- `recovering`：正在执行成员自我稳定或 T 原 Session 恢复；
- 控制状态变化不自动改变 `FORMING`～`VALIDATING` 主阶段；恢复后回到原阶段；
- `paused`、`recovering` 或存在 `degraded/unavailable` 的关键角色时，完成门禁必须拒绝 `party_finish`。

---

## 9. 任务与报告协议

### 9.1 工作单 WorkOrder

T 分配任务时必须创建结构化工作单：

```ts
interface WorkOrder {
  id: string
  runId: string
  title: string
  objective: string
  inputs: string[]
  constraints: string[]
  acceptanceCriteria: Array<{
    id: string
    description: string
    required: boolean
  }>
  readScopes: string[]
  writeScopes: string[]
  blockedBy: string[]
  expectedArtifacts: string[]
  priority: 'critical' | 'high' | 'normal' | 'low'
  required: boolean
  version: number
}

type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'scope-violation'

interface TaskRecord {
  workOrder: WorkOrder
  status: TaskStatus
  ownerSlot?: 'dps-1' | 'dps-2' | 'dps-3'
  progressState?: 'on-track' | 'suspected-stalled' | 'stalled'
  activeLease?: {
    leaseId: string
    ownerSlot: 'dps-1' | 'dps-2' | 'dps-3'
    grantedAt: string
    expiresAt: string
    version: number
  }
  lastCheckpointId?: string
  repairRound: number
}
```

任务状态、owner、progressState、activeLease 和返工轮次由服务维护，不由 T 或 DPS 自报覆盖。

**必填质量要求：**

- `objective` 能独立说明任务目标；
- 每项验收标准可检查、可举证，其 `id` 在副本内唯一（推荐使用 `<taskId>:<criterionId>`）；
- `required` 明确该任务是否属于完成门禁；
- `writeScopes` 尽量与其他并行任务不重叠；
- 依赖通过 `blockedBy` 明确表达；
- 全局命令只能归属一个工作单；
- 工作单发生实质变化时必须递增 `version`；
- 服务在任务创建、内容更新、重新打开或必需性变化时递增全局 `taskSetVersion`。

### 9.2 执行报告 ExecutionReport

DPS 完成或中止当前工作时必须提交：

```ts
interface ExecutionReport {
  taskId: string
  taskVersion: number
  leaseId: string
  leaseVersion: number
  slot: 'dps-1' | 'dps-2' | 'dps-3'
  generation: number
  status: 'completed' | 'blocked' | 'failed'
  summary: string
  changedFiles: string[]
  evidence: string[]
  commandsRun: Array<{
    command: string
    exitCode?: number
    summary: string
  }>
  risks: string[]
  remainingWork: string[]
  workspaceFingerprint?: string
}
```

只有结构合法、`taskVersion` 一致，且 `leaseId`、`leaseVersion`、slot 与当前有效 lease 完全匹配的报告才可推进任务状态。

### 9.3 验收清单与报告

服务在发起验收时生成不可变的版本化清单：

```ts
interface ValidationManifest {
  runId: string
  manifestVersion: number
  taskSetVersion: number
  workspaceFingerprint: string
  criteria: Array<{
    criterionId: string
    taskId: string
    taskVersion: number
    description: string
    required: boolean
  }>
  fingerprintIgnoreScopes: string[]
  createdAt: string
}
```

版本规则：

- 首次生成的 `manifestVersion` 为 1，并绑定生成时的 `workspaceFingerprint`；
- 任务集版本、工作区指纹，或验收标准的集合、描述、必需性及影响验收语义的配置变化时，服务生成新清单并将版本加一；
- owner、成员活动状态和纯展示文案变化不生成新清单；
- 清单以 `dungeon/validation-manifest-created` 事件完整持久化，冷恢复以最新事件为准；
- 新清单生成时，所有引用旧 `manifestVersion` 的验收报告立即变为 `stale`；
- 同一版本清单不可原地修改；重复生成请求通过幂等键返回同一版本。

奶基于该清单提交验收报告：

```ts
interface ValidationReport {
  runId: string
  validationId: string
  verdict: 'pass' | 'fail' | 'blocked'
  status: 'current' | 'stale' // 由服务维护
  taskSetVersion: number
  manifestVersion: number
  workspaceFingerprint: string
  checks: Array<{
    criterionId: string
    status: 'pass' | 'fail' | 'blocked' | 'not-applicable'
    evidence: string[]
    notApplicableReason?: string
  }>
  findings: Array<{
    id: string
    severity: 'critical' | 'major' | 'minor'
    ownerTaskId?: string
    title: string
    evidence: string
    remediation: string
  }>
  summary: string
  createdAt: string
}
```

**报告规则：**

- `validation_manifest` 生成带版本的验收清单，聚合当前任务集中全部验收标准；只有任务与标准均为 `required: true` 时，该标准才属于完成门禁；
- 报告的 `taskSetVersion`、`manifestVersion` 和 `workspaceFingerprint` 必须与清单完全一致；
- 每个 `criterionId` 在同一清单中唯一，报告必须逐项引用，不得使用自由文本替代关联；
- `pass` 必须覆盖清单中的全部必需标准，且每个必需标准只能出现一次并为 `pass`；
- 必需标准不得标记为 `not-applicable`；非必需标准使用该状态时必须填写 `notApplicableReason`；
- 存在 `critical` 或 `major` finding 时不得 `pass`；
- 每个 `fail` 或 `blocked` 检查必须提供证据；
- `minor` finding 可在产品策略允许时与 `pass` 并存，但必须保留记录；
- 工作区或任务集变化后，服务把报告状态从 `current` 改为 `stale`，不得再用于完成门禁。

---

## 10. DPS 故障识别与战复机制

### 10.1 设计原则

逻辑槽位必须与实际 Agent Session 分离：

```text
逻辑槽位 dps-2
  ├─ generation 1 → Session A（已故障）
  └─ generation 2 → Session B（当前实例）
```

UI 和任务归属始终使用稳定的 `dps-2`；底层通过 `generation` 和 `sessionId` 追踪真实实例。历史实例保留用于审计，不复用已失败成员名。

```ts
type PartySlot = 'tank' | 'dps-1' | 'dps-2' | 'dps-3' | 'healer'

interface SlotBinding {
  runId: string
  slot: PartySlot
  currentSessionId?: string
  generation: number
  history: Array<{
    sessionId: string
    generation: number
    boundAt: string
    unboundAt?: string
    endReason?: string
  }>
}
```

约束：

- 每个副本始终存在五个逻辑槽位，但不保证五个槽位始终都有活跃 Session；
- 每个槽位同一时刻最多只有一个 `currentSessionId`；未绑定时 `generation` 为 0，首次绑定后为 1；
- `tank` 绑定 Lead Session；DPS 可延迟创建；奶只可延迟到规划结束，进入执行前必须绑定并显示为待命；
- 重绑必须以原子事务完成当前实例关闭、历史追加、新实例绑定和代数递增；
- 首版自动替身恢复只适用于 DPS，但所有槽位均使用同一绑定模型，以支持持久化和后续扩展。

### 10.2 成员状态

生命状态与活动状态必须分开记录，避免把正常空闲误判为死亡：

```ts
type MemberLifeState =
  | 'alive'
  | 'down'
  | 'resurrection-requested'
  | 'resurrecting'
  | 'permanently-dead'

type MemberActivityState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'stopped'
```

### 10.3 故障分类

系统必须区分以下情况：

| 情况 | 是否视为死亡 | 默认处理 |
|---|:---:|---|
| Agent 正常空闲或当前无任务 | 否 | 保持 `idle`，需要时 follow-up 唤醒 |
| 单次 Turn 调用出错 | 否 | 优先在原 Session 重试 |
| DPS 连续超时达到 `memberConsecutiveTimeouts`（默认 2 次） | 是 | 标记 `down`，冻结任务，等待 T 决策 |
| T 连续超时或 Lead Session 无法继续 | 是 | 标记 `down/unavailable`，冻结副本并签发紧急指挥战复票据 |
| 奶连续超时且无法自我稳定 | 是 | 标记 `down/unavailable`，冻结副本并转人工恢复或失败 |
| DPS Session 无法恢复或上下文损坏 | 是 | 进入 DPS 战复流程，必要时创建替代实例 |
| 任务因需求、权限或依赖阻塞 | 否 | 提交 `blocked`，由 T 处理业务阻塞 |
| Agent 主动返回失败报告 | 视原因判断 | 可返工、重派或标记 `down` |
| 用户中断整个副本 | 否 | 进入 `CANCELLED`，不消耗战复 |

### 10.4 战复权限链

DPS 战复遵守普通权限链，T 战复使用唯一的紧急例外：

```text
DPS down：T 授权 → 奶诊断并施法 → DungeonService 恢复或替换 DPS Session
T down：DungeonService 签发紧急票据 → 奶直接施法 → DungeonService 仅恢复原 Lead Session
```

- 只有 T 可以申请 DPS 战复；
- T 被确认 `down/unavailable` 时，服务自动签发一次性紧急指挥战复票据，无需也不能等待 T 授权；
- 只有奶可以消费有效的普通战复指令或紧急指挥战复票据；
- 奶不得主动创建任何战复授权或票据；
- 服务层负责恢复 Session、创建 DPS 替代 Agent、重绑 DPS 槽位和更新任务；T 战复禁止创建替代指挥或转移决策权；
- 每张战复指令或紧急票据只能消费一次；
- DPS 战复受 `battleResCharges`、超时和最大代数限制；T 战复受独立的 `commanderBattleResCharges` 和超时限制；
- T 申请 DPS 战复成功时，服务以 `resurrectionId` 幂等地预留普通战复机会；服务签发紧急指挥票据时，以 `ticketId` 幂等地预留指挥战复机会；
- 奶调用 `battle_res` 时，服务必须以一次持久化事务把票据从 `issued` 改为 `consumed` 并写入 `commander-rescue-ticket-consumed`；该事件即为恢复 attempt 的唯一启动标记，冷恢复时不得再次消费；
- 票据在 `issued` 状态过期时写入 `commander-rescue-ticket-expired` 并始终释放预留，因为恢复尚未开始；
- 恢复成功时提交（commit）对应预留并扣减可用次数；
- 已启动的 DPS 战复或已消费紧急票据恢复失败/超时时，默认 `chargeOnFailedResurrection: true`，提交预留；配置为 `false` 时才释放预留；
- 对同一指令或票据的重放不得重复预留、消费、扣减或释放。

### 10.5 战复流程

#### 10.5.1 DPS 战复

```text
检测到 DPS 故障
  ↓
服务标记 down，并冻结其 running 任务
  ↓
T 调用 request_battle_res
  ↓
服务创建持久化战复指令并预留（reserve）一次可用次数
  ↓
奶收到诊断任务并调用 battle_res
  ↓
优先尝试原地恢复
  ├─ 成功：恢复原 Session 和任务 owner
  └─ 失败：创建下一代替代 Agent 并重绑逻辑槽位
  ↓
向恢复后的 Agent 注入 ResurrectionPacket
  ↓
Agent 检查当前 diff 和已有成果后继续任务
  ↓
成功则提交预留；失败或超时默认也提交，只有配置不计失败时才释放预留
```

#### 10.5.2 T 紧急战复

```ts
interface CommanderRescueTicket {
  ticketId: string
  runId: string
  targetSlot: 'tank'
  targetSessionId: string
  healerSessionId: string
  commanderCheckpointId: string
  status: 'issued' | 'consumed' | 'completed' | 'failed' | 'expired'
  issuedAt: string
  expiresAt: string
  version: number
}
```

状态迁移仅允许 `issued → consumed → completed|failed`，或 `issued → expired`；`completed`、`failed`、`expired` 均为票据终态。`consumed` 后发生进程崩溃时，服务依据同一 `ticketId` 恢复未完成 attempt，不得重新扣留 charge 或创建第二次恢复。

```text
服务确认 tank 对应 Lead Session down/unavailable
  ↓
RunControlState 切换为 paused，冻结新写入与状态推进
  ↓
服务保存 commander checkpoint 并签发一次性紧急指挥战复票据
  ↓
奶无需 T 授权，直接调用 battle_res 消费该票据
  ↓
DungeonService 仅尝试恢复原 Lead Session
  ├─ 成功：T 回到 recovering，复核 checkpoint、lease 与隔离变更
  │        └─ T 确认后恢复 normal/逐步派工
  └─ 失败：保持 paused，等待人工恢复或进入 FAILED
```

紧急指挥战复必须满足：

- 调用者为当前 `healer` 绑定 Session，奶生命状态为 `alive`、readiness 为 `healthy` 或 `degraded`，且不在其他恢复动作中；
- 目标只能是当前 `tank` 绑定的原 Lead Session；
- T 已被服务客观确认 `down/unavailable`，不能由奶自报或伪造；
- `expiresAt = issuedAt + commanderRescueTicketTtlMs`；消费时票据必须未过期、未消费，且 `commanderBattleResCharges > 0`；
- 恢复期间所有执行报告、验收报告和完成操作继续冻结；
- 奶以 `degraded` 状态完成紧急战复时，副本继续保持 `throttled/recovering`；复活后的 T 必须先指示奶自我稳定，再恢复正常派工；
- 恢复成功不自动恢复派工，必须由复活后的 T 检查 commander checkpoint 和隔离变更；
- 首版使用 `resume-only`，原 Lead Session 无法恢复时不得创建 `tank-r2` 或让奶/DPS 接任。

### 10.6 DPS 两级恢复策略

#### 一级：原地复活（Resume）

适用条件：

- 原 Session 仍可读取；
- Agent 上下文和任务状态未损坏；
- continuable follow-up 可正常发送；
- 未超过原地重试次数。

行为：

- 保留原 `sessionId`、`generation` 和任务 owner；
- 注入失败原因、当前任务和继续执行指令；
- 要求 Agent 先核对工作区状态再继续。

#### 二级：替身复活（Replace）

适用条件：

- 原 Session 无法恢复；
- 上下文损坏或连续恢复失败；
- 配置使用 `replace-only` 策略。

行为：

1. 创建如 `dps-2-r2` 的新 Agent 实例；
2. 将 `dps-2` 槽位绑定到新 Session；
3. `generation` 加一；
4. 原 Session 保留为历史记录；
5. T 确认原任务继续、拆分或重派；
6. 向新 Agent 注入恢复包；
7. 新 Agent 先检查现有 diff，禁止盲目重做。

### 10.7 恢复包 ResurrectionPacket

```ts
interface ResurrectionPacket {
  runId: string
  slot: 'dps-1' | 'dps-2' | 'dps-3'
  generation: number
  objective: string
  currentTask: WorkOrder
  previousProgress: ExecutionReport[]
  failureReason: string
  workspaceFingerprint: string
  changedFiles: string[]
  remainingCriterionIds: string[]
  recoveryInstructions: string[]
}
```

恢复包只包含继续任务所需的结构化信息，不复制完整历史对话。

### 10.8 默认战复配置

```yaml
battleResCharges: 1
commanderBattleResCharges: 1
resurrectionTimeoutMs: 120000
commanderRescueTicketTtlMs: 60000
commanderResurrectionTimeoutMs: 120000
commanderResurrectionPolicy: resume-only
maxGenerationsPerSlot: 3
resurrectionPolicy: resume-first # resume-first | replace-only
maxResumeAttempts: 1
chargeOnFailedResurrection: true
```

约束：

- 每次副本的 DPS 战复和指挥紧急战复次数均有限，两个 charge 池互不挪用；
- 战复期间目标任务保持冻结；
- 奶无法自我战复；
- 奶故障不适用标准战复，首版进入人工干预或失败处理；
- T 故障进入紧急指挥战复流程，由奶直接恢复原 Lead Session；失败后再进入人工干预或失败处理；
- 达到槽位最大代数后标记 `permanently-dead`；
- T 可将任务重派给其他存活 DPS，或宣告副本失败。

### 10.9 运行健康、划水检测与指挥承压

#### 10.9.1 健康不是虚拟数值

UI 可以使用血条展示趋势，但服务层不得仅凭一个不透明的“HP 分数”执行停机、重派或战复。系统使用独立于 `MemberLifeState` 和 `MemberActivityState` 的 readiness：

```ts
type MemberReadiness =
  | 'healthy'
  | 'degraded'
  | 'recovering'
  | 'unavailable'

interface HealthSignal {
  id: string
  runId: string
  slot: PartySlot
  source: 'runtime' | 'service' | 'agent-report' | 'commander'
  kind:
    | 'turn-error'
    | 'timeout'
    | 'context-pressure'
    | 'budget-pressure'
    | 'tool-failure'
    | 'queue-pressure'
    | 'progress-stall'
  severity: 'warning' | 'critical'
  observedAt: string
  windowMs: number
  evidence: string[]
  version: number
}
```

判定规则：

- runtime/service 的客观信号优先，Agent 自报只能补充，不能单独触发惩罚性重派或死亡判定；
- 上下文使用率、预算余额等宿主未提供的指标记为 `unknown`，不得伪造数值；
- 除明确致命错误外，在 `readinessEvaluationWindowMs` 内累计达到 `readinessWarningSignalCount` 才进入 `degraded`，恢复失败或 critical 信号累计达到 `readinessCriticalSignalCount` 才进入 `unavailable`；
- `degraded` 表示仍能响应但需要减载；`unavailable` 表示无法安全继续；
- readiness 变化必须包含来源、证据、观察窗和版本，并持久化到 Session Log；
- readiness 与生命状态相关但不等价：`degraded` 不是 `down`，不能触发战复。

#### 10.9.2 奶低血线与自我稳定

奶满足任一建议条件时进入 `degraded`：

- 连续 Turn 错误或工具失败达到告警阈值；
- 宿主可观测的上下文使用率超过阈值；
- 验收/战复待处理队列超过上限；
- 剩余运行预算低于阈值且继续验收可能无法完成；
- T 根据可审计证据判断奶需要减载。

```ts
interface ValidatorMaintenanceCheckpoint {
  checkpointId: string
  runId: string
  slot: 'healer'
  activity: 'validation' | 'resurrection' | 'plan-review'
  attemptId?: string
  manifestVersion?: number
  completed: string[]
  pending: string[]
  evidenceDelta: string[]
  observedAt: string
}
```

处理协议：

1. 服务向 T 发出 health signal，但不允许奶自行决定战复或替身；
2. T 调用 `party_direct_recovery`，目标为 `healer`，动作固定为 `validator-maintenance`；
3. 服务将 readiness 置为 `recovering`，暂缓新的验收和战复请求；
4. 奶调用 `member_self_maintain`，在原 Session 内保存结构化 checkpoint、压缩上下文、将非关键队列 checkpoint 后延后处理，并重新探测工具能力；
5. 若自我稳定前存在正在执行的 validation attempt，必须废弃且不能继续提交 `pass`；若任务集和工作区未变，可沿用同一 manifest 开启新的 `validationId`，否则生成新 manifest 并使旧报告失效；
6. 成功后恢复 `healthy`；失败或超时后变为 `unavailable`，副本进入 `paused`，由用户人工恢复 Lead/Healer Session 或结束副本。

自我稳定明确不包含：创建替代奶、修改实现、提交未经重跑的验收结果、消费战复次数、在已经 `down/unavailable` 后自我复活。

#### 10.9.3 DPS 划水与停滞判定

底层不保存“划水”标签，而使用进度状态：

```ts
type TaskProgressState =
  | 'on-track'
  | 'suspected-stalled'
  | 'stalled'

interface DpsCheckpoint {
  checkpointId: string
  runId: string
  taskId: string
  taskVersion: number
  leaseId: string
  leaseVersion: number
  slot: 'dps-1' | 'dps-2' | 'dps-3'
  completed: string[]
  nextSteps: string[]
  evidenceDelta: string[]
  blockers: string[]
  workspaceFingerprint: string
  observedAt: string
}
```

`DPS` 仅在以下信号组合持续超过观察窗时进入 `suspected-stalled`：

- 已持有可运行任务 lease，但超过 `progressCheckpointIntervalMs` 没有 checkpoint；
- 没有活跃的已登记长任务、后台命令或外部等待；
- 没有新的文件、命令、证据或消息活动；
- 没有提交有效 `blocked` 报告；
- 任务依赖均已满足。

计时规则：任务领取时创建首个 checkpoint due；每经过一个 `progressCheckpointIntervalMs` 后进入响应窗，超过 `checkpointResponseTimeoutMs` 仍无有效 checkpoint 才将 missed 计数加一并创建下一个 due。missed 达到 `maxMissedCheckpoints` 时确认 `stalled`。lease 最小时长必须覆盖全部 missed 观察窗，因此正常配置下不会在停滞判定前提前到期。

处置顺序：

1. T 调用 `party_request_checkpoint`；
2. DPS 在期限内调用 `member_checkpoint`；
3. 有可验证进展则恢复 `on-track`，服务在同一 owner 下续签 lease；有真实阻塞则转标准 `blocked` 流程；
4. 连续 `maxMissedCheckpoints` 次未响应，或 checkpoint 无证据且与工作区状态矛盾时，标记 `stalled`；
5. T 可继续观察、缩小任务、拆分任务、调用 `party_reassign` 重派，或调用 `party_interrupt` 中断当前 Agent Turn；
6. 中断时服务以 `turnId` 写入 `task-interrupt-requested`，停止 lease 续签并请求运行时终止当前 Turn；成功后写入 completed 并撤销 lease，失败则写入 failed、保持任务暂停且禁止重派；
7. 中断请求后旧 Turn 竞态返回的报告一律拒绝；期间产生的工作区变化进入 `workspace-changes-quarantined`，等待 T 复核；
8. 重派前服务必须保存原 owner checkpoint，检查部分修改、后台任务和工作区指纹，避免两个 DPS 同时继续同一 lease；
9. 原 lease 撤销并持久化后，新 owner 才能领取任务。

lease 到期后旧 owner 不得继续产生新写入或提交完成报告，Agent 也不能自行续签；服务仅能基于有效 checkpoint 续签同一 owner，重派仍必须由 T 决策。

停滞本身不等于 `down`、不消耗战复次数。只有后续满足既有故障检测规则时，才允许走战复。

#### 10.9.4 T 扛不住与调度背压

```ts
type CommanderLoadState =
  | 'normal'
  | 'pressured'
  | 'overloaded'
  | 'unavailable'

interface CommanderCheckpoint {
  checkpointId: string
  runId: string
  phase: string
  controlState: RunControlState
  taskSetVersion: number
  pendingDecisionIds: string[]
  activeLeaseIds: string[]
  memberReadiness: Partial<Record<PartySlot, MemberReadiness>>
  workspaceFingerprint: string
  createdAt: string
}
```

指挥负载由以下可观测信号判定：

- 待决策事件数量和最老事件延迟；
- 同时处于 `blocked`、`stalled`、`down` 或返工状态的任务数量；
- 尚未集成的执行报告和冲突数量；
- T 连续 Turn 超时、非法状态迁移或工具错误；
- 宿主可提供时的上下文与预算压力。

待决策数量达到 `commanderMaxPendingDecisions` 或最老事件超过 `commanderDecisionSlaMs` 时进入 `pressured`；两项同时满足、连续 T Turn 错误达到阈值，或出现 critical commander health signal 时进入 `overloaded`。原 Lead Session 无法继续时进入 `unavailable`。

当状态为 `pressured` 时，T 应降低新任务启动速率、优先处理关键阻塞并请求成员 checkpoint。当状态为 `overloaded` 时，服务执行安全背压：

1. 将 `RunControlState` 切换为 `throttled`；
2. 停止新任务领取和新 Agent 启动，但不强杀已登记的安全读操作；
3. 请求运行中的 DPS 在安全点提交 checkpoint；
4. 将任务板、待决策队列、成员状态和工作区指纹写入 commander checkpoint；
5. T 在原 Session 内完成上下文压缩、降低并发或请求用户缩小范围/增加预算；
6. T 确认恢复后调用 `party_resume_dispatch`，服务重新校验 lease 和工作区后逐步恢复。

若 T 进入 `unavailable`，服务必须将副本切换为 `paused`，禁止新的写工具调用、重派、验收和完成，并自动签发紧急指挥战复票据通知奶直接施法。已登记且无法安全中断的命令可以结束，但其结果和工作区变化必须被隔离为待复核状态，T 恢复前不能推进任务或验收。战复成功后仍由原 Lead Session 复核并恢复派工；票据不可用或恢复失败时才转人工恢复、结束副本或 `FAILED`。奶、DPS 与服务均不得自动接管指挥，也不得为 T 创建替身。

---

## 11. 功能需求

### 11.1 P0：队伍创建与恢复

#### FR-001 创建固定逻辑队伍

用户选择“五人本模式”并提交任务后，系统必须创建一个副本实例及五个逻辑槽位。

**验收标准：**

- 生成唯一 `runId`；
- 根 Session 绑定 `tank`；
- 建立 `dps-1`、`dps-2`、`dps-3`、`healer` 槽位；
- DPS 子 Agent 可按需延迟创建；奶可在规划阶段延迟，但进入 `EXECUTING` 或签发首个写 lease 前必须已创建并绑定；
- 所有绑定关系可持久化并恢复。

#### FR-002 成员角色隔离

系统必须按槽位为不同 Agent 注入不同 persona、工具集合和权限。

**验收标准：**

- DPS 无法调用 T 或奶的专属工具；
- 奶无法修改实现或提交执行报告；
- 伪造角色字段不能绕过身份检查；
- 角色与 Session 绑定变化有审计记录。

#### FR-003 副本冷恢复

DSH 进程或插件重启后，系统必须能依据 Lead Session 日志重建副本状态。

**验收标准：**

- 可恢复当前阶段、控制状态、任务、lease、成员绑定、readiness、commander checkpoint 和剩余战复次数；
- 可识别正在进行但未完成的恢复、重派、验收和背压动作；
- 不会把旧验收报告错误用于新工作区版本；
- 恢复后 T 能继续调度。

### 11.2 P0：规划与任务分配

#### FR-010 结构化拆解

T 必须将目标拆为一个或多个 `WorkOrder`，并给出任务依赖、写入范围和验收标准。

#### FR-011 最大三路并发

系统支持最多三个 DPS 并行执行，并允许未使用槽位保持空闲。

#### FR-012 依赖控制

存在 `blockedBy` 未完成依赖的任务不得被执行。

#### FR-013 写入范围冲突提示

当两个可并行任务的 `writeScopes` 重叠时，系统必须阻止并行分配或要求 T 显式改为串行。

#### FR-014 全局命令单一归属

依赖安装、全局格式化、代码生成、迁移等可能影响整个工作区的操作必须归属唯一任务。

#### FR-015 Scope 执行模式

系统必须公开当前 `scopeEnforcementMode` 及其保证边界；严格按 Agent 限制写入但宿主没有 Session 级遥测时，服务必须串行执行写任务，不得伪装成可精确审计的并行模式。

### 11.3 P0：执行与报告

#### FR-020 任务领取与执行

DPS 只能领取分配给其当前逻辑槽位且依赖已满足的任务。

#### FR-021 结构化提交

DPS 必须使用 `ExecutionReport` 提交完成、阻塞或失败结果。

#### FR-022 证据记录

执行报告必须记录修改文件、命令结果、风险和剩余工作；缺少必需字段时任务不得完成。

#### FR-023 任务与 Lease 版本校验

旧版本工作单、过期/已撤销 lease 或不匹配 owner slot 的执行报告不得覆盖当前任务状态。

### 11.4 P0：独立验收与完成门禁

#### FR-030 发起验收

所有必需执行任务完成后，T 可发起对当前任务集和工作区版本的验收。

#### FR-031 奶独立验收

奶接收目标、验收清单、当前 diff/产物、执行证据及只读工作区/验证工具，不默认继承全部 T 或 DPS 思维上下文。

#### FR-032 结构化验收报告

奶必须提交符合协议的 `ValidationReport`。

#### FR-033 报告失效

验收后若发生任务创建/删除/重新打开，或任务目标、输入、约束、验收标准、范围、依赖、必需性、版本发生变化，或工作区指纹发生变化，最新报告必须标记为 `stale`；仅展示文案或 owner 元数据变化不触发失效。

#### FR-034 强制完成门禁

没有当前版本的 `pass` 报告时，服务必须拒绝完成副本。

#### FR-035 返工闭环

验收失败后，T 必须把 findings 映射到任务并重新执行；奶不能直接修复。

### 11.5 P0：故障与战复

#### FR-040 故障检测

系统必须根据 Turn 错误、连续超时、Session 可恢复性等信息识别 DPS 故障，并与业务阻塞区分。

#### FR-041 战复申请

只有 T 能为 `down` 状态的 DPS 创建战复指令。

#### FR-042 战复执行

只有奶能消费 T 创建且未过期的战复指令。

#### FR-043 原地恢复优先

默认策略下，服务先尝试 continuable Agent 原地恢复，失败后再创建替代 Agent。

#### FR-044 槽位重绑

替代 Agent 创建成功后，逻辑槽位必须原子地切换到新 Session，并增加代数。

#### FR-045 有限资源

系统必须限制每次副本的战复次数、单槽位代数和恢复超时。

#### FR-046 恢复上下文

恢复后的 Agent 必须收到结构化恢复包，并先检查工作区已有成果。

### 11.6 P0：运行健康与承压控制

#### FR-047 可审计健康信号

系统必须将 readiness 与支撑它的来源、证据、观察窗和版本一起持久化；不得用模型主观自评或不透明 HP 单独触发惩罚性操作。

#### FR-048 奶自我稳定授权

只有 T 能向仍可响应的奶下达 `validator-maintenance`；奶只能在原 Session 内执行，不得自我战复、创建替身或消耗战复次数。

#### FR-049 验收 attempt 作废

奶开始自我稳定时，如存在正在进行的 validation attempt 则必须作废；恢复后必须使用新的 `validationId` 重新检查，旧 attempt 不得提交 `pass`。

#### FR-050 DPS 停滞检测

服务必须结合任务 lease、checkpoint、证据增量、活跃长任务、阻塞状态和连续观察窗判断停滞，不能仅凭耗时或无文件修改判定“划水”。

#### FR-051 安全重派

T 重派 stalled 任务前，服务必须撤销旧 lease、保存 checkpoint、检查部分修改和后台操作；旧 owner 失去 lease 后不得继续提交当前任务。

#### FR-052 T 调度背压

T 进入 `overloaded` 时，服务必须暂停新派工、保存 commander checkpoint 并允许 T 降低并发；服务不得自行做任务取舍或接管指挥。

#### FR-053 T 不可用保护

T 进入 `unavailable` 时，副本必须切换为 `paused` 并冻结新写入、验收和完成；服务签发紧急指挥战复票据前必须保存 commander checkpoint。

#### FR-054 奶直接战复 T

T `down/unavailable` 后，奶无需 T 授权即可消费服务签发的一次性紧急票据；服务只能恢复原 Lead Session，成功后仍需 T 复核并主动恢复派工，失败时保持 `paused`。

#### FR-055 DPS Turn 中断

T 中断 stalled DPS 时必须引用当前 `turnId`；服务记录 requested/completed/failed，拒绝中断请求后的旧 Turn 报告，隔离竞态写入，并且只有成功终止或确认 Turn 已结束后才允许撤销 lease 和重派。

### 11.7 P1：可视化面板

#### FR-060 队伍面板

显示五个槽位的角色、Agent 名称、当前代数、生命状态、readiness、运行状态及可展开的 health signals；T 额外显示 commanderLoad。

#### FR-061 阶段与任务面板

显示当前副本阶段、任务 DAG、任务 owner、lease、progressState、checkpoint、依赖、阻塞和返工次数。

#### FR-062 验收面板

显示最新验收结论、工作区版本、检查项、findings 和报告是否失效。

#### FR-063 战复交互

显示剩余战复次数、故障原因、战复进度和历史；T 可通过确认操作申请战复。

#### FR-064 控制操作

提供请求 checkpoint、指示奶自我稳定、暂停/恢复派工、中断成员、重派任务、重新验收和取消副本等操作，并进行角色、指令版本和状态校验。

### 11.8 P2：高级工作区模式

#### FR-070 Git Worktree 隔离

后续版本可提供：

```yaml
workspaceMode: shared | git-worktree
```

在 `git-worktree` 模式中，每个 DPS 使用独立工作区，由 T 或服务负责安全集成。该能力不属于 MVP。

---

## 12. 模型工具设计

### 12.1 T 工具

- `party_start`：创建并初始化副本；
- `party_assign`：创建或分配工作单；
- `party_status`：查看队伍、任务和阶段；
- `party_wait`：等待成员事件或任务完成；
- `party_reopen`：根据 finding 重新打开任务；
- `party_health`：查看 readiness、进度状态、指挥负载及其证据；
- `party_direct_recovery`：向仍可响应的奶下达自我稳定指令；
- `party_request_checkpoint`：要求成员提交结构化 checkpoint；
- `party_reassign`：安全撤销旧 lease 并重派 stalled 任务；
- `party_interrupt`：按 `turnId` 中断 stalled DPS 当前 Turn，并隔离竞态期间产生的修改；
- `party_pause_dispatch`：暂停新任务领取并保存指挥快照；
- `party_resume_dispatch`：复核状态后逐步恢复派工；
- `request_battle_res`：T 为 down DPS 申请普通战复；T 自身战复无需也不能调用该工具。
- `party_finish`：申请完成副本；
- `party_cancel`：取消副本。

### 12.2 DPS 工具

- `work_claim`：领取已分配任务并获得版本化 lease；
- `work_submit`：提交执行报告；
- `work_blocked`：报告业务阻塞；
- `member_checkpoint`：提交带证据增量和工作区指纹的进度 checkpoint；
- `party_message`：向 T 发送结构化消息。

### 12.3 奶工具

- `validation_manifest`：获取当前验收清单、工作区指纹和执行证据；
- `validation_submit`：提交验收报告；
- `member_checkpoint`：在恢复前保存当前验收或战复进度；
- `member_self_maintain`：消费 T 下达的有效自我稳定指令并在原 Session 内恢复；
- `battle_res`：消费 T 签发的 DPS 战复指令，或在 T down/unavailable 时直接消费服务签发的紧急指挥战复票据。

### 12.4 工具通用规则

- 每次调用校验 `runId`、调用者 Session、逻辑槽位和角色；
- 状态迁移必须满足当前副本状态；
- 所有写操作使用幂等键或事件 ID；
- 工具错误必须返回明确的机器可读错误码和用户可理解说明；
- 健康、checkpoint、恢复和派工控制工具必须携带指令/状态版本，拒绝旧版本重放；
- 所有关键操作写入 Session Log；
- 不向模型暴露其角色无权使用的工具。

---

## 13. 上下文与模型策略

### 13.1 T 上下文

- 使用强推理模型；
- 保留完整用户对话和副本摘要；
- 能读取所有工作单、执行报告、验收报告、readiness、进度和调度负载摘要；
- 承压恢复时从持久化 commander checkpoint 重建待决策队列；
- 避免自动继承所有 DPS 的完整推理轨迹，仅消费其结构化结果。

### 13.2 DPS 上下文

- 默认使用 fresh、continuable 子 Agent；
- 只注入完成当前任务所需的自包含信息；
- 注入工作单、任务 lease、checkpoint 截止时间、相关文件范围、约束和验收标准；
- 返工时可继续同一 Agent 对话；
- 替身复活时使用结构化恢复包，而不是复制完整对话。

### 13.3 奶上下文

- 默认使用 fresh、continuable 子 Agent；
- 接收原始目标、版本化验收清单、最终产物或 diff、执行证据，以及只读工作区和验证工具；
- 不接收“实现一定正确”等结论性提示；
- 保持独立审查视角；
- 自我稳定后从结构化 checkpoint 开启新的 validation attempt，不续用旧 attempt 的结论；
- 战复时只获取目标槽位的故障信息和恢复所需上下文。

---

## 14. 共享工作区规则

MVP 使用共享工作区，并执行以下规则：

1. `readScopes` 和 `writeScopes` 使用相对工作区根目录的规范化 POSIX glob，不允许绝对路径或通过 `..` 逃逸工作区；
2. T 优先划分互不重叠的 `writeScopes`；服务在分配时对规范化后的 scope 做重叠检测，对执行时间可能重叠的任务实施硬门禁；
3. 有重叠写入需求的任务必须串行；T 显式改为串行后才允许分配；
4. DPS 修改前必须重新读取目标文件，不得假设文件仍保持领取任务时的内容；
5. 全局格式化、代码生成、依赖安装和迁移由唯一任务负责；
6. 首版不承诺操作系统级文件锁；若 DSH 提供按 Agent 的文件操作遥测，服务按真实调用者审计实际写入；否则结合 `changedFiles`、任务起止指纹和最终 diff 做聚合审计，并明确该模式不能可靠归因并发 Agent 在他人合法 scope 内的写入；
7. 发现未被任何活动任务 `writeScopes` 覆盖的修改，或能明确归因的越界修改时，相关任务标记为 `scope-violation` 并阻止验收；无法归因时暂停相关并行任务，由 T 检查并撤销修改或更新任务范围、递增版本后继续；
8. 若底层沙箱支持按 Agent 限制路径，插件应进一步执行运行时硬隔离；
9. 奶只在所有必需 DPS 任务结束后开始最终验收；
10. 验收前 T 检查完整 diff、未跟踪文件和超过配置阈值的变更范围；
11. 工作区发生外部变更时，系统必须更新指纹并使旧验收失效。

`scopeEnforcementMode` 定义可验收边界：

- `telemetry`：依赖宿主按 Session 提供文件写入审计，可精确验证每个 DPS 是否越界；
- `aggregate`：只验证并行任务 `writeScopes` 的并集，能发现无人授权的文件变化，但不宣称能判断哪个 DPS 修改了另一个 DPS 的合法范围；
- `serial`：没有遥测且要求严格按 Agent 归因时，服务将写任务串行执行；
- `auto`：优先 `telemetry`，不可用时默认 `aggregate`；若 `strictPerAgentWriteScopes: true`，则回退为 `serial`。

因此，MVP 在 `aggregate` 模式下只把“活动任务范围并集之外的修改”作为机械门禁；“单个 DPS 不得修改他人合法范围”仍是角色协议和风险项，不对该模式作不可实现的强保证。

### 14.1 工作区指纹

工作区指纹的规范化输入至少包括：

- 当前 `taskSetVersion` 和 `manifestVersion`；
- Git HEAD；存在子模块时包含各子模块 HEAD；
- 按规范化相对路径排序后的已跟踪文件状态和内容哈希；
- 未跟踪文件清单和内容哈希；
- 未被忽略的配置、生成物和符号链接目标；
- 当前插件配置中影响验收语义的字段。

默认只忽略 `.git/**` 和 DSH 明确声明的内部临时文件；其他 Git ignored、未跟踪或生成文件不得仅因被忽略规则命中而自动排除。额外忽略范围必须通过 `fingerprintIgnoreScopes` 显式配置、写入副本事件并展示在验收清单中。

完成操作必须执行防竞态校验：

1. 获取副本级 completion mutex，阻止插件调度的新写任务；
2. 重新读取任务集和验收清单版本；
3. 计算工作区指纹并与 `ValidationReport` 比对；
4. 版本和指纹一致时写入非终态 `dungeon/run-completion-prepared`，载荷记录预期版本、指纹和原生 workspace revision（若有）；
5. 若 DSH 提供原生 workspace revision，以 compare-and-set 校验 revision 未变化后写入唯一终态 `dungeon/run-completed`；
6. 若没有原生 revision，在 prepared 事件后再次计算指纹，只有两次结果一致才写入 `run-completed`；否则写入 `dungeon/run-completion-aborted` 并将报告标记为 `stale`；
7. `run-completed` 持久化后不再执行可撤销其结论的后验检查，也不允许回退到非终态。

MVP 无法锁定插件之外的外部进程直接修改文件，因此采用上述乐观一致性校验；检测到终态事件写入前的外部变化时必须安全失败。终态写入后的外部修改不属于已完成副本的验收快照，应作为新的工作变化展示，但不能改写历史结果。

---

## 15. 持久化与事件模型

### 15.1 持久化原则

所有影响恢复、权限或完成门禁的状态必须可由 Lead Session 日志重建，不能只保存在内存中。

### 15.2 核心事件

```text
dungeon/run-created
dungeon/member-bound
dungeon/member-role
dungeon/phase-changed
dungeon/task-created
dungeon/task-assigned
dungeon/task-started
dungeon/task-lease-granted
dungeon/task-lease-renewed
dungeon/task-lease-revoked
dungeon/task-submitted
dungeon/task-reopened
dungeon/checkpoint-requested
dungeon/checkpoint-submitted
dungeon/task-progress-observed
dungeon/task-stall-suspected
dungeon/task-stall-confirmed
dungeon/task-interrupt-requested
dungeon/task-interrupt-completed
dungeon/task-interrupt-failed
dungeon/task-owner-reassigned
dungeon/member-health-signal-raised
dungeon/member-health-signal-cleared
dungeon/member-readiness-changed
dungeon/member-recovery-directed
dungeon/member-recovery-started
dungeon/member-recovery-completed
dungeon/member-recovery-failed
dungeon/commander-load-changed
dungeon/commander-checkpointed
dungeon/commander-rescue-ticket-issued
dungeon/commander-rescue-ticket-consumed
dungeon/commander-rescue-ticket-expired
dungeon/commander-resurrection-completed
dungeon/commander-resurrection-failed
dungeon/dispatch-throttled
dungeon/dispatch-paused
dungeon/dispatch-resumed
dungeon/workspace-changes-quarantined
dungeon/validation-manifest-created
dungeon/validation-started
dungeon/validation-submitted
dungeon/validation-stale
dungeon/member-down
dungeon/resurrection-requested
dungeon/resurrection-reserved
dungeon/resurrection-started
dungeon/member-rebound
dungeon/resurrection-committed
dungeon/resurrection-released
dungeon/resurrection-completed
dungeon/resurrection-failed
dungeon/run-completion-prepared
dungeon/run-completion-aborted
dungeon/run-completed
dungeon/run-failed
dungeon/run-cancelled
```

每个事件使用统一信封：

```ts
interface DungeonEvent<T = unknown> {
  eventId: string
  runId: string
  sequence: number
  schemaVersion: number
  type: string
  actorSessionId?: string
  causationId?: string
  idempotencyKey?: string
  occurredAt: string
  payload: T
}
```

规则：

- 同一 `runId` 的 `sequence` 必须单调递增，状态只能由已确认持久化的事件推进；
- `eventId` 和有副作用命令的 `idempotencyKey` 全局唯一，重放重复事件时忽略其副作用；
- 读取端必须按 `schemaVersion` 解析；遇到未知的关键事件版本时停止自动恢复并请求人工处理；
- 任何工具成功返回前，其对应状态事件必须已持久化；
- 外部副作用采用“意图事件 → 执行 → 结果事件”记录，恢复时根据最后确认点继续或补偿。

### 15.3 成员重绑事件

```ts
interface MemberReboundEvent {
  runId: string
  slot: PartySlot
  previousSessionId: string
  currentSessionId: string
  generation: number
  resurrectionId?: string
  timestamp: string
}
```

### 15.4 一致性要求

- 事件必须有唯一 ID；
- 重放同一事件不得重复扣除战复次数或重复创建成员；
- 槽位重绑和任务 owner 更新必须原子化或可补偿；
- 快照只用于加速恢复，Session Log 仍是可审计事实来源；
- 非终态副本恢复时必须检查未完成动作并执行补偿。

冷恢复测试必须覆盖以下崩溃注入点：

| 操作 | 崩溃点 | 恢复不变量 |
|---|---|---|
| 创建副本/成员 | 意图后、绑定前、绑定后 | 每个槽位至多一个当前绑定，不重复创建已确认成员 |
| 分配任务 | 任务创建后、owner 更新前 | 同一任务版本只有一个 owner，依赖关系不丢失 |
| 撤销 lease/重派 | checkpoint 后、旧 lease 撤销前后、新 owner 绑定前后 | 任一时刻只有一个有效写 lease，旧 owner 不得继续提交 |
| 中断 stalled Turn | interrupt requested/completed/failed 前后 | 旧 Turn 迟到报告被拒绝，竞态写入被隔离，中断未确认时不得重派 |
| 奶自我稳定 | 指令后、checkpoint 前后、attempt 作废前后 | 不创建替身；旧 validation attempt 永远不能提交 `pass` |
| T 承压暂停 | commander checkpoint 和 dispatch-paused 前后 | 恢复后待决策队列不丢失；暂停期间不产生新写 lease |
| 紧急战复 T | ticket issued/consumed/expired 前后、原 Lead Session 恢复前后 | issued 只预留一次；未消费过期必定释放；consumed 后只恢复同一 attempt；不创建替代 T；成功后仍保持 recovering 直到 T 主动恢复派工 |
| 提交执行报告 | 报告持久化前后 | 同一幂等键只推进一次任务状态 |
| 提交验收报告 | 指纹计算后、报告事件前后 | 仅完整持久化的报告可成为 `current` |
| 申请战复 | reserve 前后 | 同一 `resurrectionId` 只预留一次次数 |
| 槽位重绑 | 新 Session 创建后、重绑事件前后 | 最多一个 current Session，代数只增加一次 |
| 战复结算 | commit/release 前后 | 次数不重复扣减或返还 |
| 完成副本 | prepared 前后、终态事件前后 | prepared 可安全重放或中止；只有最终复核通过才产生唯一 `COMPLETED` |

---

## 16. GUI 产品需求

GUI 为 P1，可在命令和工具协议稳定后实施。

### 16.1 页面入口

- 新建会话预设选择器：`五人本模式`；
- 会话内侧边面板或 Tab：`副本`；
- 可选状态图标展示当前阶段和最终结果。

### 16.2 队伍区域

每个槽位展示：

- 角色图标和逻辑槽位名；
- 当前 Agent 名称；
- Session 运行状态；
- 生命状态与 readiness；
- 可选“血条”仅作为 readiness 的视觉映射，并可展开查看实际 health signals、证据和未知指标；
- T 额外展示 commanderLoad 和待决策队列；
- 当前任务；
- generation；
- 最近一次活动时间；
- 故障或阻塞摘要。

### 16.3 任务区域

- DAG 或分组列表；
- 任务状态、owner、依赖和优先级；
- progressState、lease 有效期和下一次 checkpoint 截止时间；
- `writeScopes` 和预计产物；
- 最近 checkpoint、证据增量和停滞判定依据；
- 执行报告摘要；
- 返工次数；
- 阻塞原因。

### 16.4 验收区域

- 当前验收状态；
- 关联任务集版本和工作区指纹摘要；
- 每项标准的检查结果；
- findings 按严重级别分组；
- 报告是否已失效；
- 重新验收入口。

### 16.5 战复区域

- 剩余战复次数；
- 当前申请和倒计时；
- 故障诊断；
- 原地恢复或替身恢复结果；
- 历史代数和旧 Session；
- 需要 T 确认的战复操作。

### 16.6 承压与恢复区域

- 奶低血线时向 T 展示“指示自我稳定”，并明确该操作不是战复；
- DPS 疑似停滞时展示请求 checkpoint、缩小任务、重派和中断入口；
- T 承压时显示当前背压级别、未处理事件和暂停/恢复派工操作；
- T `down/unavailable` 时向奶展示紧急战复票据和“直接战复 T”操作，无需 T 确认；
- 紧急战复失败时展示人工恢复或结束副本选项，不提供越权角色接管按钮；
- 所有状态均可展开查看触发证据、观察窗、版本和事件时间线。

### 16.7 交互原则

- 游戏化视觉只作为辅助，不隐藏工程状态；
- 关键操作必须显示影响和二次确认；
- 状态颜色不能作为唯一信息载体；
- 所有失败状态都提供原因和建议动作；
- 用户可展开查看原始结构化报告和事件时间线。

---

## 17. 配置项

```yaml
presetId: dungeon-party
workspaceMode: shared
scopeEnforcementMode: auto # auto | telemetry | aggregate | serial
strictPerAgentWriteScopes: false
planReviewEnabled: true
maxConcurrentDps: 3
maxRepairRounds: 3
battleResCharges: 1
commanderBattleResCharges: 1
resurrectionTimeoutMs: 120000
commanderRescueTicketTtlMs: 60000
commanderResurrectionTimeoutMs: 120000
commanderResurrectionPolicy: resume-only
resurrectionPolicy: resume-first
maxResumeAttempts: 1
maxGenerationsPerSlot: 3
chargeOnFailedResurrection: true
memberTurnTimeoutMs: 300000
memberConsecutiveTimeouts: 2
readinessEvaluationWindowMs: 120000
readinessWarningSignalCount: 2
readinessCriticalSignalCount: 2
contextPressureThreshold: 0.85
budgetRemainingWarningRatio: 0.15
healerMaxPendingActions: 3
memberRecoveryTimeoutMs: 120000
progressCheckpointIntervalMs: 180000
checkpointResponseTimeoutMs: 60000
maxMissedCheckpoints: 2
taskLeaseDurationMs: 600000
commanderMaxPendingDecisions: 6
commanderDecisionSlaMs: 180000
autoThrottleOnCommanderOverload: true
largeChangeFileThreshold: 100
fingerprintIgnoreScopes:
  - .git/**
  - .dsh/dungeon-party/tmp/**
validationRequired: true
allowMinorFindingsOnPass: true
```

### 17.1 配置约束

- `maxConcurrentDps` 首版最大为 3；
- `scopeEnforcementMode: telemetry` 仅在宿主确认提供按 Session 写入遥测时可用；严格模式下若遥测不可用，必须回退到 `serial`；
- `validationRequired` 在正式五人本模式中必须为 `true`，仅开发调试环境可关闭；
- `battleResCharges` 不得为负数；正式五人本模式的 `commanderBattleResCharges` 至少为 1；首版 `commanderResurrectionPolicy` 固定为 `resume-only`；
- `maxGenerationsPerSlot`、`memberConsecutiveTimeouts`、`readinessWarningSignalCount`、`readinessCriticalSignalCount`、`maxMissedCheckpoints`、`healerMaxPendingActions`、`commanderMaxPendingDecisions` 和 `largeChangeFileThreshold` 至少为 1；
- 所有 `*Ms` 时长必须为正数，且 `taskLeaseDurationMs` 必须严格大于 `maxMissedCheckpoints × (progressCheckpointIntervalMs + checkpointResponseTimeoutMs)`，避免最后一次 stalled 判定与 lease 到期同刻竞态；`contextPressureThreshold` 和 `budgetRemainingWarningRatio` 必须处于 `(0, 1)`；
- 宿主不提供 context/budget 指标时，相应阈值不参与 readiness 判定；
- `fingerprintIgnoreScopes` 必须使用工作区相对路径，并在验收清单中可见；
- 修改关键配置必须写入副本事件；
- 已开始副本的关键限制不应被静默放宽。

---

## 18. 非功能需求

### 18.1 可靠性

- 服务重启后可恢复所有非终态副本；
- 关键写操作具备幂等性；
- 单个 Agent 故障不得直接导致整个插件崩溃；
- T 过载时服务必须先限流；T down/unavailable 时先冻结并签发紧急指挥战复票据，不得继续制造新的写 lease；
- 奶自我稳定失败不得被误判为已验收或自动创建替身；
- 战复失败不得破坏原工作区成果；
- 终态副本不可被普通工具重新打开。

### 18.2 可观察性

至少记录：

- 各阶段耗时；
- 每个任务的排队、执行、阻塞和返工时间；
- Agent Turn 错误、超时和重试；
- readiness、health signals、状态降级与恢复耗时；
- checkpoint 准时率、停滞判定、lease 撤销和任务重派；
- commanderLoad、事件积压、自动背压和暂停时长；
- 战复申请、诊断、恢复方式和结果；
- 验收通过率和报告失效次数；
- 工具权限拒绝和非法状态迁移；
- Token/模型调用成本（底层能力可用时）。

### 18.3 性能

- 状态查询不应触发所有 Agent 唤醒；
- 大型报告应支持摘要和按需展开；
- 工作区指纹计算应支持增量或缓存；
- GUI 状态更新应避免因高频事件造成明显卡顿。

### 18.4 安全

- 工具权限依据真实调用者身份校验；
- 紧急指挥战复票据必须绑定 runId、原 tank Session、当前 healer Session、checkpoint 和过期时间；
- 不信任 Agent 自报角色或 T 死亡状态；
- 文件访问继续继承 DSH 宿主沙箱策略；
- 不绕过用户审批、网络、SSH 或其他高风险工具约束；
- 恢复包不得包含与任务无关的敏感上下文；
- 日志应避免记录密钥、令牌和完整敏感文件内容。

### 18.5 兼容性

- 兼容 DSH continuable 子 Agent 机制；
- 优先通过稳定扩展接口接入 Agent Teams；
- 在底层仍属 experimental 时，通过适配层隔离内部 API 变化；
- 插件禁用后，不影响普通 DSH 会话和其他 Agent 模式。

---

## 19. 产品成功指标

### 19.1 核心指标

| 指标 | 定义 | MVP 目标 |
|---|---|---:|
| 副本完成率 | 进入执行后最终 `COMPLETED` 的比例 | 建立基线后持续提升 |
| 首次验收通过率 | 第一轮 Validation 即通过的比例 | 用于衡量拆解和执行质量 |
| 验收门禁绕过率 | 未满足条件却完成的比例 | 0% |
| 故障恢复成功率 | `down` DPS 经战复后继续完成任务的比例 | ≥ 70%（样本充足后评估） |
| 状态恢复正确率 | 重启后正确恢复副本的比例 | 100%（测试场景） |
| 并行收益 | 相对单 Agent 的总耗时改善 | 在可并行任务中观察正收益 |
| 文件冲突率 | 因并行修改造成的返工比例 | 持续下降 |
| 奶自我稳定成功率 | `degraded` 奶在原 Session 恢复并重新完成验收的比例 | 建立基线后持续提升 |
| 停滞误判率 | 被标记 stalled 后证明存在有效运行或真实阻塞的比例 | 持续下降 |
| T 背压恢复率 | `overloaded` 后无需失败即可恢复派工的比例 | 建立基线后持续提升 |
| T 紧急战复成功率 | 奶凭紧急票据恢复原 Lead Session 并由 T 恢复派工的比例 | 建立基线后持续提升 |

### 19.2 护栏指标

- 平均模型调用成本；
- 平均 Token 消耗；
- 平均返工轮次；
- 无效唤醒和无效 checkpoint 请求次数；
- 误判停滞与误判死亡次数；
- T 平均待决策事件延迟和 throttled 时长；
- 战复后重复工作的比例；
- 用户主动取消率；
- 权限校验失败率。

---

## 20. MVP 范围与版本规划

### 阶段 0：Prompt 原型验证

**目标：**验证固定角色和独立验收是否真实提高复杂任务完成率。

**范围：**

- 基于现有 Agent Teams 手动创建 `dps-1/2/3/healer`；
- 共享任务板和消息机制；
- 通过 persona 约束角色；
- 人工执行任务划分和验收闭环；
- 收集并发收益、冲突和验收数据。

**退出条件：**

- 至少完成一组真实复杂任务对比；
- 验证 1～3 个 DPS 动态启用有效；
- 验证独立验收能发现单 Agent 自验未发现的问题；
- 明确正式插件所需底层接口缺口。

### 阶段 1：正式插件 MVP

**目标：**实现可靠、可恢复、带强制门禁的无 GUI 核心版本。

**P0 范围：**

- 固定逻辑槽位和自动组队；
- 角色身份与工具权限；
- 副本状态机；
- 结构化工作单、执行报告和验收报告；
- 验收完成门禁；
- 共享工作区范围冲突控制；
- readiness 与可审计 health signals；
- T 指令下的奶原 Session 自我稳定；
- DPS checkpoint、任务 lease、停滞检测与安全重派；
- T 负载监控、自动背压和 commander checkpoint；
- T down/unavailable 后由奶直接执行的 resume-only 紧急战复；
- DPS 故障识别；
- T 授权、奶执行的有限 DPS 战复；
- 原地恢复和替身恢复；
- Session Log 持久化与冷恢复；
- 命令/模型工具状态查询。

**不包含：**

- Git Worktree 自动隔离；
- 奶或 T 的自动替身恢复；
- 高度游戏化 GUI；
- 跨机器分布式 Agent。

### 阶段 2：GUI 面板

**目标：**让用户可视化观察和控制副本。

**范围：**

- 五人队伍生命状态、readiness 与可解释血线；
- T 的 commanderLoad、背压和恢复状态；
- 任务 DAG、lease、checkpoint 和进度状态；
- 验收报告与 findings；
- 战复状态和历史；
- 中断、重派、返工、重新验收和取消操作。

**退出条件：**

- 面板展示状态与 Session Log 重放结果一致；
- 关键事件能在界面中及时更新且无需唤醒空闲 Agent；
- 所有控制操作执行角色、状态和二次确认校验；
- 验收报告、战复历史和错误原因可展开审计；
- 核心状态不只依赖颜色表达，并可使用键盘完成主要操作。

### 阶段 3：高级协作

**候选范围：**

- Git Worktree 隔离与自动集成；
- 更细粒度的动态角色和队伍模板；
- 成本/速度/质量策略预设；
- T 或奶的人工接管和恢复流程；
- 历史副本复盘和质量趋势；
- 多仓库或远程工作区支持。

---

## 21. MVP 验收清单

### 21.1 正常完成

- [ ] 能从五人本预设创建副本；
- [ ] T 能创建任务 DAG 并分配给 1～3 个 DPS；
- [ ] DPS 只能操作分配给自己的工作单；
- [ ] 三个 DPS 可在互不冲突范围内并行执行；
- [ ] 重叠 `writeScopes` 的并行分配被拒绝；`telemetry` 模式能阻止单 Agent 越界，`aggregate` 模式能阻止活动范围并集之外的修改，严格模式在无遥测时自动串行；
- [ ] 奶能获取版本化验收清单并通过 `criterionId` 逐项提交报告；
- [ ] 遗漏任一必需标准、重复标准或无理由 N/A 的 `pass` 报告被拒绝；
- [ ] 未验收时 `party_finish` 被拒绝；
- [ ] 当前工作区验收通过后可完成；
- [ ] 验收后、完成前出现工作区变化时，完成被拒绝且报告变为 `stale`；
- [ ] 完成结果包含任务摘要、修改内容、验证证据和已知风险。

### 21.2 返工

- [ ] 奶提交 `fail` 后不能直接修改代码；
- [ ] T 能将 findings 映射并重新打开任务；
- [ ] 返工修改会使旧验收报告失效；
- [ ] 新版本必须重新验收；
- [ ] 超过返工上限后副本失败。

### 21.3 战复

- [ ] 单次 Turn 错误优先重试，不立即判定死亡；
- [ ] 业务阻塞不会消耗战复次数；
- [ ] DPS 连续超时后可标记 `down`；
- [ ] 未经 T 授权，奶不能战复 DPS；T down/unavailable 的紧急指挥战复是唯一例外；
- [ ] T 创建的战复指令只能消费一次；
- [ ] 可成功原地恢复可用 Session；
- [ ] 原 Session 不可恢复时可创建下一代替代 Agent；
- [ ] 替代 Agent 能获得恢复包并识别已有 diff；
- [ ] 战复次数和最大代数限制生效；
- [ ] 战复失败不会丢失已有工作区修改。

### 21.4 运行健康与承压

- [ ] UI 血线可追溯到客观 health signals，不使用未知指标伪造分数；
- [ ] 奶 `degraded` 后只有 T 能指示自我稳定；
- [ ] 自我稳定在原 Session 内执行，不消耗战复、不创建替身；
- [ ] 自我稳定开始后，旧 validation attempt 无法提交 `pass`；
- [ ] 无进度但存在活跃长任务或有效 blocked 证据的 DPS 不会被判定 stalled；
- [ ] 连续缺失 checkpoint 的 DPS 会按配置进入 suspected-stalled/stalled；
- [ ] stalled 任务重派前旧 lease 已撤销，任一时刻只有一个有效 owner lease；
- [ ] `party_interrupt` 记录 requested/completed/failed；中断后的旧 Turn 报告被拒绝，竞态写入进入隔离；
- [ ] 中断未确认成功或 Turn 未自然结束前，任务不能重派；
- [ ] 停滞不会直接触发战复或扣除战复次数；
- [ ] T overloaded 时停止新派工并持久化 commander checkpoint；
- [ ] T down/unavailable 时服务只签发一次有效紧急指挥战复票据；
- [ ] 未消费票据过期后进入 `expired` 并释放预留；已消费票据重放不会再次扣留或启动第二个 attempt；
- [ ] 奶无需 T 授权即可直接消费票据战复 T，DPS 和其他 Session 无法消费；
- [ ] 紧急战复只能恢复原 Lead Session，不能创建替代 T 或让奶/DPS/服务接管指挥；
- [ ] 战复失败时保持 paused，不能继续完成副本；
- [ ] T 恢复后可从 checkpoint 复核工作区并逐步恢复派工。

### 21.5 恢复与一致性

- [ ] 插件重启后可重建队伍、任务和阶段；
- [ ] 可恢复槽位当前 Session 和 generation；
- [ ] 不会重复扣除战复次数；
- [ ] 不会重复创建同一任务或成员；
- [ ] 旧工作区指纹的验收报告不能通过完成门禁。

### 21.6 权限

- [ ] DPS 无法调用 `party_finish`；
- [ ] 奶无法提交执行报告；
- [ ] T 无法伪造奶的 `pass` 报告；
- [ ] 任意 Agent 自报角色都不能绕过服务端身份校验；
- [ ] 奶无法在没有 T 有效指令时调用 `member_self_maintain`；
- [ ] DPS 无法自行续租、重派任务或把停滞标记清除；
- [ ] T unavailable 时服务只能冻结、保存 checkpoint 和签发紧急战复票据，不能代替 T 作任务决策；
- [ ] 非当前副本成员不能操作副本。

---

## 22. 风险与应对

| 风险 | 影响 | 应对方案 |
|---|---|---|
| 多 Agent 成本高于收益 | 简单任务变慢、Token 增加 | 动态启用 DPS；提供任务复杂度提示；记录成本指标 |
| 共享工作区文件冲突 | 覆盖修改、验收失真 | 写入范围规划、冲突检查、全局命令单一归属、后续 Worktree |
| 无 Session 写入遥测时无法精确归因 | Aggregate 模式不能证明某个 DPS 是否写入他人合法范围 | 明示保证边界；严格模式自动串行；后续接入宿主遥测或路径沙箱 |
| 奶与 DPS 上下文过度相似 | 验收失去独立性 | fresh 上下文、只提供目标和证据、不共享结论性推理 |
| 奶自我稳定后沿用旧验收结论 | 未重新检查即错误通过 | 强制作废在途 attempt；新 `validationId` 重新验收 |
| DPS 停滞误判 | 误中断长任务或真实阻塞 | 多信号观察窗；登记长任务；先请求 checkpoint 再处置 |
| checkpoint 过于频繁 | 干扰执行并增加 Token 成本 | 配置间隔；仅 running lease 触发；证据增量摘要化 |
| T 事件积压 | 错误调度、冲突或上下文失控 | 自动背压、commander checkpoint、逐步恢复派工 |
| T 被误判死亡或紧急票据被滥用 | 无授权恢复、次数错误或指挥状态混乱 | 服务客观确认、一次性票据、专用次数、调用者绑定与幂等结算 |
| T 复活后直接恢复派工 | 忽略停机期间输出和 lease 变化 | 保持 recovering；强制复核 commander checkpoint 与隔离变更 |
| Agent 死亡误判 | 浪费战复、丢失上下文 | 区分 idle、单次错误、业务阻塞和不可恢复故障 |
| 替身 Agent 重复工作 | 时间和成本浪费 | 结构化恢复包；强制先检查 diff 和报告 |
| 验收报告被旧版本复用 | 错误完成 | 任务集版本 + 工作区指纹 + 修改后自动 stale |
| experimental API 变化 | 插件维护成本高 | 增加适配层；避免直接依赖内部数据结构；推动稳定接口 |
| 状态事件部分写入 | 槽位和任务不一致 | 幂等事件、原子更新或补偿、启动时一致性检查 |
| 游戏术语影响可维护性 | 底层模型难理解 | UI 使用游戏术语，代码和协议使用工程领域名 |

---

## 23. 依赖与技术边界

### 23.1 依赖能力

插件预期复用 DSH 的以下能力：

- Agent Teams 或等效团队服务；
- continuable 子 Agent；
- 任务 DAG 或持久任务能力；
- Agent 间消息/邮箱；
- Session Log 与冷恢复；
- persona 和 tool filter；
- 工作区文件沙箱；
- Web 插件扩展点（P1）。

### 23.2 推荐包结构

首版可采用单包多入口：

```text
dsh-dungeon-party/
├── src/
│   ├── service/       # ctx.dungeonParty、状态机、权限和持久化
│   ├── tools/         # 按角色暴露的模型工具
│   ├── preset/        # 五人本模式 Agent Preset
│   ├── adapters/      # Agent Teams 等实验性接口适配层
│   └── web/           # P1 GUI 插件
├── tests/
└── docs/
```

如后续需要拆包，可拆为：

- 核心服务：`dsh-dungeon-party`；
- 模型工具：`dsh-tool-dungeon-party`；
- Web 面板：`dsh-web-dungeon-party`。

### 23.3 关键边界

- `DungeonService` 负责编排，不负责模型推理实现；
- Agent Teams 负责成员和通信，Dungeon 层负责角色语义和门禁；
- DSH 沙箱负责文件安全，Dungeon 层负责工作范围和协作冲突；
- 奶负责验收判断，服务负责验证报告是否有权、有效且对应当前版本；
- readiness 和 progressState 由服务根据可审计信号计算，游戏化血条仅负责展示；
- 服务可自动限流和冻结；T down 时可签发紧急战复票据，但不能替代 T 选择、拆分或重派任务；
- 奶的自我稳定只恢复原 Session 能力，不属于战复，也不改变其独立验收边界；
- 奶直接战复 T 只恢复原 Lead Session，不授予奶任何指挥权；
- DPS 战复由 T 决策、奶施法、服务恢复或替换；T 战复由服务签发紧急票据、奶直接施法、服务仅恢复原 Lead Session。

---

## 24. 待确认产品决策

以下事项不阻塞核心架构，但应在 MVP 开发前确定默认值：

1. 是否确认采用“战复失败默认消耗次数”的建议配置；
2. 是否确认采用 `allowMinorFindingsOnPass: true` 的建议配置；
3. 是否确认默认开启计划审核，还是仅对复杂任务开启；
4. DPS 子 Agent 是组队时全部创建，还是首次分配时延迟创建；
5. 工作区指纹首版采用 Git diff 哈希还是 DSH 原生工作区版本能力；
6. T、DPS、奶的默认模型和用户可配置范围；
7. T 紧急战复失败或奶自身故障时，首版默认等待人工恢复多久后进入 `FAILED`；
8. 成员超时阈值是按模型 Turn、任务总时长还是两者结合；
9. GUI 是嵌入会话右侧面板，还是作为独立插件页面；
10. Agent Teams experimental API 缺少角色级 persona/toolFilter 时，采用包装还是先扩展底层稳定接口；
11. DSH 首版能提供哪些按 Session 的 context、budget、工具和文件活动遥测；
12. readiness、checkpoint、停滞和 commanderLoad 的建议阈值是否需要按模型或任务类型配置；
13. 是否确认默认开启 `autoThrottleOnCommanderOverload`。

---

## 25. 最终产品原则

1. **固定的是角色和协议，不是必须满载的并发数。**
2. **T 负责决策，DPS 负责实现，奶负责独立验收。**
3. **所有关键约束由服务层强制，Prompt 只负责帮助模型正确行动。**
4. **验收针对明确的任务版本和工作区版本，任何后续修改都会使其失效。**
5. **逻辑槽位与真实 Agent Session 分离，确保故障后可以重绑和恢复。**
6. **DPS 战复必须经过“T 授权、奶施法、服务执行”的权限链。**
7. **T 挂掉是唯一紧急例外：服务签发票据，奶无需 T 授权直接战复。**
8. **共享工作区先通过范围规划控制风险，复杂隔离留给后续版本。**
9. **奶可以在 T 指令下自我稳定，但不能自我战复或复用旧验收结论。**
10. **“划水”必须由 lease、checkpoint 和证据等客观信号判定，不能凭感觉惩罚 Agent。**
11. **T 扛不住时先背压；T 挂掉后由奶直接战复原 Lead Session。**
12. **战复 T 只恢复原指挥，奶、DPS 和服务都不能越权接管。**
13. **游戏化用于增强理解和体验，底层数据模型保持通用、严谨和可维护。**
