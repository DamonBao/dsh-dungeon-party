import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type {
  CommanderRescueTicket,
  DungeonRun,
  PartySlot,
  ResurrectionRequest,
  TaskRecord,
  ValidationFinding,
  ValidationReport,
} from '../src/service/dungeon-service.js'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'dungeon-party': DungeonRun | null
  }
}

const slots: PartySlot[] = ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer']

const partyIdentity: Record<PartySlot, {
  name: string
  title: string
  glyph: string
  role: string
  className: string
}> = {
  tank: { name: '守誓者 · Aegis', title: '秘境领队', glyph: '⚔', role: 'TANK', className: 'tank' },
  'dps-1': { name: '焰刃 · Pyra', title: '烈焰工程师', glyph: '🔥', role: 'DPS', className: 'dps1' },
  'dps-2': { name: '影行者 · Nyx', title: '暗影侦察者', glyph: '☾', role: 'DPS', className: 'dps2' },
  'dps-3': { name: '星术师 · Aster', title: '奥术构筑师', glyph: '✦', role: 'DPS', className: 'dps3' },
  healer: { name: '圣谕者 · Lumina', title: '圣光审判官', glyph: '✚', role: 'HEALER', className: 'healer' },
}

const phaseName: Record<string, string> = {
  FORMING: '集结队伍', PLANNING: '战前部署', PLAN_REVIEW: '作战复核', EXECUTING: '首领交战', VALIDATING: '战利品检定',
  REPAIR: '战地修整', COMPLETED: '秘境征服', FAILED: '团灭', CANCELLED: '撤离秘境',
}

const taskStatusName: Record<string, string> = {
  pending: '未解锁', ready: '可领取', running: '战斗中', completed: '已征服',
  blocked: '被阻挡', failed: '失败', 'scope-violation': '越界隔离',
}

const verdictName: Record<string, string> = { pass: '验收通过', fail: '验收失败', blocked: '验收受阻' }

type ValidationCheckStatus = 'pass' | 'fail' | 'blocked' | 'not-applicable'

const checkStatusOrder: ValidationCheckStatus[] = ['pass', 'fail', 'blocked', 'not-applicable']
const checkStatusName: Record<ValidationCheckStatus, string> = {
  pass: '通过', fail: '失败', blocked: '受阻', 'not-applicable': '不适用',
}

const severityLabel: Record<string, string> = { critical: '致命缺陷', major: '主要缺陷', minor: '次要缺陷' }

const resStatusName: Record<string, string> = {
  issued: '已签发', consumed: '复活进行中', completed: '已完成', failed: '已失败', expired: '已过期',
}

