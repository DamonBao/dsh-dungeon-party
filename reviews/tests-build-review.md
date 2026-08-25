> **状态（2026-08-24 标注）**：本报告基于更早代码快照，行号与部分结论已失效；请以 `reviews/full-stack-review-2026-08-24.md` 为准。其中的 P0/P1 项已在后续修复中落地并补充回归测试。

# 测试套件与构建打包评审报告（tests + build + preset）

> **评审范围**：tests/ 下 14 个测试文件、tsconfig.json、tsconfig.build.json、tsdown.config.ts、package.json、preset/dungeon-party/*、cordis.patch.yml、README.md  
> **对照文档**：docs/dsh-dungeon-party-prd.md（2001 行）  
> **评审日期**：2026-08-21  
> **评审人**：Pyra the Flameblade（DPS-1）  
> **状态**：只读评审，未修改 src/、tests/、配置或 preset 下任何文件

---

## 1. 逐文件覆盖声明

| 文件 | 已读行数范围 | 说明 |
|---|---|---|
| `tests/dungeon-service.test.ts` | 1–483（全文） | 核心服务基础流程测试 |
| `tests/interrupt-and-reassign.test.ts` | 1–100（全文） | 中断与重派测试 |
| `tests/repair-and-config.test.ts` | 1–176（全文） | 返工与配置测试 |
| `tests/resurrection.test.ts` | 1–165（全文） | 战复测试 |
| `tests/health-and-control.test.ts` | 1–254（全文） | 健康信号与背压测试 |
| `tests/watchdog.test.ts` | 1–207（全文） | 看门狗测试 |
| `tests/workspace-fingerprint.test.ts` | 1–44（全文） | 工作区指纹测试 |
| `tests/cordis-plugin.test.ts` | 1–70（全文） | Cordis 插件测试 |
| `tests/session-event-store.test.ts` | 1–47（全文） | Session 事件存储测试 |
| `tests/client-bundle.test.ts` | 1–26（全文） | 客户端打包测试 |
| `tests/preset-sync.test.ts` | 1–44（全文） | 预设同步测试 |
| `tests/agent-manager.test.ts` | 1–407（全文） | Agent 管理器测试 |
| `tests/dsh-tools.test.ts` | 1–253（全文） | DSH 工具测试 |
| `tests/preset.test.ts` | 1–64（全文） | 预设结构测试 |
| `package.json` | 1–113（全文） | 包配置与依赖 |
| `tsconfig.json` | 1–17（全文） | TypeScript 配置 |
| `tsconfig.build.json` | 1–10（全文） | 构建用 TS 配置 |
| `tsdown.config.ts` | 1–35（全文） | 客户端打包配置 |
| `preset/dungeon-party/preset.yml` | 1–3（全文） | 预设元数据 |
| `preset/dungeon-party/agent.cordis.yml` | 1–90（全文） | Agent 预设组合 |
| `cordis.patch.yml` | 1–8（全文） | Cordis 补丁 |
| `README.md` | 1–46（全文） | 项目说明 |
| `lib/client.js` | 1–5（头部） | 构建产物（确认 banner） |
| `lib/index.js` | 1–9（全文） | 运行时入口 |
| `lib/types/index.d.ts` | 1–9（全文） | 类型定义入口 |

---

## 2. 发现汇总（按严重级别排序）

### 🔴 P0-001：测试未覆盖事件序列号并发竞态（P0-001 来自 service-core 评审）

- **位置**：`tests/` 全部 14 个文件
- **问题**：`dungeon-service.test.ts` 及所有测试均使用单线程同步事件存储（内存数组 + `structuredClone`），没有任何测试模拟两个 DPS 同时 `submitCheckpoint` 或 `submitExecution` 的场景。P0-001 发现的并发 sequence 竞态完全没有测试覆盖。
- **影响**：核心正确性风险缺乏自动化验证。
- **建议**：增加并发测试，使用 `Promise.all` 同时触发多个 DPS 的 checkpoint/execution 提交，验证 sequence 单调性和幂等性。

---

### 🔴 P0-002：`client-bundle.test.ts` 依赖预构建产物 `lib/client.js`（正确性）

- **位置**：`tests/client-bundle.test.ts:22–25`
- **代码**：
  ```ts
  const bundle = await readFile(new URL('lib/client.js', root), 'utf8')
  expect(bundle).toContain('window.__ModuleLoader__.load')
  expect(bundle).toContain('id: "dsh-dungeon-party"')
  ```
- **问题**：该测试直接读取 `lib/client.js`，若构建产物未生成或过期，测试会失败。CI 中若先 `npm test` 后 `npm run build`，此测试必然失败。
- **影响**：测试顺序敏感，可能导致 CI 不稳定。
- **建议**：在 `package.json` 的 `test` 脚本前增加 `npm run build` 前置步骤，或在测试中使用 `skipIf` 检测产物存在性。

---

### 🟠 P1-001：测试覆盖缺口——无冷恢复（recoverRun）直接测试（可维护性）

- **位置**：`tests/` 全部
- **问题**：`DungeonService` 构造函数会自动调用 `recoverRun`（第 586 行），但没有测试直接验证：
  1. 事件日志损坏时的恢复行为；
  2. 多个 run 同时恢复的正确性；
  3. 恢复后状态与原始状态的一致性比对。
- **影响**：PRD §21.5 要求"插件重启后重建队伍、任务和阶段"，但核心恢复路径缺乏直接测试。
- **建议**：增加 `recover-run.test.ts`，测试：序列断裂、schemaVersion 不匹配、多 run 恢复、状态一致性。

---

### 🟠 P1-002：测试覆盖缺口——无 `finishRun` 两阶段提交测试（正确性）

- **位置**：`tests/dungeon-service.test.ts:409–426`
- **代码**：现有测试直接调用 `finishRun` 并期望 `phase === 'COMPLETED'`。
- **问题**：PRD §14.1 要求两阶段提交（prepared → 二次校验 → completed/aborted），但代码中直接写入 `run-completed`，测试也未验证两阶段行为。
- **影响**：完成门禁的防竞态机制无测试保障。
- **建议**：增加测试验证：prepared 事件写入、指纹变化后的 aborted、两次指纹一致后的 completed。

---

### 🟠 P1-003：`tsdown.config.ts` 中 `format: 'cjs'` 与 `package.json` 的 `"type": "module"` 冲突（构建正确性）

- **位置**：`tsdown.config.ts:21`
- **代码**：`format: 'cjs'`
- **问题**：`package.json` 声明 `"type": "module"`，但客户端 bundle 输出为 CJS 格式（`format: 'cjs'`）。虽然客户端 bundle 通过 `window.__ModuleLoader__.load` 加载，但 CJS 格式在 ESM 环境下可能引发解析问题。
- **影响**：若宿主尝试以 ESM 方式加载 client bundle，可能失败。
- **建议**：确认 `format: 'cjs'` 是否为宿主 `__ModuleLoader__` 的要求。若是，添加注释说明；否则改为 `format: 'esm'`。

---

### 🟠 P1-004：`package.json` 的 `main` 和 `types` 指向 `./lib/preset-sync.js`，但 `exports["."]` 也指向同一文件（可维护性）

- **位置**：`package.json:6–12`
- **代码**：
  ```json
  "main": "./lib/preset-sync.js",
  "types": "./lib/types/preset-sync.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/preset-sync.d.ts",
      "default": "./lib/preset-sync.js"
    }
  }
  ```
- **问题**：`main` 和 `exports["."]` 指向同一文件，但现代 Node.js 优先使用 `exports`，`main` 仅在旧版本中使用。若两者不一致会导致混淆。
- **影响**：低，但增加维护负担。
- **建议**：移除 `main` 和 `types` 字段，仅保留 `exports`（Node.js 12.7+ 支持）。

---

### 🟠 P1-005：`tsconfig.json` 的 `include` 包含 `tests/**/*.ts`，但 `tsconfig.build.json` 未完全排除测试（构建正确性）

- **位置**：`tsconfig.json:16`, `tsconfig.build.json:8`
- **代码**：
  ```json
  // tsconfig.json
  "include": ["src/**/*.ts", "client/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"]
  // tsconfig.build.json
  "include": ["src/**/*.ts"],
  "exclude": ["tests/**/*.ts"]
  ```
- **问题**：`tsconfig.build.json` 的 `include` 仅包含 `src/**/*.ts`，但 `exclude` 又排除了 `tests/**/*.ts`。虽然实际效果正确（不编译测试），但 `exclude` 在 `include` 范围内才生效，此配置冗余且易混淆。
- **影响**：低，但配置不清晰。
- **建议**：移除 `tsconfig.build.json` 中的 `exclude`，因为 `include` 已限定为 `src/**/*.ts`。

---

### 🟡 P2-001：`agent.cordis.yml` 中 `tool-bash` 的 `timeoutMs: 300000` 与 PRD 默认值不一致（规范）

- **位置**：`preset/dungeon-party/agent.cordis.yml:72–73`
- **代码**：`timeoutMs: 300000`
- **问题**：PRD §17 中 `memberTurnTimeoutMs` 默认值为 `300000`，但代码中 `taskLeaseDurationMs` 为 `600000`。`tool-bash` 的 timeout 与 lease 时长不匹配，可能导致命令超时但 lease 仍未过期。
- **影响**：DPS 执行长命令时，命令超时后 lease 仍有效，可能产生竞态。
- **建议**：将 `tool-bash` 的 `timeoutMs` 与 `taskLeaseDurationMs` 关联，或至少确保 `timeoutMs < taskLeaseDurationMs`。

---

### 🟡 P2-002：测试脆弱性——`dsh-tools.test.ts` 的 `keep status bounded` 测试依赖硬编码长度阈值（可维护性）

- **位置**：`tests/dsh-tools.test.ts:201–222`
- **代码**：
  ```ts
  expect(JSON.stringify(statusResult).length).toBeLessThan(12_000)
  expect(JSON.stringify(waitResult).length).toBeLessThan(16_000)
  expect(waitResult.events).toHaveLength(24)
  ```
- **问题**：测试使用硬编码的 JSON 长度阈值（12000、16000）和事件数量（24）。若未来增加字段或调整截断逻辑，这些阈值会失效。
- **影响**：测试脆弱，易因无关变更失败。
- **建议**：改为验证相对条件（如 `omittedEventCount > 0`）或比例（如 `events.length < totalMessages * 0.3`），而非绝对阈值。

---

### 🟡 P2-003：`preset/dungeon-party/agent.cordis.yml` 缺少 `dsh-dungeon-party/client` 的 Web 入口声明（规范）

- **位置**：`preset/dungeon-party/agent.cordis.yml` 全文
- **问题**：`package.json` 中声明了 `./client` 导出，但 `agent.cordis.yml` 中未配置客户端 Web 入口（如 `dsh-dungeon-party/client` 的加载）。`cordis.patch.yml` 仅同步预设，不处理客户端 bundle。
- **影响**：客户端 bundle 可能无法被 DSH Web 正确发现和加载。
- **建议**：确认 rc8 的客户端发现机制是否依赖 `package.json` 的 `dsh.client` 字段。若是，当前配置已足够；否则需在 `agent.cordis.yml` 中增加客户端入口。

---

### 🟡 P2-004：`README.md` 的构建命令顺序可能导致 `client-bundle.test.ts` 失败（可维护性）

- **位置**：`README.md:40–44`
- **代码**：
  ```bash
  npm test
  npm run typecheck
  npm run build
  ```
- **问题**：`npm test` 在 `npm run build` 之前执行，但 `client-bundle.test.ts` 依赖 `lib/client.js` 存在。
- **影响**：新用户按 README 顺序执行会导致测试失败。
- **建议**：调整为 `npm run build → npm run typecheck → npm test`。

---

### 🟢 P3-001：`package.json` 的 `engines.node` 要求 `>=22`，但部分依赖可能不支持 Node 22（规范）

- **位置**：`package.json:91–93`
- **代码**：`"node": ">=22"`
- **问题**：Node 22 较新，部分 DSH 生态依赖可能未完全适配。
- **影响**：潜在兼容性问题。
- **建议**：在 CI 中测试 Node 20 和 22，或放宽为 `>=20`。

---

### 🟢 P3-002：`lib/` 构建产物缺少 `.d.ts.map` 和 sourcemap（可维护性）

- **位置**：`lib/` 目录
- **问题**：`tsconfig.build.json` 未启用 `declarationMap`，且 `tsdown.config.ts` 的 `sourcemap: true` 仅生成 `.js.map`，无 `.d.ts.map`。
- **影响**：调试时无法从类型定义跳转到源码。
- **建议**：在 `tsconfig.build.json` 中增加 `"declarationMap": true`。

---

### 🟢 P3-003：`tests/session-event-store.test.ts` 的 `payload` 中 `undefined` 值被静默删除（健壮性）

- **位置**：`tests/session-event-store.test.ts:29`, `41–43`
- **代码**：
  ```ts
  payload: { objective: 'Build', optionalModelField: undefined }
  // ...
  expect(recreated.load('run-1')).toEqual([{
    ...event,
    payload: { objective: 'Build' },  // undefined 被删除
  }])
  ```
- **问题**：测试显式验证了 `undefined` 值被删除的行为，但这与 P2-001（`JSON.stringify` 重复检测问题）相关。若未来修复该问题，此测试需要同步更新。
- **影响**：测试与实现行为耦合过紧。
- **建议**：在测试中注释说明此行为是已知限制，而非预期特性。

---

## 3. PRD 验收标准覆盖缺口盘点

| PRD 验收项 | 测试覆盖 | 说明 |
|---|---|---|
| **§21.1 正常完成**：能从预设创建副本 | ⚠️ 间接 | `cordis-plugin.test.ts` 测试插件注册，但未测试预设选择器 |
| **§21.1**：T 创建任务 DAG 并分配 | ✅ | `dsh-tools.test.ts` 测试 `party_assign` |
| **§21.1**：DPS 只能操作分配的工作单 | ✅ | `agent-manager.test.ts` 测试 Scope Guard |
| **§21.1**：并行执行不冲突 | ✅ | `dungeon-service.test.ts` 测试串行/并发门禁 |
| **§21.1**：重叠 writeScopes 被拒绝 | ✅ | `dungeon-service.test.ts` 测试冲突检测 |
| **§21.1**：telemetry 模式阻止越界 | ❌ 缺失 | 无 Session 级写入遥测测试 |
| **§21.1**：aggregate 模式阻止并集外修改 | ⚠️ 部分 | `agent-manager.test.ts` 测试 `auditWorkspaceBeforeSubmit` |
| **§21.1**：奶逐项提交报告 | ✅ | `dungeon-service.test.ts` 测试验证提交 |
| **§21.1**：遗漏必需标准被拒绝 | ✅ | `dungeon-service.test.ts` 测试不完整验证 |
| **§21.1**：未验收时 finish 被拒绝 | ✅ | `dungeon-service.test.ts` 测试 |
| **§21.1**：验收后工作区变化使报告失效 | ✅ | `repair-and-config.test.ts` 测试指纹变化 |
| **§21.2 返工**：奶不直接修改代码 | ✅ | 角色权限测试覆盖 |
| **§21.2**：T 映射 findings 并重新打开 | ✅ | `repair-and-config.test.ts` 测试 |
| **§21.2**：返工修改使旧报告失效 | ✅ | `repair-and-config.test.ts` 测试 |
| **§21.2**：超过上限后失败 | ✅ | `repair-and-config.test.ts` 测试 |
| **§21.3 战复**：单次错误优先重试 | ⚠️ 间接 | `health-and-control.test.ts` 测试 TurnEnd 信号 |
| **§21.3**：业务阻塞不消耗战复 | ❌ 缺失 | 无直接测试 |
| **§21.3**：DPS 连续超时后标记 down | ✅ | `health-and-control.test.ts` 测试 |
| **§21.3**：未经 T 授权奶不能战复 | ✅ | `resurrection.test.ts` 测试权限 |
| **§21.3**：T down 紧急战复 | ✅ | `resurrection.test.ts` 测试 |
| **§21.3**：战复指令只能消费一次 | ✅ | `resurrection.test.ts` 测试 |
| **§21.3**：原地恢复可用 Session | ⚠️ 部分 | `agent-manager.test.ts` 测试 resume |
| **§21.3**：原 Session 不可恢复时创建替身 | ✅ | `resurrection.test.ts` 和 `agent-manager.test.ts` 测试 |
| **§21.3**：替代 Agent 获得恢复包 | ⚠️ 部分 | `agent-manager.test.ts` 测试消息包含恢复包 |
| **§21.3**：战复次数和代数限制 | ✅ | `resurrection.test.ts` 测试 |
| **§21.3**：战复失败不丢失工作区 | ❌ 缺失 | 无直接测试 |
| **§21.4 健康**：血线追溯到客观信号 | ✅ | `health-and-control.test.ts` 测试 |
| **§21.4**：奶 degraded 后只有 T 能指示稳定 | ✅ | `health-and-control.test.ts` 测试 |
| **§21.4**：自我稳定不消耗战复 | ✅ | `health-and-control.test.ts` 测试 |
| **§21.4**：旧 validation attempt 无法提交 pass | ❌ 缺失 | 无直接测试 |
| **§21.4**：无进度但有长任务不 stalled | ✅ | `health-and-control.test.ts` 测试 |
| **§21.4**：连续缺失 checkpoint 进入 stalled | ✅ | `health-and-control.test.ts` 和 `watchdog.test.ts` 测试 |
| **§21.4**：stalled 重派前旧 lease 撤销 | ✅ | `interrupt-and-reassign.test.ts` 测试 |
| **§21.4**：party_interrupt 记录 requested/completed/failed | ✅ | `interrupt-and-reassign.test.ts` 测试 |
| **§21.4**：中断未确认前不能重派 | ✅ | `interrupt-and-reassign.test.ts` 测试 |
| **§21.4**：停滞不触发战复 | ❌ 缺失 | 无直接测试 |
| **§21.4**：T overloaded 停止新派工 | ✅ | `health-and-control.test.ts` 测试 |
| **§21.4**：T down 签发紧急票据 | ✅ | `resurrection.test.ts` 测试 |
| **§21.4**：未消费票据过期释放 | ✅ | `resurrection.test.ts` 测试 |
| **§21.4**：已消费票据重放不扣留 | ⚠️ 部分 | `resurrection.test.ts` 测试重复消费报错 |
| **§21.4**：奶直接消费票据战复 T | ✅ | `resurrection.test.ts` 测试 |
| **§21.4**：紧急战复只能恢复原厂 | ✅ | `resurrection.test.ts` 测试 |
| **§21.4**：战复失败保持 paused | ❌ 缺失 | 无直接测试 |
| **§21.4**：T 恢复后复核并恢复派工 | ⚠️ 部分 | `health-and-control.test.ts` 测试 `recoverRunAfterCommanderReturn` |
| **§21.5 恢复**：重启后重建 | ⚠️ 间接 | 构造函数自动恢复，但无直接测试 |
| **§21.5**：不重复扣除战复 | ⚠️ 部分 | `resurrection.test.ts` 测试幂等性 |
| **§21.5**：不重复创建任务/成员 | ⚠️ 部分 | `dungeon-service.test.ts` 测试幂等性 |
| **§21.5**：旧指纹报告不能通过门禁 | ✅ | `repair-and-config.test.ts` 测试 |

---

## 4. 构建与打包核查

### 4.1 exports/files 完整性

| 检查项 | 结果 | 说明 |
|---|---|---|
| `exports["."]` | ✅ | `./lib/preset-sync.js` + types |
| `exports["./runtime"]` | ✅ | `./lib/index.js` + types |
| `exports["./client"]` | ✅ | `./lib/client.js` + types |
| `exports["./preset-sync"]` | ✅ | `./lib/preset-sync.js` + types |
| `exports["./package.json"]` | ✅ | `./package.json` |
| `files` | ✅ | `lib/**`, `preset/**`, `cordis.patch.yml` |

**风险**：`files` 未包含 `README.md` 和 `docs/`，npm 发布时用户看不到文档。

### 4.2 dts 生成

| 检查项 | 结果 | 说明 |
|---|---|---|
| `declarationDir` | ✅ | `lib/types` |
| `.d.ts` 文件存在 | ✅ | `lib/types/*.d.ts` 共 11 个 |
| `.d.ts.map` | ❌ 缺失 | 无 sourcemap for types |

### 4.3 sourcemap

| 检查项 | 结果 | 说明 |
|---|---|---|
| `tsdown.config.ts:24` | ✅ | `sourcemap: true` |
| `lib/client.js.map` | ✅ | 存在 |
| `lib/*.js.map` | ❌ 缺失 | 仅 client bundle 有 map |

### 4.4 client bundle banner/footer

| 检查项 | 结果 | 说明 |
|---|---|---|
| banner | ✅ | `window.__ModuleLoader__.load(...)` |
| footer | ✅ | `return module.exports; } });` |
| intro | ✅ | `var module = { exports: {} };` |
| 平台兼容 | ⚠️ 待验证 | `format: 'cjs'` 在 ESM 环境下的行为 |

### 4.5 preset YAML 与 cordis.patch 一致性

| 检查项 | 结果 | 说明 |
|---|---|---|
| `preset.yml` 元数据 | ✅ | `name: 五人本模式`, `order: 50` |
| `agent.cordis.yml` 服务挂载 | ✅ | `dsh-dungeon-party/runtime` |
| `cordis.patch.yml` 同步 | ✅ | `name: dsh-dungeon-party` |
| 一致性 | ✅ | patch 指向根包，预设指向 runtime，符合设计 |

---

## 5. Top 5 改进项（按优先级排序）

### 1. [P0] 增加并发 sequence 竞态测试
**优先级：P0 | 分类：正确性**
- 模拟两个 DPS 同时提交 checkpoint/execution，验证 sequence 单调性和幂等性。
- 覆盖 P0-001 的核心风险。

### 2. [P0] 修复 `client-bundle.test.ts` 的构建产物依赖
**优先级：P0 | 分类：正确性**
- 调整测试顺序或增加 `skipIf` 检测，确保 CI 稳定性。

### 3. [P1] 增加冷恢复（recoverRun）直接测试
**优先级：P1 | 分类：正确性**
- 测试序列断裂、schemaVersion 不匹配、多 run 恢复、状态一致性。
- 覆盖 PRD §21.5 的核心要求。

### 4. [P1] 增加 `finishRun` 两阶段提交测试（待代码修复后）
**优先级：P1 | 分类：正确性**
- 验证 prepared → aborted/completed 的完整流程。
- 与 P1-004（service-core）联动。

### 5. [P1] 澄清 `tsdown.config.ts` 的 `format: 'cjs'` 与 ESM 的兼容性
**优先级：P1 | 分类：构建正确性**
- 确认宿主 `__ModuleLoader__` 的加载要求，添加注释或调整格式。

---

## 6. 结论

测试套件整体质量良好，核心路径（创建、分配、执行、验收、战复、中断、健康信号）均有覆盖。但存在 **2 个 P0 级缺口**（并发竞态无测试、client-bundle 测试依赖构建顺序）和 **3 个 P1 级缺口**（冷恢复、两阶段完成、telemetry 模式）。构建配置基本正确，但 `format: 'cjs'` 的兼容性需确认，类型 sourcemap 缺失。

**总体评估**：测试覆盖核心流程，关键边缘场景和并发路径需补充。
