# dsh-dungeon-party

DSH「五人本模式」插件，按固定的 1T、3DPS、1 奶逻辑队伍编排复杂任务。

## 当前开发阶段

当前已完成首批 TDD 核心切片：

- 五个稳定逻辑槽位与 Tank Session 绑定；
- 事件持久化信封、单调序列、DSH Lead Session Log 持久化与冷重放；
- 基于真实绑定 Session 的角色权限；
- 副本阶段迁移与进入执行前的 Healer 门禁；
- 结构化工作单、依赖、写入范围安全与冲突检查；
- DPS 分配、版本化 Lease、checkpoint、停滞检测与结构化执行报告；
- 可审计 health signals、Healer 自我稳定和 Commander 背压；
- DPS 有限战复、替身重绑和 T 的一次性紧急战复票据；
- 版本化验收清单、返工、报告失效与强制完成门禁；
- Cordis `ctx.dungeonParty` 服务、24 个模型工具、运行时配置 Schema 和 `dungeon-party` 预设包；
- 基于 `AgentRegistry.create({ setup })` 的 Healer 预激活、DPS 延迟创建、角色 persona/tool filter、结构化派工与子 Agent 回收；
- `telemetry` / `aggregate` / `serial` Scope 模式解析及严格模式写 Lease 串行门禁；
- 宿主计算的确定性 Workspace Fingerprint、Lease 基线/差分快照、文件工具写入前 Scope Guard、事件游标长轮询、结构化队内消息和主动 Checkpoint 请求；
- Lease 过期与并发 DPS 门禁、全局命令单一归属、运行时 Turn/Agent 故障信号和自动战复通知；
- DSH 0.1.1-rc.1 ModuleLoader 客户端 bundle 与 WoW 风格「永夜堡垒」活动面板：职业化队伍框架、生命/活跃条、任务日志、依赖提示、战报时间线与确认式领队技能；
- 队伍成员采用 Aegis / Pyra / Nyx / Aster / Lumina 角色名与专属 Persona；
- 借鉴 Agent Teams 的事件驱动调度思路：进入执行阶段自动把 ready work 派给空闲 DPS，任务提交后再次 kick scheduler；仍保留本插件更严格的槽位、Lease、Scope、验收与战复门禁。

## 安装

```bash
dsh plugin --profile web add @jcy2387/dsh-dungeon-party
```

插件启动时会按 profile 机制将内置 `dungeon-party` 预设同步到
`$DSH_HOME/.agent-presets/dungeon-party`。安装或升级后重启 DSH Web，
然后在新建会话的预设选择器中选择「五人本模式」。

运行测试：

```bash
npm test
npm run typecheck
npm run build
```

## 单进程持久化契约

当前实现的持久化语义以「单个 DSH 进程」为边界，请勿跨实例并发驱动同一副本：

- 事件序号由服务进程内的计数器原子分配；派发互斥（同一任务同时至多一个有效写 lease）与 Session Log 追加校验（序号必须等于 `最后序号 + 1`）同样是进程内语义。
- 跨实例并发写同一 run 不会被自动串行化：后到的一方会以 `EVENT_SEQUENCE_CONFLICT`（重复幂等键则为 `EVENT_ID_CONFLICT`）被拒绝，需要人工介入修复后重放，而不是静默合并。
- `lib/` 构建产物直接入库，换取安装即用、免编译的确定性；代价是源码改动后若忘记重新构建，仓库中的产物会短暂过期。
- `npm publish` 由 `prepublishOnly` 脚本守卫：发布前强制执行 `typecheck → test → build`，任何一步失败都会中止发布，保证发布的 `lib/` 始终与源码同步。

完整需求见 [`docs/dsh-dungeon-party-prd.md`](docs/dsh-dungeon-party-prd.md)。后续切片继续实现 Session 级逐写遥测、跨实例原子事件追加/崩溃注入补偿、离线消息确认重试，以及更完整的 DAG 连线与历史回放。