/** Every rule is scoped under the overlay root so host CSS cannot leak in or out. */
const styles = `
[data-dungeon-party-root]{--dp-gold:#d7aa52;--dp-gold-hi:#ffe4a0;--dp-ink:#07090d;--dp-panel:#10151d;--dp-line:#7c6235;--dp-muted:#9aa3b0;--dp-green:#55c96f;--dp-red:#d35050;--dp-blue:#4da6d9;--dp-purple:#9a74e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9edf3}
[data-dungeon-party-root] .dp-launcher{position:fixed;right:18px;top:16px;z-index:78;display:flex;align-items:center;gap:9px;min-height:40px;padding:5px 13px 5px 6px;border:1px solid #8b6a34;border-radius:22px;background:#111720;color:#f3ddb0;box-shadow:0 8px 28px #0009,inset 0 0 0 1px #d8ad4c22;cursor:move;touch-action:none;user-select:none;pointer-events:auto}
[data-dungeon-party-root] .dp-launcher:hover{border-color:#e2b85d;box-shadow:0 0 22px #d59b3855,0 10px 32px #000b}
[data-dungeon-party-root] .dp-launcher:focus-visible,[data-dungeon-party-root] .dp-button:focus-visible,[data-dungeon-party-root] .dp-tab:focus-visible,[data-dungeon-party-root] .dp-close:focus-visible,[data-dungeon-party-root] .dp-resize:focus-visible,[data-dungeon-party-root] .dp-resize-y:focus-visible{outline:2px solid #ffd777;outline-offset:2px}
[data-dungeon-party-root] .dp-emblem{display:grid;place-items:center;width:28px;height:28px;border:1px solid #e6bd65;border-radius:50%;background:#261d11;color:#ffd77d;font-size:15px}
[data-dungeon-party-root] .dp-launch-phase{font-size:10px;color:#b8a57e;text-transform:uppercase;letter-spacing:.12em}
[data-dungeon-party-root] .dp-launch-title{font-size:12px;font-weight:750}
[data-dungeon-party-root] .dp-panel{position:fixed;z-index:79;top:16px;right:18px;max-width:calc(100vw - 36px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #8b6a34;border-radius:14px;background:radial-gradient(circle at 80% -20%,#3b2c1744,transparent 38%),#0c1118;box-shadow:0 24px 70px #000c,0 0 0 1px #000,inset 0 1px #f6cf7755;pointer-events:auto;overscroll-behavior:contain}
[data-dungeon-party-root] .dp-panel::before{content:"";height:3px;flex:none;background:linear-gradient(90deg,transparent,#d6a84f 20%,#ffdf8d 50%,#d6a84f 80%,transparent)}
[data-dungeon-party-root] .dp-header{padding:8px 12px 7px;border-bottom:1px solid #5e4a2c;background:#121924;cursor:move;user-select:none;touch-action:none}
[data-dungeon-party-root] .dp-resize{position:absolute;z-index:2;left:-4px;top:54px;bottom:12px;width:9px;cursor:ew-resize;touch-action:none}
[data-dungeon-party-root] .dp-resize::after{content:"";position:absolute;left:4px;top:42%;width:2px;height:48px;border-radius:2px;background:#9b773d88}
[data-dungeon-party-root] .dp-resize:hover::after,[data-dungeon-party-root] .dp-resize:focus-visible::after{background:#efbd61}
[data-dungeon-party-root] .dp-resize-y{position:absolute;z-index:2;left:12px;right:12px;bottom:-4px;height:9px;cursor:ns-resize;touch-action:none}
[data-dungeon-party-root] .dp-resize-y::after{content:"";position:absolute;left:42%;top:4px;width:48px;height:2px;border-radius:2px;background:#9b773d88}
[data-dungeon-party-root] .dp-resize-y:hover::after,[data-dungeon-party-root] .dp-resize-y:focus-visible::after{background:#efbd61}
[data-dungeon-party-root] .dp-header-line{display:flex;align-items:flex-start;gap:12px}
[data-dungeon-party-root] .dp-crest{display:grid;place-items:center;flex:none;width:36px;height:36px;border:1px solid #c99a45;border-radius:8px;background:#251c11;color:#f3c96e;font-size:25px;box-shadow:inset 0 0 18px #000}
[data-dungeon-party-root] .dp-eyebrow{color:#c9a57e;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
[data-dungeon-party-root] .dp-title{margin:2px 0 0;color:#fff1c9;font-family:Georgia,"Times New Roman",serif;font-size:16px;line-height:1.1;letter-spacing:.025em}
[data-dungeon-party-root] .dp-objective{overflow:hidden;margin:2px 0 0;color:#aeb5c0;font-size:11px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-close{margin-left:auto;border:0;background:transparent;color:#9ea5af;font-size:19px;cursor:pointer}
[data-dungeon-party-root] .dp-close:hover{color:#fff}
[data-dungeon-party-root] .dp-progress-meta{display:flex;justify-content:space-between;margin-top:6px;color:#b7bdc6;font-size:10px}
[data-dungeon-party-root] .dp-progress{height:5px;margin-top:6px;overflow:hidden;border:1px solid #282f39;border-radius:3px;background:#05070a}
[data-dungeon-party-root] .dp-progress>span{display:block;height:100%;background:#c9a247;box-shadow:0 0 10px #e8bd57;transition:width .25s ease}
[data-dungeon-party-root] .dp-tabs{display:grid;grid-template-columns:repeat(5,1fr);flex:none;border-bottom:1px solid #383229;background:#0b0f15}
[data-dungeon-party-root] .dp-tab{padding:7px 4px;border:0;border-right:1px solid #252a31;background:transparent;color:#8f98a5;font-size:10px;font-weight:800;letter-spacing:.08em;cursor:pointer}
[data-dungeon-party-root] .dp-tab[data-active=true]{background:#2b211488;color:#f2c66d;box-shadow:inset 0 -2px #d9a849}
[data-dungeon-party-root] .dp-tab:hover{color:#ece1ca}
[data-dungeon-party-root] .dp-content{overflow:auto;min-height:0;padding:8px;scrollbar-color:#66502d #10151d}
[data-dungeon-party-root] .dp-content[data-tab=party]{display:flex;flex-direction:column;overflow:hidden}
[data-dungeon-party-root] .dp-content[data-tab=party]>.dp-roster{flex:1;grid-template-rows:repeat(5,minmax(0,1fr))}
[data-dungeon-party-root] .dp-section-head{display:flex;align-items:center;justify-content:space-between;margin:1px 2px 6px}
[data-dungeon-party-root] .dp-section-title{color:#d4b06a;font-family:Georgia,"Times New Roman",serif;font-size:13px;font-weight:700;letter-spacing:.06em}
[data-dungeon-party-root] .dp-section-meta{color:#77818e;font-size:9px;text-transform:uppercase;letter-spacing:.12em}
[data-dungeon-party-root] .dp-roster{display:grid;gap:4px;min-height:0}
[data-dungeon-party-root] .dp-member{position:relative;display:grid;grid-template-columns:34px 1fr auto;gap:6px;align-items:center;min-width:0;min-height:0;overflow:hidden;padding:5px;border:1px solid #29313c;border-left:3px solid var(--class);border-radius:8px;background:#111821;box-shadow:inset 0 1px #ffffff08}
[data-dungeon-party-root] .dp-member[data-life=down]{filter:grayscale(.8);opacity:.62}
[data-dungeon-party-root] .dp-member[data-activity=running]{border-color:color-mix(in srgb,var(--class) 62%,#29313c);background:color-mix(in srgb,var(--class) 9%,#111821);box-shadow:inset 3px 0 var(--class),0 0 12px color-mix(in srgb,var(--class) 18%,transparent)}
[data-dungeon-party-root] .dp-member[data-activity=running] .dp-avatar{animation:dp-working 1.6s ease-in-out infinite;will-change:transform,opacity}
[data-dungeon-party-root] .dp-member[data-activity=stopped]{border-color:#b04b43;background:#211415}
[data-dungeon-party-root] .dp-avatar{display:grid;place-items:center;width:30px;height:30px;border:2px solid var(--class);border-radius:50%;background:#090c11;font-size:18px;box-shadow:0 0 12px color-mix(in srgb,var(--class) 35%,transparent)}
[data-dungeon-party-root] .dp-member-main{min-width:0}
[data-dungeon-party-root] .dp-name{overflow:hidden;color:#f0f2f5;font-size:12px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
[data-dungeon-party-root] .dp-spec{margin-top:1px;color:#8e98a5;font-size:9px;text-transform:uppercase;letter-spacing:.09em}
[data-dungeon-party-root] .dp-bars{display:grid;gap:2px;margin-top:3px}
[data-dungeon-party-root] .dp-bar{position:relative;height:5px;overflow:hidden;border-radius:2px;background:#05080b}
[data-dungeon-party-root] .dp-bar>span{display:block;height:100%;transition:width .25s ease}
[data-dungeon-party-root] .dp-hp{background:#47a65b}
[data-dungeon-party-root] .dp-power{background:var(--class)}
[data-dungeon-party-root] .dp-member-state{text-align:right}
[data-dungeon-party-root] .dp-role{color:var(--class);font-size:9px;font-weight:900;letter-spacing:.12em}
[data-dungeon-party-root] .dp-state{margin-top:2px;color:#aeb5bf;font-size:9px}
[data-dungeon-party-root] .dp-current{grid-column:2/4;overflow:hidden;margin-top:-3px;color:#c6ccd5;font-size:10px;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-current::before{content:"› ";color:var(--class)}
[data-dungeon-party-root] .dp-member.tank{--class:#529ad4}
[data-dungeon-party-root] .dp-member.dps1{--class:#e56c40}
[data-dungeon-party-root] .dp-member.dps2{--class:#9f78db}
[data-dungeon-party-root] .dp-member.dps3{--class:#4bbdc2}
[data-dungeon-party-root] .dp-member.healer{--class:#60c978}
[data-dungeon-party-root] .dp-quest-list{display:grid;gap:8px}
[data-dungeon-party-root] .dp-quest{position:relative;padding:10px 10px 10px 13px;border:1px solid #2a323d;border-radius:7px;background:#111821}
[data-dungeon-party-root] .dp-quest::before{content:"";position:absolute;inset:8px auto 8px 0;width:2px;background:var(--quest-color,#8b949f)}
[data-dungeon-party-root] .dp-quest-top{display:flex;align-items:center;gap:8px}
[data-dungeon-party-root] .dp-quest-id{color:#c69d53;font:700 9px ui-monospace,monospace;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-quest-title{overflow:hidden;flex:1;color:#e8ebef;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-badge{padding:2px 6px;border:1px solid #3b4653;border-radius:8px;color:#aeb7c2;font-size:9px}
[data-dungeon-party-root] .dp-quest-detail{margin-top:6px;color:#87919e;font-size:9px;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-deps{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
[data-dungeon-party-root] .dp-dep{padding:2px 5px;border-radius:3px;background:#272116;color:#cfaa65;font:9px ui-monospace,monospace;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-empty{padding:28px 12px;text-align:center;color:#737e8b;font-size:11px}
[data-dungeon-party-root] .dp-empty-glyph{display:block;margin-bottom:8px;color:#7f693d;font-size:30px}
[data-dungeon-party-root] .dp-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}
[data-dungeon-party-root] .dp-metric{padding:10px 6px;border:1px solid #2e3742;border-radius:7px;background:#111821;text-align:center}
[data-dungeon-party-root] .dp-metric strong{display:block;color:#f0cc80;font-family:Georgia,serif;font-size:19px}
[data-dungeon-party-root] .dp-metric span{color:#818b98;font-size:9px;text-transform:uppercase;letter-spacing:.08em}
[data-dungeon-party-root] .dp-timeline{display:grid;gap:0}
[data-dungeon-party-root] .dp-event{position:relative;margin-left:7px;padding:0 0 13px 17px;border-left:1px solid #3a424d;color:#aab2bd;font-size:10px;line-height:1.45;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-event::before{content:"";position:absolute;left:-4px;top:3px;width:7px;height:7px;border:1px solid #d2a44f;border-radius:50%;background:#161c24}
[data-dungeon-party-root] .dp-event strong{display:block;color:#e0e4e9;font-size:10px}
[data-dungeon-party-root] .dp-time{color:#687381;font:9px ui-monospace,monospace}
[data-dungeon-party-root] .dp-actions{display:grid;gap:8px}
[data-dungeon-party-root] .dp-button{min-height:38px;padding:8px 10px;border:1px solid #675333;border-radius:7px;background:#19160f;color:#d9bd83;font-size:10px;font-weight:700;text-align:left;cursor:pointer}
[data-dungeon-party-root] .dp-button:hover{border-color:#bf9345;background:#282014;color:#ffe0a0}
[data-dungeon-party-root] .dp-confirm{margin-top:10px;padding:11px;border:1px solid #a77938;border-radius:8px;background:#21190f;color:#d8c39d;font-size:10px}
[data-dungeon-party-root] .dp-confirm strong{color:#ffcf74}
[data-dungeon-party-root] .dp-confirm-row{display:flex;gap:7px;margin-top:9px}
[data-dungeon-party-root] .dp-confirm-row button{padding:6px 10px;border:1px solid #715933;border-radius:5px;background:#171b21;color:#d8dce2;font-size:9px;cursor:pointer}
[data-dungeon-party-root] .dp-feedback{color:#79c58b;font-size:10px}
[data-dungeon-party-root] .dp-feedback[data-tone=error]{color:#e2796f}
[data-dungeon-party-root] .dp-raw{margin-top:12px;color:#89939f;font-size:10px}
[data-dungeon-party-root] .dp-raw pre{max-height:240px;overflow:auto;padding:8px;background:#05070a;font-size:9px;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-validation{display:flex;flex-direction:column;gap:9px}
[data-dungeon-party-root] .dp-report{padding:9px 10px;border:1px solid #2a323d;border-radius:7px;background:#111821}
[data-dungeon-party-root] .dp-report[data-status=stale]{border-color:#5c4a2c;background:#141310}
[data-dungeon-party-root] .dp-report-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
[data-dungeon-party-root] .dp-verdict{padding:2px 8px;border:1px solid #3b4653;border-radius:9px;background:#0d1218;color:#cdd4dd;font-size:10px;font-weight:800;letter-spacing:.05em}
[data-dungeon-party-root] .dp-verdict[data-verdict=pass]{color:#7fd694;border-color:#2e5e3c;background:#0e1a13}
[data-dungeon-party-root] .dp-verdict[data-verdict=fail]{color:#e2796f;border-color:#6e3a32;background:#1c1311}
[data-dungeon-party-root] .dp-verdict[data-verdict=blocked]{color:#b0a0ec;border-color:#4c3d6b;background:#141019}
[data-dungeon-party-root] .dp-stamp{padding:2px 7px;border:1px solid #3b4653;border-radius:9px;color:#aeb7c2;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
[data-dungeon-party-root] .dp-stamp[data-stale=true]{color:#e0b463;border-color:#6e5626;background:#1c160c}
[data-dungeon-party-root] .dp-report-time{margin-left:auto;color:#687381;font:9px ui-monospace,monospace}
[data-dungeon-party-root] .dp-report-versions{margin-top:6px;color:#c69d53;font:9px ui-monospace,monospace}
[data-dungeon-party-root] .dp-report-summary{margin:6px 0 0;color:#98a1ac;font-size:10px;line-height:1.5;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-check-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
[data-dungeon-party-root] .dp-check{padding:2px 7px;border:1px solid #3b4653;border-radius:9px;background:#0d1218;color:#a6afba;font-size:9px;font-weight:700;letter-spacing:.03em}
[data-dungeon-party-root] .dp-check[data-check=pass]{color:#7fd694;border-color:#2e5e3c}
[data-dungeon-party-root] .dp-check[data-check=fail]{color:#e2796f;border-color:#6e3a32}
[data-dungeon-party-root] .dp-check[data-check=blocked]{color:#b0a0ec;border-color:#4c3d6b}
[data-dungeon-party-root] .dp-check[data-check=not-applicable]{color:#8d96a1}
[data-dungeon-party-root] .dp-finding-group{margin-top:9px}
[data-dungeon-party-root] .dp-finding-head{display:block;padding-bottom:3px;border-bottom:1px solid #262d36;color:#d4b06a;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
[data-dungeon-party-root] .dp-finding-head[data-severity=critical]{color:#e2796f}
[data-dungeon-party-root] .dp-finding-head[data-severity=major]{color:#e2ad5b}
[data-dungeon-party-root] .dp-finding-head[data-severity=minor]{color:#8fb9d9}
[data-dungeon-party-root] .dp-finding{margin-top:5px;padding-left:8px;border-left:2px solid #697482}
[data-dungeon-party-root] .dp-finding[data-severity=critical]{border-left-color:#d35050}
[data-dungeon-party-root] .dp-finding[data-severity=major]{border-left-color:#e0a348}
[data-dungeon-party-root] .dp-finding[data-severity=minor]{border-left-color:#4da6d9}
[data-dungeon-party-root] .dp-finding-title{display:block;color:#dfe3e9;font-size:10px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-finding-owner{display:block;margin-top:1px;color:#77807c;font-size:9px;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-report-clean{margin-top:8px;color:#7fd694;font-size:10px}
[data-dungeon-party-root] .dp-metrics-2{grid-template-columns:repeat(2,1fr)}
[data-dungeon-party-root] .dp-res-subhead{display:flex;align-items:center;justify-content:space-between;padding-bottom:3px;border-bottom:1px solid #262d36;color:#b9a26b;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
[data-dungeon-party-root] .dp-res-meta{color:#687381;font:9px ui-monospace,monospace;letter-spacing:.02em}
[data-dungeon-party-root] .dp-res-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px 8px;margin-top:5px;padding:5px 8px;border:1px solid #2a323d;border-radius:6px;background:#111821}
[data-dungeon-party-root] .dp-res-main{display:flex;align-items:center;gap:6px;min-width:0}
[data-dungeon-party-root] .dp-res-name{overflow:hidden;color:#e6e9ee;font-size:10px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
[data-dungeon-party-root] .dp-res-id{overflow:hidden;color:#c69d53;font:9px ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:anywhere}
[data-dungeon-party-root] .dp-res-status{padding:2px 7px;border:1px solid #3b4653;border-radius:9px;color:#a6afba;font-size:9px;font-weight:700}
[data-dungeon-party-root] .dp-res-status[data-inflight=issued]{color:#ffd77d;border-color:#6e5626;background:#1c160c}
[data-dungeon-party-root] .dp-res-status[data-inflight=consumed]{color:#8fd9a2;border-color:#2e5e3c;background:#0e1a13}
[data-dungeon-party-root] .dp-res-meta-line{grid-column:1/3;color:#687381;font:9px ui-monospace,monospace;letter-spacing:.02em}
[data-dungeon-party-root] .dp-res-empty{margin-top:5px;padding:8px;border:1px dashed #29313c;border-radius:6px;color:#6b747f;font-size:9px;text-align:center}
[data-dungeon-party-root] .dp-gen-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}
[data-dungeon-party-root] .dp-gen{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 8px;border:1px solid #29313c;border-radius:6px;background:#111821}
[data-dungeon-party-root] .dp-gen-name{overflow:hidden;color:#c6ccd5;font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
[data-dungeon-party-root] .dp-gen-value{flex:none;color:#c69d53;font:9px ui-monospace,monospace}
[data-dungeon-party-root] .dp-error{position:fixed;z-index:79;top:16px;right:18px;width:min(348px,calc(100vw - 36px));padding:14px;border:1px solid #a77938;border-radius:12px;background:#1c1311;box-shadow:0 24px 70px #000c;color:#e9d5c0;font-size:11px;line-height:1.5;pointer-events:auto}
[data-dungeon-party-root] .dp-error strong{display:block;color:#ffcf74;font-size:12px;margin-bottom:6px}
[data-dungeon-party-root] .dp-error pre{margin:8px 0;max-height:120px;overflow:auto;padding:8px;background:#05070a;color:#e2a49a;font-size:9px;overflow-wrap:anywhere;white-space:pre-wrap}
[data-dungeon-party-root] .dp-error button{padding:6px 12px;border:1px solid #715933;border-radius:5px;background:#171b21;color:#d8dce2;font-size:10px;cursor:pointer}
@keyframes dp-working{0%,100%{transform:scale(1);opacity:.86}50%{transform:scale(1.06);opacity:1}}
@media(max-width:720px){[data-dungeon-party-root] .dp-panel{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important;max-height:none;transform:none!important}[data-dungeon-party-root] .dp-resize,[data-dungeon-party-root] .dp-resize-y{display:none}[data-dungeon-party-root] .dp-launcher{right:9px;top:9px}[data-dungeon-party-root] .dp-title{font-size:17px}}
@media(prefers-reduced-motion:reduce){[data-dungeon-party-root] .dp-progress>span,[data-dungeon-party-root] .dp-bar>span{transition:none}[data-dungeon-party-root] .dp-member[data-activity=running] .dp-avatar{animation:none}}
`

