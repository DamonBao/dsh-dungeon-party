# DSH Dungeon Party

<p align="center">
  <strong>Turn complex engineering work into a disciplined five-agent dungeon run.</strong>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <strong>English</strong> ·
  <a href="https://github.com/DamonBao/dsh-dungeon-party/blob/main/docs/dsh-dungeon-party-prd.md">PRD</a>
</p>

<p align="center">
  <a href="https://github.com/DamonBao/dsh-dungeon-party/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/DamonBao/dsh-dungeon-party/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@jcy2387/dsh-dungeon-party"><img alt="npm" src="https://img.shields.io/npm/v/@jcy2387/dsh-dungeon-party"></a>
  <img alt="Node.js 22.5+" src="https://img.shields.io/badge/Node.js-22.5%2B-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
</p>

**DSH Dungeon Party** is a five-agent orchestration plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/DeepSeek-Harness). It maps complex work onto a fixed party—**1 Tank, 3 DPS, and 1 Healer**—and adds the controls needed to make parallel agents safe and auditable: work orders, leases, write scopes, checkpoints, health signals, validation gates, and recovery.

> The party can work concurrently, but expensive workspace computation does not fan out unchecked. Fingerprinting and audit scans run through a persistent Worker pool backed by an explicit FIFO queue.

## Why Dungeon Party?

Multi-agent execution is easy to start and hard to control. Without a protocol, agents can duplicate work, overwrite each other, validate stale state, or flood the host with concurrent scans and messages.

Dungeon Party provides a service-enforced coordination layer:

- **Stable roles** — one Commander/Tank, three execution slots, one independent Healer.
- **Structured delegation** — every task has an objective, dependencies, acceptance criteria, read scopes, and write scopes.
- **Lease-based execution** — only the bound DPS with a current lease may submit work.
- **Bounded concurrency** — DPS concurrency is capped; CPU-heavy workspace scans use a FIFO Worker pool.
- **Independent acceptance** — the Healer validates a versioned manifest and workspace fingerprint.
- **Durable recovery** — checkpoints, stalls, interrupts, quarantine review, battle resurrection, and Commander rescue are persisted as events.
- **Auditable tools** — all 27 model tools use explicit closed input/output schemas; there are no generic JSON tool schemas.

## Party Composition

| Slot | Character | Responsibility |
| --- | --- | --- |
| Tank | **Aegis** | Owns the objective, plans work, assigns tasks, resolves decisions, and accepts the final result. |
| DPS-1 | **Pyra** | Executes one leased work order inside its declared write scopes. |
| DPS-2 | **Nyx** | Executes an independent leased work order and reports evidence. |
| DPS-3 | **Aster** | Executes an independent leased work order and reports evidence. |
| Healer | **Lumina** | Independently verifies the workspace, handles maintenance, and coordinates recovery. |

Role visibility is not authorization. Every sensitive operation is checked against the actual bound DSH Session.

## How a Run Works

```text
FORMING → PLANNING → PLAN_REVIEW → EXECUTING → VALIDATING → COMPLETED
                                      │              │
                                      └── stalled ───┤
                                                     └→ REPAIR → VALIDATING
```

1. **Form the party** — bind the Commander and activate the Healer.
2. **Plan** — create structured work orders and declare dependencies and scopes.
3. **Review** — verify the plan before execution begins.
4. **Execute** — ready tasks are dispatched to available DPS slots; leases and checkpoints guard progress.
5. **Validate** — the Healer checks a versioned manifest against the current workspace fingerprint.
6. **Repair or finish** — findings produce bounded repair rounds; a two-phase completion gate prevents accepting a workspace that changed during finalization.

## Architecture

```text
┌──────────────────── DSH Session / Commander ────────────────────┐
│  27 structured tools                                             │
│        │                                                         │
│        ▼                                                         │
│  DungeonService ── event log ──► Session projection ──► Web UI   │
│        │                                                         │
│        ├── PartyAgentManager ──► DPS / Healer agent pool         │
│        │                         + per-run dispatch locks          │
│        │                                                         │
│        └── Workspace FIFO ─────► persistent Worker (pool size 1) │
│                                  fingerprint / audit snapshots    │
└──────────────────────────────────────────────────────────────────┘
```

### CPU and responsiveness safeguards

- Workspace traversal, file reads, and SHA-256 hashing run outside the host event loop.
- An explicit FIFO queue posts only one filesystem scan to the Worker at a time.
- Lease baselines and submit audits are serialized per run to preserve ordering.
- Common generated/cache directories, including `.npm-cache/**`, are excluded from fingerprints by default.
- Session projections are compacted per run instead of cloning and publishing every state transition.
- The Web overlay uses compositor-friendly animation and only serializes the raw projection when its developer panel is open.

## Installation

### DSH Web

```bash
dsh plugin --profile web add @jcy2387/dsh-dungeon-party
```

Stop the currently running Web process, then start the profile again:

```bash
dsh web
```

### DSH Desktop

```bash
dsh plugin --profile desktop add @jcy2387/dsh-dungeon-party
```

Fully quit and reopen DSH Desktop after installing or upgrading. Restarting alone is not enough when you have only rebuilt a local checkout—the profile loads its own installed package copy from `$DSH_HOME/profiles/<profile>/node_modules`.

### Activate the preset

On startup, the package synchronizes its bundled preset to:

```text
$DSH_HOME/.agent-presets/dungeon-party
```

Create a **new Session** and select **五人本模式** (Dungeon Party) from the preset picker.

## Upgrade from a Local Checkout

```bash
npm ci
npm run typecheck
npm test
npm run build
PACKAGE_TGZ="$(npm pack --pack-destination /tmp)"
```

