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
- 可选 Web 客户端副本浮层，通过 Lead Session 的 `dungeon-party` whole-value projection 展示阶段、队伍、任务、验收与战复摘要。

运行测试：

```bash
npm test
npm run typecheck
npm run build
```

完整需求见 [`docs/dsh-dungeon-party-prd.md`](docs/dsh-dungeon-party-prd.md)。后续切片继续实现 Session 级逐写遥测、跨实例原子事件追加/崩溃注入补偿，以及 P1 Web 面板的确认式控制操作、DAG 与时间线增强。