type Tab = 'party' | 'quests' | 'chronicle' | 'validation' | 'actions'

const tabOrder: Array<{ id: Tab; label: string; ariaLabel: string }> = [
  { id: 'party', label: '队伍', ariaLabel: '队伍面板' },
  { id: 'quests', label: '任务', ariaLabel: '任务面板' },
  { id: 'chronicle', label: '战报', ariaLabel: '战报面板' },
  { id: 'validation', label: '验收', ariaLabel: '验收与战复面板' },
  { id: 'actions', label: '指挥', ariaLabel: '指挥面板' },
]

/**
 * Structured commander actions. The instruction envelope carries a stable
 * machine-readable header (source + runId + intent) before the human
 * guidance, so the tank can correlate the request instead of parsing prose.
 */
interface PartyActionDescriptor {
  id: string
  label: string
  caption: string
  buildInstruction: (runId: string) => string
}

const partyActions: PartyActionDescriptor[] = [
  {
    id: 'stall-check',
    label: '⌛ 请求停滞检查',
    caption: '检查失去响应的输出成员与任务租约',
    buildInstruction: (runId) =>
      `[dungeon-party-command] source=dungeon-party-overlay runId=${runId} intent=stall-check\n` +
      `请检查所有疑似停滞的 DPS（runId=${runId}）：先用 party_health 与 party_status 核对 lease、progressState 与 checkpoint 期限，` +
      `再对疑似任务调用 party_request_checkpoint；仅在确认停滞后调用 party_interrupt，并按协议决定缩小任务、中断或重派。`,
  },
  {
    id: 'healer-recovery',
    label: '✚ 指示奶自我稳定',
    caption: '恢复圣谕者的独立验收能力',
    buildInstruction: (runId) =>
      `[dungeon-party-command] source=dungeon-party-overlay runId=${runId} intent=healer-recovery\n` +
      `请检查验收奶 readiness（runId=${runId}）：若其 degraded 但仍响应，请调用 party_direct_recovery 指示原 Session 自我稳定。`,
  },
  {
    id: 'commander-load',
    label: '♜ 处理指挥承压',
    caption: '暂停派遣并清理关键决策队列',
    buildInstruction: (runId) =>
      `[dungeon-party-command] source=dungeon-party-overlay runId=${runId} intent=commander-load\n` +
      `请检查 commanderLoad 和待决策队列（runId=${runId}）：若承压，请暂停新派工并先清理关键决策，然后安全恢复派工。`,
  },
  {
    id: 'continue-run',
    label: '↻ 继续当前副本',
    caption: '断线或团灭后从持久进度恢复',
    buildInstruction: (runId) =>
      `[dungeon-party-command] source=dungeon-party-overlay runId=${runId} intent=continue-run\n` +
      `网络中断后继续当前副本：请调用 party_recover，runId=${runId}，action=continue；从持久状态恢复全部已绑定成员并继续调度。`,
  },
  {
    id: 'restart-run',
    label: '⚑ 重开副本',
    caption: '终止本次进度并创建新的队伍',
    buildInstruction: (runId) =>
      `[dungeon-party-command] source=dungeon-party-overlay runId=${runId} intent=restart-run\n` +
      `放弃当前副本并重新开始：请调用 party_recover，runId=${runId}，action=restart；保留目标和工作区但创建全新 run。`,
  },
]