Install the generated `.tgz` into every profile that should use it, then restart that profile. For example:

```bash
dsh plugin --profile web add --force "/tmp/$PACKAGE_TGZ"
dsh plugin --profile desktop add --force "/tmp/$PACKAGE_TGZ"
```

## Core Capabilities

### Work and scope safety

- Structured work orders with versioned acceptance criteria.
- Dependency-aware scheduling and priority ordering.
- `telemetry`, `aggregate`, and `serial` scope-enforcement modes.
- Host-observed lease baselines and workspace diffs.
- Pre-execution guards for `write`, `edit`, and `bash`.
- Single ownership for global commands.
- Disclosure requirements for modified test assertions.

### Progress and recovery

- Versioned leases with expiration and renewal.
- Periodic checkpoints and stalled-progress escalation.
- Exact-Turn interruption and changed-file quarantine.
- Limited DPS battle-resurrection charges and replacement Sessions.
- One-time Commander rescue tickets and checkpoint reconciliation.
- Health signals for timeouts, tool failures, queue pressure, context pressure, and stalled progress.

### Validation and persistence

- Event-sourced state with monotonic sequence checks and idempotency keys.
- DSH Session Log persistence, cold replay, and cadence-controlled UI projections.
- Versioned validation manifests and reports.
- Whitelisted Healer verification commands with bounded output capture.
- Workspace fingerprints tied to the accepted task-set version.
- Two-phase completion that aborts safely if the workspace changes.

## Configuration Highlights

| Option | Default | Purpose |
| --- | ---: | --- |
| `scopeEnforcementMode` | `auto` | Resolves to the safest available write-scope enforcement mode. |
| `maxConcurrentDps` | `3` | Maximum number of DPS slots that may hold active leases. |
| `taskLeaseDurationMs` | `600000` | Lifetime of a task lease. |
| `progressCheckpointIntervalMs` | `180000` | Expected checkpoint interval for running work. |
| `maxMissedCheckpoints` | `2` | Misses allowed before progress becomes stalled. |
| `maxRepairRounds` | `3` | Maximum repair rounds per task. |
| `battleResCharges` | `1` | DPS resurrection budget. |
| `commanderBattleResCharges` | `1` | Commander rescue budget. |
| `healerVerificationTimeoutMs` | `120000` | Timeout for an approved verification command. |
| `validationRequired` | `true` | Requires a current passing validation report before completion. |

Default fingerprint exclusions:

```text
.git/**
node_modules/**
.npm-cache/**
lib/**
dist/**
coverage/**
.dsh/dungeon-party/tmp/**
```

The runtime also supports an explicit `childRoute` (`provider` and `model`) for pinning child agents to a model route registered in DSH settings.

## Development

Requirements:

- Node.js 22 or newer
- A compatible DSH `0.1.2-rc.1` (or newer `0.1.x`) runtime

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The repository commits `lib/` so an installed package is ready to run without compiling. `prepublishOnly` enforces `typecheck → test → build` before publication.

Important source areas:

```text
src/service/dungeon-service.ts              event-sourced domain model
src/adapters/party-agent-manager.ts         agent lifecycle and dispatch
src/adapters/workspace-computation-queue.ts FIFO Worker pool
src/tools/register.ts                       model-facing tool behavior
src/tools/output-schemas.ts                 explicit tool output contracts
client/index.tsx                            Dungeon Party overlay
preset/dungeon-party/                       bundled agent preset
```

## CI/CD

The repository includes two GitHub Actions workflows:

- **CI** — runs on pushes to `main`, pull requests, and manual dispatch. It installs with `npm ci`, type-checks, tests, rebuilds the package, verifies that committed `lib/` artifacts are current, and uploads the packed `.tgz` as a workflow artifact.
- **Release** — runs when a GitHub Release is published. It requires a release tag matching `v<package.json version>`, repeats all quality gates, and publishes the package to npm with provenance via **OIDC trusted publishing** (no long-lived token secret).

To enable npm publishing, configure [trusted publishing](https://docs.npmjs.com/trusted-publishing) on npmjs.com for `@jcy2387/dsh-dungeon-party`, authorizing the `Release` workflow of this repository — no `NPM_TOKEN` secret is needed. A typical release is:

```bash
npm version patch --no-git-tag-version
npm run build
VERSION="$(node -p 'require("./package.json").version')"
git add package.json package-lock.json lib
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin main --tags
```

Then create and publish a GitHub Release for that tag. The workflow is idempotent: if the npm version is already published, the publish step is skipped. Release artifacts are no longer uploaded to the GitHub Release (npm with provenance is the single distribution channel).

Dependabot checks npm and GitHub Actions dependencies weekly.

## Operational Contract

The current persistence and dispatch contract is **single-process per run**:

- Do not drive the same run concurrently from multiple DSH processes.
- Event sequencing, dispatch locks, and lease serialization are process-local.
- Conflicting cross-process appends fail safely with `EVENT_SEQUENCE_CONFLICT` or `EVENT_ID_CONFLICT`; they are not silently merged.
- Upgrading fingerprint ignore rules can stale an in-flight validation report. Recreate the validation manifest after an upgrade if needed.

## Project Status

The core orchestration, persistence, recovery, validation, Web overlay, explicit tool contracts, and CPU queue are implemented and covered by automated tests. Planned work includes stronger cross-process append coordination, crash-injection compensation, offline message acknowledgement/retry, and richer DAG/history visualization.

For the complete behavioral specification, see [`docs/dsh-dungeon-party-prd.md`](https://github.com/DamonBao/dsh-dungeon-party/blob/main/docs/dsh-dungeon-party-prd.md).