export interface MemberMeters {
  health: number
  resource: number
  resourceName: string
  activityLabel: string
}

const activityLabels: Record<string, string> = {
  running: '执行中',
  queued: '排队中',
  waiting: '等待中',
  stopped: '已停止',
  idle: '待命',
}

/** Convert durable service state into role-specific, human-readable meters. */
export function memberMeters(run: DungeonRun, slot: PartySlot): MemberMeters {
  const member = run.slots[slot]
  const resourceName = slot === 'tank' ? '指挥压力' : slot === 'healer' ? '治疗负载' : '任务输出'
  if (!member.currentSessionId) return { health: 0, resource: 0, resourceName, activityLabel: '尚未集结' }

  const health = member.lifeState === 'down' || member.lifeState === 'permanently-dead'
    ? 0
    : member.lifeState === 'resurrection-requested' || member.lifeState === 'resurrecting' || member.readiness === 'recovering'
      ? 42
      : member.readiness === 'unavailable'
        ? 12
        : member.readiness === 'degraded'
          ? 68
          : 100
  const baseActivityLabel = member.lifeState === 'down'
    ? '已倒下'
    : member.readiness === 'recovering'
      ? '恢复中'
      : activityLabels[member.activityState ?? 'idle'] ?? '待命'

  if (slot === 'tank') {
    const resource = run.commanderLoad === 'unavailable' ? 0 : run.commanderLoad === 'overloaded' ? 96 : run.commanderLoad === 'pressured' ? 68 : 34
    return { health, resource, resourceName, activityLabel: baseActivityLabel }
  }
  if (slot === 'healer') {
    const hasRecovery = run.recoveryInstructions.some((instruction) => instruction.status === 'issued')
    const resource = hasRecovery ? 94 : run.phase === 'VALIDATING' ? 86 : member.activityState === 'running' ? 78 : member.readiness === 'degraded' ? 58 : 30
    return {
      health,
      resource,
      resourceName,
      activityLabel: run.phase === 'VALIDATING' && baseActivityLabel === '待命' ? '验收中' : baseActivityLabel,
    }
  }

  const ownedTasks = Object.values(run.tasks).filter((task) => task.ownerSlot === slot)
  const activeTask = ownedTasks.find((task) => task.status === 'running')
  const stalled = member.activityState === 'stopped' || activeTask?.progressState === 'stalled'
  const allCompleted = ownedTasks.length > 0 && ownedTasks.every((task) => task.status === 'completed')
  const resource = stalled ? 14 : activeTask || member.activityState === 'running' ? 88 : allCompleted ? 100 : member.activityState === 'waiting' ? 48 : member.activityState === 'queued' ? 56 : 24
  return { health, resource, resourceName, activityLabel: stalled ? '已停滞' : baseActivityLabel }
}

export interface ValidationFindingGroup {
  severity: string
  label: string
  findings: ValidationFinding[]
}

/** Tally per-status check counts of a validation report, tolerating malformed projections. */
export function validationCheckCounts(report: Pick<ValidationReport, 'checks'> | null | undefined): Record<ValidationCheckStatus, number> {
  const counts = { pass: 0, fail: 0, blocked: 0, 'not-applicable': 0 } as Record<ValidationCheckStatus, number>
  for (const check of Array.isArray(report?.checks) ? report.checks : []) {
    if (check?.status && check.status in counts) counts[check.status as ValidationCheckStatus] += 1
  }
  return counts
}

/** Group findings by severity (critical → major → minor, unknown severities last). */
export function validationFindingGroups(findings: ValidationReport['findings'] | null | undefined): ValidationFindingGroup[] {
  const groups: ValidationFindingGroup[] = [
    { severity: 'critical', label: severityLabel.critical!, findings: [] },
    { severity: 'major', label: severityLabel.major!, findings: [] },
    { severity: 'minor', label: severityLabel.minor!, findings: [] },
    { severity: 'other', label: '其他发现', findings: [] },
  ]
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding) continue
    const group = groups.find((candidate) => candidate.severity === finding.severity) ?? groups.find((candidate) => candidate.severity === 'other')
    if (group) group.findings.push(finding)
  }
  return groups.filter((group) => group.findings.length > 0)
}

/** Resurrection records are in flight while issued or consumed; the rest is history. */
function isResInFlight(status: string | undefined): boolean {
  return status === 'issued' || status === 'consumed'
}

function slotDisplayName(slot: string | undefined): string {
  return partyIdentity[slot as PartySlot]?.name ?? (slot ? String(slot) : '未知槽位')
}

function ownerTaskLabel(run: DungeonRun, finding: ValidationFinding | null | undefined): string {
  const taskId = finding?.ownerTaskId
  if (!taskId) return '未归属任务'
  return run.tasks?.[taskId]?.workOrder?.title ?? taskId
}

let timeFormatter: Intl.DateTimeFormat | undefined
try {
  timeFormatter = new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
} catch {
  timeFormatter = undefined
}

/** Render durable ISO timestamps through the host locale, falling back gracefully. */
export function formatTime(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return timeFormatter ? timeFormatter.format(date) : iso
  } catch {
    return iso
  }
}

/** Raw projection views are capped so oversized runs cannot freeze the overlay. */
const RAW_PROJECTION_LIMIT = 200_000

function clampOffset(offset: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return offset
  const maxX = Math.max(0, window.innerWidth - 48)
  const maxY = Math.max(0, window.innerHeight - 48)
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  }
}

interface OverlayErrorBoundaryState {
  error: Error | undefined
}

/** Keeps a malformed projection from taking down the whole shell overlay. */
export class OverlayErrorBoundary extends Component<{ children: ReactNode }, OverlayErrorBoundaryState> {
  state: OverlayErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: Error): OverlayErrorBoundaryState {
    return { error }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return <div className="dp-error" role="alert" aria-label="副本面板渲染失败">
      <strong>副本面板渲染失败</strong>
      <span>投影数据异常或面板组件出错，副本本身的持久状态不受影响。</span>
      <pre>{this.state.error.message}</pre>
      <button type="button" onClick={() => this.setState({ error: undefined })}>重试渲染</button>
    </div>
  }
}

/** FR-062 latest validation report details plus FR-063 battle resurrection status. */
function ValidationTab({ run }: { run: DungeonRun }) {
  const reports: ValidationReport[] = Array.isArray(run.validationReports) ? run.validationReports : []
  const report = reports.at(-1) ?? null
  const stale = report?.status === 'stale'
  const counts = validationCheckCounts(report)
  const groups = validationFindingGroups(report?.findings)
  const requests: ResurrectionRequest[] = Array.isArray(run.resurrectionRequests) ? run.resurrectionRequests : []
  const tickets: CommanderRescueTicket[] = Array.isArray(run.commanderRescueTickets) ? run.commanderRescueTickets : []
  const activeRequests = requests.filter((request) => isResInFlight(request?.status))
  const activeTickets = tickets.filter((ticket) => isResInFlight(ticket?.status))
  const dpsCharges = Number.isFinite(run.battleResChargesRemaining) ? run.battleResChargesRemaining : 0
  const commanderCharges = Number.isFinite(run.commanderBattleResChargesRemaining) ? run.commanderBattleResChargesRemaining : 0
  const verdictLabel = report
    ? verdictName[report.verdict] ?? (report.verdict ? String(report.verdict) : '未知结论')
    : ''
  return <div className="dp-validation">
    <div className="dp-section-head">
      <span className="dp-section-title">验收检定</span>
      <span className="dp-section-meta">{`${reports.length} REPORTS`}</span>
    </div>
    {report ? <article className="dp-report" data-status={stale ? 'stale' : 'current'}
      title={report.workspaceFingerprint ? `工作区指纹 ${report.workspaceFingerprint}` : undefined}>
      <div className="dp-report-top">
        <span className="dp-verdict" data-verdict={report.verdict ?? 'unknown'}>{verdictLabel}</span>
        <span className="dp-stamp" data-stale={stale}>{stale ? '已失效' : '最新'}</span>
        <span className="dp-report-time">{formatTime(report.createdAt)}</span>
      </div>
      <div className="dp-report-versions">{`任务集 v${report.taskSetVersion ?? '—'} · 清单 v${report.manifestVersion ?? '—'}`}</div>
      {report.summary ? <p className="dp-report-summary">{report.summary}</p> : null}
      <div className="dp-check-row">
        {checkStatusOrder.map((status) => <span className="dp-check" data-check={status} key={status}>{`${checkStatusName[status]} ${counts[status]}`}</span>)}
      </div>
      {groups.length > 0 ? groups.map((group) => <div className="dp-finding-group" key={group.severity}>
        <span className="dp-finding-head" data-severity={group.severity}>{`${group.label} · ${group.findings.length}`}</span>
        {group.findings.map((finding, index) => <div className="dp-finding" data-severity={group.severity} key={finding.id ?? `${group.severity}-${index}`}>
          <span className="dp-finding-title">{finding.title ?? '未命名发现'}</span>
          <span className="dp-finding-owner">{`归属 ${ownerTaskLabel(run, finding)}`}</span>
        </div>)}
      </div>) : <div className="dp-report-clean">本轮检定未发现缺陷</div>}
    </article> : <div className="dp-empty"><span className="dp-empty-glyph">⚖</span>奶尚未提交验收报告</div>}

    <div className="dp-section-head">
      <span className="dp-section-title">战斗复活</span>
      <span className="dp-section-meta">BATTLE RES</span>
    </div>
    <div className="dp-metrics dp-metrics-2">
      <div className="dp-metric" aria-label={`DPS 战复剩余 ${dpsCharges}`}><strong>{dpsCharges}</strong><span>DPS 战复剩余</span></div>
      <div className="dp-metric" aria-label={`领队战复剩余 ${commanderCharges}`}><strong>{commanderCharges}</strong><span>领队战复剩余</span></div>
    </div>
    <div className="dp-res-subhead"><span>复活申请</span><span className="dp-res-meta">{`${activeRequests.length}/${requests.length} 进行中`}</span></div>
    {activeRequests.length > 0 ? activeRequests.map((request, index) => <div className="dp-res-item" key={request.resurrectionId ?? `request-${index}`}>
      <div className="dp-res-main">
        <span className="dp-res-name">{slotDisplayName(request.targetSlot)}</span>
        <span className="dp-res-id">{request.resurrectionId ?? '—'}</span>
      </div>
      <span className="dp-res-status" data-inflight={request.status ?? 'issued'}>{resStatusName[request.status ?? ''] ?? String(request.status ?? '未知状态')}</span>
      <div className="dp-res-meta-line">{`申请于 ${formatTime(request.requestedAt)} · 过期于 ${formatTime(request.expiresAt)}`}</div>
    </div>) : <div className="dp-res-empty">暂无进行中的复活申请</div>}
    <div className="dp-res-subhead"><span>紧急票据</span><span className="dp-res-meta">{`${activeTickets.length}/${tickets.length} 进行中`}</span></div>
    {activeTickets.length > 0 ? activeTickets.map((ticket, index) => <div className="dp-res-item" key={ticket.ticketId ?? `ticket-${index}`}>
      <div className="dp-res-main">
        <span className="dp-res-name">{slotDisplayName(ticket.targetSlot)}</span>
        <span className="dp-res-id">{ticket.ticketId ?? '—'}</span>
      </div>
      <span className="dp-res-status" data-inflight={ticket.status ?? 'issued'}>{resStatusName[ticket.status ?? ''] ?? String(ticket.status ?? '未知状态')}</span>
      <div className="dp-res-meta-line">{`签发于 ${formatTime(ticket.issuedAt)} · 过期于 ${formatTime(ticket.expiresAt)}`}</div>
    </div>) : <div className="dp-res-empty">暂无进行中的紧急票据</div>}
    <div className="dp-res-subhead"><span>槽位代数</span><span className="dp-res-meta">GENERATIONS</span></div>
    <div className="dp-gen-grid">{slots.map((slot) => {
      const member = run.slots?.[slot]
      return <div className="dp-gen" key={slot}>
        <span className="dp-gen-name">{partyIdentity[slot]!.name}</span>
        <span className="dp-gen-value">{`G${member?.generation ?? 0} · 历史 ${member?.history?.length ?? 0}`}</span>
      </div>
    })}</div>
  </div>
}

function TaskRow({ task }: { task: TaskRecord }) {
  const workOrder = task.workOrder
  if (!workOrder) return null
  const dependencies = Array.isArray(workOrder.blockedBy) ? workOrder.blockedBy : []
  return <article className="dp-quest" style={{ '--quest-color': task.status === 'completed' ? '#55c96f' : task.status === 'running' ? '#d7aa52' : '#697482' } as CSSProperties}>
    <div className="dp-quest-top">
      <span className="dp-quest-id">{workOrder.id}</span>
      <strong className="dp-quest-title">{workOrder.title}</strong>
      <span className="dp-badge">{taskStatusName[task.status] ?? task.status}</span>
    </div>
    <div className="dp-quest-detail">{task.ownerSlot ? partyIdentity[task.ownerSlot]?.name ?? task.ownerSlot : '尚未分派'} · {(workOrder.priority ?? 'normal').toUpperCase()} · Scope {(workOrder.writeScopes ?? []).join(', ') || '只读'}</div>
    {dependencies.length > 0 ? <div className="dp-deps">{dependencies.map((dependency) => <span className="dp-dep" key={dependency}>↳ {dependency}</span>)}</div> : null}
  </article>
}

/**
 * The overlay consumes only the `useSessions` global standard seat plus its
 * own inject face. Props are declared as the exact consumed subset (instead of
 * the full `PropsRuntime` share), so future additions to the global standard
 * kit never force this component — or its tests — to stub props it ignores.
 */
interface DungeonPartyOverlayProps extends Pick<PropsRuntime<'shell.overlay'>, 'useSessions'> {
  requestAction: (instruction: string) => Promise<boolean>
}

export function DungeonPartyOverlay({ useSessions, requestAction }: DungeonPartyOverlayProps) {
  const run = useSessions((state: SessionListState) => state.current
    ? state.byId[state.current]?.projectionValues?.['dungeon-party'] ?? null
    : null)
  const runId = run?.id
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('party')
  const [pendingAction, setPendingAction] = useState<PartyActionDescriptor>()
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'error' }>()
  const [isSubmitting, setSubmitting] = useState(false)
  const [rawProjectionOpen, setRawProjectionOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(348)
  const [panelHeight, setPanelHeight] = useState(640)
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 })
  const [launcherOffset, setLauncherOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number }>()
  const launcherDrag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number }>()
  const launcherMoved = useRef(false)
  const resize = useRef<{ pointerId: number; clientX: number; width: number }>()
  const heightResize = useRef<{ pointerId: number; clientY: number; height: number }>()
  /** The run a submission was started for; late results from other runs are dropped. */
  const submissionRun = useRef<string | undefined>()
  const tasks = useMemo(() => {
    if (!run || typeof run.tasks !== 'object' || run.tasks === null) return []
    return Object.values(run.tasks).filter((task): task is TaskRecord => Boolean(task))
  }, [run])

  // Crossing into another run (or losing the projection) must never leak a
  // pending confirmation, stale feedback, or an in-flight submission.
  useEffect(() => {
    submissionRun.current = undefined
    setPendingAction(undefined)
    setFeedback(undefined)
    setSubmitting(false)
  }, [runId])

  const rawProjection = useMemo(() => {
    if (!rawProjectionOpen || !run) return undefined
    const text = JSON.stringify(run, null, 2)
    if (text.length <= RAW_PROJECTION_LIMIT) return text
    return `${text.slice(0, RAW_PROJECTION_LIMIT)}\n…（投影过大，已截断显示）`
  }, [rawProjectionOpen, run])

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...panelOffset }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    setPanelOffset(clampOffset({ x: active.x + event.clientX - active.clientX, y: active.y + event.clientY - active.clientY }))
  }
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined
  }
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    resize.current = { pointerId: event.pointerId, clientX: event.clientX, width: panelWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = resize.current
    if (!active || active.pointerId !== event.pointerId) return
    setPanelWidth(Math.min(480, Math.max(300, active.width + active.clientX - event.clientX)))
  }
  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resize.current?.pointerId === event.pointerId) resize.current = undefined
  }
  const resizeWidthByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setPanelWidth((width) => Math.max(300, width - 16))
    else if (event.key === 'ArrowRight') setPanelWidth((width) => Math.min(480, width + 16))
  }
  const beginHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    heightResize.current = { pointerId: event.pointerId, clientY: event.clientY, height: panelHeight }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = heightResize.current
    if (!active || active.pointerId !== event.pointerId) return
    setPanelHeight(Math.min(720, Math.max(380, active.height + event.clientY - active.clientY)))
  }
  const endHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (heightResize.current?.pointerId === event.pointerId) heightResize.current = undefined
  }
  const resizeHeightByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') setPanelHeight((height) => Math.min(720, height + 16))
    else if (event.key === 'ArrowUp') setPanelHeight((height) => Math.max(380, height - 16))
  }
  const beginLauncherDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    launcherMoved.current = false
    launcherDrag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...launcherOffset }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveLauncherDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = launcherDrag.current
    if (!active || active.pointerId !== event.pointerId) return
    const deltaX = event.clientX - active.clientX
    const deltaY = event.clientY - active.clientY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) launcherMoved.current = true
    setLauncherOffset(clampOffset({ x: active.x + deltaX, y: active.y + deltaY }))
  }
  const endLauncherDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (launcherDrag.current?.pointerId === event.pointerId) launcherDrag.current = undefined
  }
  const focusTab = (id: Tab) => {
    setTab(id)
    if (typeof document !== 'undefined') document.getElementById(`dp-tab-${id}`)?.focus?.()
  }
  const onTablistKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const ids = tabOrder.map((entry) => entry.id)
    const index = ids.indexOf(tab)
    if (event.key === 'ArrowRight') focusTab(ids[(index + 1) % ids.length]!)
    else if (event.key === 'ArrowLeft') focusTab(ids[(index - 1 + ids.length) % ids.length]!)
    else if (event.key === 'Home') focusTab(ids[0]!)
    else if (event.key === 'End') focusTab(ids[ids.length - 1]!)
  }
  const submitPendingAction = async () => {
    const action = pendingAction
    if (!action || !runId || isSubmitting) return
    submissionRun.current = runId
    setSubmitting(true)
    try {
      const accepted = await requestAction(action.buildInstruction(runId))
      // The user may have switched runs/sessions mid-flight: a late result
      // must not surface feedback for a different run.
      if (submissionRun.current !== runId) return
      setFeedback(accepted
        ? { text: `指令「${action.caption}」已进入领队行动队列。`, tone: 'ok' }
        : { text: `指令「${action.caption}」提交失败，请检查领队状态。`, tone: 'error' })
      setPendingAction(undefined)
    } catch {
      if (submissionRun.current !== runId) return
      setFeedback({ text: `指令「${action.caption}」提交异常，请稍后重试。`, tone: 'error' })
    } finally {
      if (submissionRun.current === runId) setSubmitting(false)
    }
  }
  if (!run) return null

  const accepted = tasks.filter((task) => task.status === 'completed').length
  const progress = tasks.length === 0 ? 0 : Math.round((accepted / tasks.length) * 100)
  const messages = Array.isArray(run.messages) ? run.messages.slice(-8).reverse() : []

  return <div data-dungeon-party-root>
    {!open ? <button type="button" className="dp-launcher" aria-label="打开副本面板"
      style={{ transform: `translate3d(${launcherOffset.x}px, ${launcherOffset.y}px, 0)` }}
      onPointerDown={beginLauncherDrag} onPointerMove={moveLauncherDrag} onPointerUp={endLauncherDrag} onPointerCancel={endLauncherDrag}
      onDoubleClick={() => setLauncherOffset({ x: 0, y: 0 })}
      onClick={() => { if (launcherMoved.current) launcherMoved.current = false; else setOpen(true) }}>
      <span className="dp-emblem">⚔</span>
      <span><span className="dp-launch-phase">{phaseName[run.phase] ?? run.phase}</span><br/><span className="dp-launch-title">永夜秘境 · {progress}%</span></span>
    </button> : null}
    {open ? <OverlayErrorBoundary>
      <aside className="dp-panel" role="dialog" aria-label="永夜秘境副本状态" aria-labelledby="dp-panel-title" style={{
        width: panelWidth,
        height: panelHeight,
        transform: `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`,
      }} onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        if (pendingAction) setPendingAction(undefined)
        else setOpen(false)
      }}>
        <div className="dp-resize" role="separator" aria-label="调整副本面板宽度" aria-orientation="vertical" tabIndex={0}
          aria-valuemin={300} aria-valuemax={480} aria-valuenow={panelWidth}
          onKeyDown={resizeWidthByKey}
          onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize}/>
        <div className="dp-resize-y" role="separator" aria-label="调整副本面板高度" aria-orientation="horizontal" tabIndex={0}
          aria-valuemin={380} aria-valuemax={720} aria-valuenow={panelHeight}
          onKeyDown={resizeHeightByKey}
          onPointerDown={beginHeightResize} onPointerMove={moveHeightResize} onPointerUp={endHeightResize} onPointerCancel={endHeightResize}/>
        <header className="dp-header" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
          onPointerCancel={endDrag} onDoubleClick={() => setPanelOffset({ x: 0, y: 0 })}>
          <div className="dp-header-line">
            <span className="dp-crest" aria-hidden>♜</span>
            <div style={{ minWidth: 0 }}>
              <div className="dp-eyebrow">Mythic Engineering Dungeon</div>
              <h1 className="dp-title" id="dp-panel-title">永夜堡垒 · 五人突击队</h1>
              <p className="dp-objective">首领目标：{run.objective}</p>
            </div>
            <button type="button" className="dp-close" aria-label="关闭副本面板"
              onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); setOpen(false) }}>×</button>
          </div>
          <div className="dp-progress-meta"><span>{phaseName[run.phase] ?? run.phase}</span><span>{accepted}/{tasks.length} 首领目标</span></div>
          <div className="dp-progress" role="progressbar" aria-label={`副本进度 ${progress}%`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div>
        </header>

        <nav className="dp-tabs" role="tablist" aria-label="副本面板标签" onKeyDown={onTablistKeyDown}>
          {tabOrder.map(({ id, label, ariaLabel }) => <button
            type="button" className="dp-tab" role="tab" id={`dp-tab-${id}`}
            aria-selected={tab === id} aria-controls={`dp-tabpanel-${id}`}
            data-active={tab === id} key={id} aria-label={ariaLabel} onClick={() => setTab(id)}
          >{label}</button>)}
        </nav>

        <div className="dp-content" role="tabpanel" id={`dp-tabpanel-${tab}`} aria-labelledby={`dp-tab-${tab}`} data-tab={tab}>
          {tab === 'party' ? <>
            <div className="dp-section-head"><span className="dp-section-title">团队框架</span><span className="dp-section-meta">5 PLAYER PARTY</span></div>
            <div className="dp-roster">{slots.map((slot) => {
              const member = run.slots?.[slot]
              if (!member) return null
              const identity = partyIdentity[slot]
              const meters = memberMeters(run, slot)
              const currentTask = tasks.find((task) => task.ownerSlot === slot && ['ready', 'running'].includes(task.status))
              const healerActivity = slot === 'healer' && run.phase === 'VALIDATING'
                ? `正在检定 ${Array.isArray(run.manifests) ? run.manifests.at(-1)?.criteria.length ?? 0 : 0} 项准则 · 已提交 ${Array.isArray(run.validationReports) ? run.validationReports.length : 0} 份报告`
                : undefined
              return <article className={`dp-member ${identity.className}`} data-life={member.lifeState} data-activity={member.activityState ?? 'idle'} key={slot}>
                <span className="dp-avatar" aria-hidden>{identity.glyph}</span>
                <div className="dp-member-main">
                  <div className="dp-name">{identity.name}</div>
                  <div className="dp-spec">{identity.title} · G{member.generation}</div>
                  <div className="dp-bars">
                    <span className="dp-bar" role="progressbar" aria-label={`${identity.name} 生命值`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meters.health} title={`生命值 ${meters.health}%`}><span className="dp-hp" style={{ width: `${meters.health}%` }}/></span>
                    <span className="dp-bar" role="progressbar" aria-label={`${identity.name} ${meters.resourceName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meters.resource} title={`${meters.resourceName} ${meters.resource}%`}><span className="dp-power" style={{ width: `${meters.resource}%` }}/></span>
                  </div>
                </div>
                <div className="dp-member-state"><div className="dp-role">{identity.role}</div><div className="dp-state">{meters.activityLabel} · {member.readiness ?? 'ready'}</div></div>
                <div className="dp-current">{healerActivity ?? currentTask?.workOrder?.title ?? (member.currentSessionId ? '等待任务指令' : '尚未召集')}</div>
              </article>
            })}</div>
          </> : null}

          {tab === 'quests' ? <>
            <div className="dp-section-head"><span className="dp-section-title">地下城任务日志</span><span className="dp-section-meta">{tasks.length} QUESTS</span></div>
            {tasks.length > 0 ? <div className="dp-quest-list">{tasks.map((task, index) => <TaskRow key={task.workOrder?.id ?? `task-${index}`} task={task}/>)}</div> : <div className="dp-empty"><span className="dp-empty-glyph">⌁</span>指挥官尚未发布作战任务</div>}
          </> : null}

          {tab === 'chronicle' ? <>
            <div className="dp-metrics">
              <div className="dp-metric"><strong>{Array.isArray(run.validationReports) ? run.validationReports.length : 0}</strong><span>验收报告</span></div>
              <div className="dp-metric"><strong>{run.battleResChargesRemaining}</strong><span>战斗复活</span></div>
              <div className="dp-metric"><strong>{run.commanderBattleResChargesRemaining}</strong><span>领队复活</span></div>
            </div>
            <div className="dp-section-head"><span className="dp-section-title">冒险者战报</span><span className="dp-section-meta">AUDIT LOG</span></div>
            {messages.length > 0 ? <div className="dp-timeline">{messages.map((message, index) => <div className="dp-event" key={message.messageId ?? `message-${index}`}>
              <strong>{partyIdentity[message.fromSlot]?.name ?? message.fromSlot} → {partyIdentity[message.toSlot]?.name ?? message.toSlot}</strong>
              {message.summary}<div className="dp-time">{formatTime(message.createdAt)} · {message.kind}</div>
            </div>)}</div> : <div className="dp-empty"><span className="dp-empty-glyph">☷</span>战斗尚未产生队伍通信</div>}
          </> : null}

          {tab === 'validation' ? <ValidationTab run={run}/> : null}

          {tab === 'actions' ? <>
            <div className="dp-section-head"><span className="dp-section-title">团队领队技能</span><span className="dp-section-meta">CONFIRM REQUIRED</span></div>
            <div className="dp-actions">
              {partyActions.map((action) => <button type="button" className="dp-button" key={action.id}
                aria-haspopup="dialog" aria-expanded={pendingAction?.id === action.id}
                onClick={() => { setFeedback(undefined); setPendingAction(action) }}>
                {action.label}<br/><small>{action.caption}</small>
              </button>)}
            </div>
            {pendingAction ? <div role="alertdialog" aria-modal="false" aria-labelledby="dp-confirm-title" aria-describedby="dp-confirm-desc"
              className="dp-confirm"
              onKeyDown={(event) => { if (event.key === 'Escape') setPendingAction(undefined) }}>
              <strong id="dp-confirm-title">施放团队技能？</strong>
              <p id="dp-confirm-desc">{`${pendingAction.label} — ${pendingAction.caption}（目标副本 ${runId}）`}</p>
              <div className="dp-confirm-row"><button type="button" disabled={isSubmitting} onClick={() => submitPendingAction()}>确认提交</button><button type="button" disabled={isSubmitting} onClick={() => setPendingAction(undefined)}>取消</button></div>
            </div> : null}
            {feedback ? <p className="dp-feedback" data-tone={feedback.tone} role="status">{feedback.text}</p> : null}
            <details className="dp-raw" onToggle={(event) => setRawProjectionOpen(event.currentTarget.open)}>
              <summary>开发者模式 · 原始事件投影</summary>
              {rawProjectionOpen ? <pre>{rawProjection}</pre> : null}
            </details>
          </> : null}
        </div>
      </aside>
    </OverlayErrorBoundary> : null}
  </div>
}

export const inject = ['slots', 'sessions']

function installStyles(): () => void {
  const id = 'dsh-dungeon-party/styles'
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => undefined
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-dungeon-party'
  tag.dataset.pluginCss = id
  tag.textContent = styles
  document.head.appendChild(tag)
  return () => tag.remove()
}

export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as ISessions
  ctx.effect(installStyles, 'dungeon-party styles')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dungeon-party',
    order: 20,
    inject: () => ({
      requestAction: async (instruction: string) => {
        const current = sessions.list.getSnapshot().current
        const session = current ? sessions.binding(current)?.session : undefined
        if (!session) return false
        try {
          const result = await session.prompt([{ type: 'text', text: instruction }], 'queue')
          return result.ok
        } catch {
          return false
        }
      },
    }),
  }, DungeonPartyOverlay))
}
