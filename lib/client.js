window.__ModuleLoader__.load({ id: "dsh-dungeon-party", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region client/index.tsx
const slots = [
	"tank",
	"dps-1",
	"dps-2",
	"dps-3",
	"healer"
];
const partyIdentity = {
	tank: {
		name: "守誓者 · Aegis",
		title: "秘境领队",
		glyph: "⚔",
		role: "TANK",
		className: "tank"
	},
	"dps-1": {
		name: "焰刃 · Pyra",
		title: "烈焰工程师",
		glyph: "🔥",
		role: "DPS",
		className: "dps1"
	},
	"dps-2": {
		name: "影行者 · Nyx",
		title: "暗影侦察者",
		glyph: "☾",
		role: "DPS",
		className: "dps2"
	},
	"dps-3": {
		name: "星术师 · Aster",
		title: "奥术构筑师",
		glyph: "✦",
		role: "DPS",
		className: "dps3"
	},
	healer: {
		name: "圣谕者 · Lumina",
		title: "圣光审判官",
		glyph: "✚",
		role: "HEALER",
		className: "healer"
	}
};
const phaseName = {
	FORMING: "集结队伍",
	PLANNING: "战前部署",
	PLAN_REVIEW: "作战复核",
	EXECUTING: "首领交战",
	VALIDATING: "战利品检定",
	REPAIR: "战地修整",
	COMPLETED: "秘境征服",
	FAILED: "团灭",
	CANCELLED: "撤离秘境"
};
const taskStatusName = {
	pending: "未解锁",
	ready: "可领取",
	running: "战斗中",
	completed: "已征服",
	blocked: "被阻挡",
	failed: "失败",
	"scope-violation": "越界隔离"
};
const styles = `
[data-dungeon-party-root]{--dp-gold:#d7aa52;--dp-gold-hi:#ffe4a0;--dp-ink:#07090d;--dp-panel:#10151d;--dp-line:#7c6235;--dp-muted:#9aa3b0;--dp-green:#55c96f;--dp-red:#d35050;--dp-blue:#4da6d9;--dp-purple:#9a74e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9edf3}
.dp-launcher{position:fixed;right:18px;top:16px;z-index:78;display:flex;align-items:center;gap:9px;min-height:40px;padding:5px 13px 5px 6px;border:1px solid #8b6a34;border-radius:22px;background:#111720;color:#f3ddb0;box-shadow:0 8px 28px #0009,inset 0 0 0 1px #d8ad4c22;cursor:move;touch-action:none;user-select:none;pointer-events:auto}
.dp-launcher:hover{border-color:#e2b85d;box-shadow:0 0 22px #d59b3855,0 10px 32px #000b}.dp-launcher:focus-visible,.dp-button:focus-visible,.dp-tab:focus-visible,.dp-close:focus-visible{outline:2px solid #ffd777;outline-offset:2px}
.dp-emblem{display:grid;place-items:center;width:28px;height:28px;border:1px solid #e6bd65;border-radius:50%;background:#261d11;color:#ffd77d;font-size:15px}.dp-launch-phase{font-size:10px;color:#b8a57e;text-transform:uppercase;letter-spacing:.12em}.dp-launch-title{font-size:12px;font-weight:750}
.dp-panel{position:fixed;z-index:79;top:16px;right:18px;max-width:calc(100vw - 36px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #8b6a34;border-radius:14px;background:radial-gradient(circle at 80% -20%,#3b2c1744,transparent 38%),#0c1118;box-shadow:0 24px 70px #000c,0 0 0 1px #000,inset 0 1px #f6cf7755;pointer-events:auto}
.dp-panel::before{content:"";height:3px;flex:none;background:linear-gradient(90deg,transparent,#d6a84f 20%,#ffdf8d 50%,#d6a84f 80%,transparent)}
.dp-header{padding:8px 12px 7px;border-bottom:1px solid #5e4a2c;background:#121924;cursor:move;user-select:none;touch-action:none}.dp-resize{position:absolute;z-index:2;left:-4px;top:54px;bottom:12px;width:9px;cursor:ew-resize;touch-action:none}.dp-resize::after{content:"";position:absolute;left:4px;top:42%;width:2px;height:48px;border-radius:2px;background:#9b773d88}.dp-resize:hover::after{background:#efbd61}.dp-resize-y{position:absolute;z-index:2;left:12px;right:12px;bottom:-4px;height:9px;cursor:ns-resize;touch-action:none}.dp-resize-y::after{content:"";position:absolute;left:42%;top:4px;width:48px;height:2px;border-radius:2px;background:#9b773d88}.dp-resize-y:hover::after{background:#efbd61}.dp-header-line{display:flex;align-items:flex-start;gap:12px}.dp-crest{display:grid;place-items:center;flex:none;width:36px;height:36px;border:1px solid #c99a45;border-radius:8px;background:#251c11;color:#f3c96e;font-size:25px;box-shadow:inset 0 0 18px #000}.dp-eyebrow{color:#c9a55e;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.dp-title{margin:2px 0 0;color:#fff1c9;font-family:Georgia,"Times New Roman",serif;font-size:16px;line-height:1.1;letter-spacing:.025em}.dp-objective{overflow:hidden;margin:2px 0 0;color:#aeb5c0;font-size:11px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.dp-close{margin-left:auto;border:0;background:transparent;color:#9ea5af;font-size:19px;cursor:pointer}.dp-close:hover{color:#fff}
.dp-progress-meta{display:flex;justify-content:space-between;margin-top:6px;color:#b7bdc6;font-size:10px}.dp-progress{height:5px;margin-top:6px;overflow:hidden;border:1px solid #282f39;border-radius:3px;background:#05070a}.dp-progress>span{display:block;height:100%;background:#c9a247;box-shadow:0 0 10px #e8bd57;transition:width .25s ease}
.dp-tabs{display:grid;grid-template-columns:repeat(4,1fr);flex:none;border-bottom:1px solid #383229;background:#0b0f15}.dp-tab{padding:7px 4px;border:0;border-right:1px solid #252a31;background:transparent;color:#8f98a5;font-size:10px;font-weight:800;letter-spacing:.08em;cursor:pointer}.dp-tab[data-active=true]{background:#2b211488;color:#f2c66d;box-shadow:inset 0 -2px #d9a849}.dp-tab:hover{color:#ece1ca}
.dp-content{overflow:auto;min-height:0;padding:8px;scrollbar-color:#66502d #10151d}.dp-content[data-tab=party]{display:flex;flex-direction:column;overflow:hidden}.dp-content[data-tab=party]>.dp-roster{flex:1;grid-template-rows:repeat(5,minmax(0,1fr))}.dp-section-head{display:flex;align-items:center;justify-content:space-between;margin:1px 2px 6px}.dp-section-title{color:#d4b06a;font-family:Georgia,"Times New Roman",serif;font-size:13px;font-weight:700;letter-spacing:.06em}.dp-section-meta{color:#77818e;font-size:9px;text-transform:uppercase;letter-spacing:.12em}
.dp-roster{display:grid;gap:4px;min-height:0}.dp-member{position:relative;display:grid;grid-template-columns:34px 1fr auto;gap:6px;align-items:center;min-width:0;min-height:0;overflow:hidden;padding:5px;border:1px solid #29313c;border-left:3px solid var(--class);border-radius:8px;background:#111821;box-shadow:inset 0 1px #ffffff08}.dp-member[data-life=down]{filter:grayscale(.8);opacity:.62}.dp-avatar{display:grid;place-items:center;width:30px;height:30px;border:2px solid var(--class);border-radius:50%;background:#090c11;font-size:18px;box-shadow:0 0 12px color-mix(in srgb,var(--class) 35%,transparent)}.dp-member-main{min-width:0}.dp-name{overflow:hidden;color:#f0f2f5;font-size:12px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.dp-spec{margin-top:1px;color:#8e98a5;font-size:9px;text-transform:uppercase;letter-spacing:.09em}.dp-bars{display:grid;gap:2px;margin-top:3px}.dp-bar{position:relative;height:5px;overflow:hidden;border-radius:2px;background:#05080b}.dp-bar>span{display:block;height:100%;transition:width .25s ease}.dp-hp{background:#47a65b}.dp-power{background:var(--class)}.dp-member-state{text-align:right}.dp-role{color:var(--class);font-size:8px;font-weight:900;letter-spacing:.12em}.dp-state{margin-top:2px;color:#aeb5bf;font-size:9px}.dp-current{grid-column:2/4;overflow:hidden;margin-top:-3px;color:#c6ccd5;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.dp-current::before{content:"› ";color:var(--class)}
.dp-member.tank{--class:#529ad4}.dp-member.dps1{--class:#e56c40}.dp-member.dps2{--class:#9f78db}.dp-member.dps3{--class:#4bbdc2}.dp-member.healer{--class:#60c978}
.dp-quest-list{display:grid;gap:8px}.dp-quest{position:relative;padding:10px 10px 10px 13px;border:1px solid #2a323d;border-radius:7px;background:#111821}.dp-quest::before{content:"";position:absolute;inset:8px auto 8px 0;width:2px;background:var(--quest-color,#8b949f)}.dp-quest-top{display:flex;align-items:center;gap:8px}.dp-quest-id{color:#c69d53;font:700 9px ui-monospace,monospace}.dp-quest-title{overflow:hidden;flex:1;color:#e8ebef;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.dp-badge{padding:2px 6px;border:1px solid #3b4653;border-radius:8px;color:#aeb7c2;font-size:8px}.dp-quest-detail{margin-top:6px;color:#87919e;font-size:9px}.dp-deps{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.dp-dep{padding:2px 5px;border-radius:3px;background:#272116;color:#cfaa65;font:8px ui-monospace,monospace}
.dp-empty{padding:28px 12px;text-align:center;color:#737e8b;font-size:11px}.dp-empty-glyph{display:block;margin-bottom:8px;color:#7f693d;font-size:30px}.dp-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.dp-metric{padding:10px 6px;border:1px solid #2e3742;border-radius:7px;background:#111821;text-align:center}.dp-metric strong{display:block;color:#f0cc80;font-family:Georgia,serif;font-size:19px}.dp-metric span{color:#818b98;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.dp-timeline{display:grid;gap:0}.dp-event{position:relative;margin-left:7px;padding:0 0 13px 17px;border-left:1px solid #3a424d;color:#aab2bd;font-size:10px;line-height:1.45}.dp-event::before{content:"";position:absolute;left:-4px;top:3px;width:7px;height:7px;border:1px solid #d2a44f;border-radius:50%;background:#161c24}.dp-event strong{display:block;color:#e0e4e9;font-size:10px}.dp-time{color:#687381;font:8px ui-monospace,monospace}
.dp-actions{display:grid;gap:8px}.dp-button{min-height:38px;padding:8px 10px;border:1px solid #675333;border-radius:7px;background:#19160f;color:#d9bd83;font-size:10px;font-weight:700;text-align:left;cursor:pointer}.dp-button:hover{border-color:#bf9345;background:#282014;color:#ffe0a0}.dp-confirm{margin-top:10px;padding:11px;border:1px solid #a77938;border-radius:8px;background:#21190f;color:#d8c39d;font-size:10px}.dp-confirm strong{color:#ffcf74}.dp-confirm-row{display:flex;gap:7px;margin-top:9px}.dp-confirm-row button{padding:6px 10px;border:1px solid #715933;border-radius:5px;background:#171b21;color:#d8dce2;font-size:9px;cursor:pointer}.dp-feedback{color:#79c58b;font-size:10px}.dp-raw{margin-top:12px;color:#89939f;font-size:10px}.dp-raw pre{max-height:240px;overflow:auto;padding:8px;background:#05070a;font-size:8px}
@media(max-width:720px){.dp-panel{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important;max-height:none;transform:none!important}.dp-resize,.dp-resize-y{display:none}.dp-launcher{right:9px;top:9px}.dp-title{font-size:17px}}
@media(prefers-reduced-motion:reduce){.dp-progress>span,.dp-bar>span{transition:none}}
`;
/** Percent bars are keyed by the real domain states so phantom keys fail loudly. */
const lifePercentMap = {
	alive: 100,
	down: 0,
	"permanently-dead": 0,
	"resurrection-requested": 20,
	resurrecting: 46
};
const activityPercentMap = {
	idle: 34,
	queued: 56,
	running: 88,
	waiting: 56,
	stopped: 12
};
function lifePercent(lifeState) {
	return lifePercentMap[lifeState ?? "alive"] ?? 100;
}
function activityPercent(activityState) {
	return activityPercentMap[activityState ?? "idle"] ?? 34;
}
function TaskRow({ task }) {
	const dependencies = task.workOrder.blockedBy;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
		className: "dp-quest",
		style: { "--quest-color": task.status === "completed" ? "#55c96f" : task.status === "running" ? "#d7aa52" : "#697482" },
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dp-quest-top",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dp-quest-id",
						children: task.workOrder.id
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						className: "dp-quest-title",
						children: task.workOrder.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dp-badge",
						children: taskStatusName[task.status] ?? task.status
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dp-quest-detail",
				children: [
					task.ownerSlot ? partyIdentity[task.ownerSlot].name : "尚未分派",
					" · ",
					task.workOrder.priority.toUpperCase(),
					" · Scope ",
					task.workOrder.writeScopes.join(", ") || "只读"
				]
			}),
			dependencies.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dp-deps",
				children: dependencies.map((dependency) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dp-dep",
					children: ["↳ ", dependency]
				}, dependency))
			}) : null
		]
	});
}
function DungeonPartyOverlay({ useSessions, requestAction }) {
	const run = useSessions((state) => state.current ? state.byId[state.current]?.projectionValues?.["dungeon-party"] ?? null : null);
	const [open, setOpen] = (0, react.useState)(true);
	const [tab, setTab] = (0, react.useState)("party");
	const [pendingInstruction, setPendingInstruction] = (0, react.useState)();
	const [feedback, setFeedback] = (0, react.useState)();
	const [isSubmitting, setSubmitting] = (0, react.useState)(false);
	const [panelWidth, setPanelWidth] = (0, react.useState)(348);
	const [panelHeight, setPanelHeight] = (0, react.useState)(640);
	const [panelOffset, setPanelOffset] = (0, react.useState)({
		x: 0,
		y: 0
	});
	const [launcherOffset, setLauncherOffset] = (0, react.useState)({
		x: 0,
		y: 0
	});
	const drag = (0, react.useRef)();
	const launcherDrag = (0, react.useRef)();
	const launcherMoved = (0, react.useRef)(false);
	const resize = (0, react.useRef)();
	const heightResize = (0, react.useRef)();
	const tasks = (0, react.useMemo)(() => run ? Object.values(run.tasks) : [], [run]);
	const beginDrag = (event) => {
		if (event.button !== 0) return;
		drag.current = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
			...panelOffset
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const moveDrag = (event) => {
		const active = drag.current;
		if (!active || active.pointerId !== event.pointerId) return;
		setPanelOffset({
			x: active.x + event.clientX - active.clientX,
			y: active.y + event.clientY - active.clientY
		});
	};
	const endDrag = (event) => {
		if (drag.current?.pointerId === event.pointerId) drag.current = void 0;
	};
	const beginResize = (event) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		resize.current = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			width: panelWidth
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const moveResize = (event) => {
		const active = resize.current;
		if (!active || active.pointerId !== event.pointerId) return;
		setPanelWidth(Math.min(480, Math.max(300, active.width + active.clientX - event.clientX)));
	};
	const endResize = (event) => {
		if (resize.current?.pointerId === event.pointerId) resize.current = void 0;
	};
	const beginHeightResize = (event) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		heightResize.current = {
			pointerId: event.pointerId,
			clientY: event.clientY,
			height: panelHeight
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const moveHeightResize = (event) => {
		const active = heightResize.current;
		if (!active || active.pointerId !== event.pointerId) return;
		setPanelHeight(Math.min(720, Math.max(380, active.height + event.clientY - active.clientY)));
	};
	const endHeightResize = (event) => {
		if (heightResize.current?.pointerId === event.pointerId) heightResize.current = void 0;
	};
	const beginLauncherDrag = (event) => {
		if (event.button !== 0) return;
		launcherMoved.current = false;
		launcherDrag.current = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
			...launcherOffset
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const moveLauncherDrag = (event) => {
		const active = launcherDrag.current;
		if (!active || active.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - active.clientX;
		const deltaY = event.clientY - active.clientY;
		if (Math.abs(deltaX) + Math.abs(deltaY) > 3) launcherMoved.current = true;
		setLauncherOffset({
			x: active.x + deltaX,
			y: active.y + deltaY
		});
	};
	const endLauncherDrag = (event) => {
		if (launcherDrag.current?.pointerId === event.pointerId) launcherDrag.current = void 0;
	};
	if (!run) return null;
	const accepted = tasks.filter((task) => task.status === "completed").length;
	const progress = tasks.length === 0 ? 0 : Math.round(accepted / tasks.length * 100);
	const messages = run.messages.slice(-8).reverse();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-dungeon-party-root": true,
		children: [!open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dp-launcher",
			"aria-label": "打开副本面板",
			style: { transform: `translate3d(${launcherOffset.x}px, ${launcherOffset.y}px, 0)` },
			onPointerDown: beginLauncherDrag,
			onPointerMove: moveLauncherDrag,
			onPointerUp: endLauncherDrag,
			onPointerCancel: endLauncherDrag,
			onDoubleClick: () => setLauncherOffset({
				x: 0,
				y: 0
			}),
			onClick: () => {
				if (launcherMoved.current) launcherMoved.current = false;
				else setOpen(true);
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dp-emblem",
				children: "⚔"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dp-launch-phase",
					children: phaseName[run.phase] ?? run.phase
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dp-launch-title",
					children: [
						"永夜秘境 · ",
						progress,
						"%"
					]
				})
			] })]
		}) : null, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
			className: "dp-panel",
			role: "dialog",
			"aria-label": "永夜秘境副本状态",
			style: {
				width: panelWidth,
				height: panelHeight,
				transform: `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dp-resize",
					role: "separator",
					"aria-label": "调整副本面板宽度",
					"aria-orientation": "vertical",
					onPointerDown: beginResize,
					onPointerMove: moveResize,
					onPointerUp: endResize,
					onPointerCancel: endResize
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dp-resize-y",
					role: "separator",
					"aria-label": "调整副本面板高度",
					"aria-orientation": "horizontal",
					onPointerDown: beginHeightResize,
					onPointerMove: moveHeightResize,
					onPointerUp: endHeightResize,
					onPointerCancel: endHeightResize
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dp-header",
					onPointerDown: beginDrag,
					onPointerMove: moveDrag,
					onPointerUp: endDrag,
					onPointerCancel: endDrag,
					onDoubleClick: () => setPanelOffset({
						x: 0,
						y: 0
					}),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dp-header-line",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-crest",
									"aria-hidden": true,
									children: "♜"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { minWidth: 0 },
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "dp-eyebrow",
											children: "Mythic Engineering Dungeon"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
											className: "dp-title",
											children: "永夜堡垒 · 五人突击队"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: "dp-objective",
											children: ["首领目标：", run.objective]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dp-close",
									"aria-label": "关闭副本面板",
									onPointerDown: (event) => event.stopPropagation(),
									onPointerUp: (event) => event.stopPropagation(),
									onClick: (event) => {
										event.stopPropagation();
										setOpen(false);
									},
									children: "×"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dp-progress-meta",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: phaseName[run.phase] ?? run.phase }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								accepted,
								"/",
								tasks.length,
								" 首领目标"
							] })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dp-progress",
							"aria-label": `副本进度 ${progress}%`,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: `${progress}%` } })
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
					className: "dp-tabs",
					"aria-label": "副本面板标签",
					children: [
						["party", "队伍"],
						["quests", "任务"],
						["chronicle", "战报"],
						["actions", "指挥"]
					].map(([id, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dp-tab",
						"data-active": tab === id,
						onClick: () => setTab(id),
						children: label
					}, id))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dp-content",
					"data-tab": tab,
					children: [
						tab === "party" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dp-section-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dp-section-title",
								children: "团队框架"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dp-section-meta",
								children: "5 PLAYER PARTY"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dp-roster",
							children: slots.map((slot) => {
								const member = run.slots[slot];
								const identity = partyIdentity[slot];
								const currentTask = tasks.find((task) => task.ownerSlot === slot && ["ready", "running"].includes(task.status));
								const healerActivity = slot === "healer" && run.phase === "VALIDATING" ? `正在检定 ${run.manifests.at(-1)?.criteria.length ?? 0} 项准则 · 已提交 ${run.validationReports.length} 份报告` : void 0;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									className: `dp-member ${identity.className}`,
									"data-life": member.lifeState,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dp-avatar",
											"aria-hidden": true,
											children: identity.glyph
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dp-member-main",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "dp-name",
													children: identity.name
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dp-spec",
													children: [
														identity.title,
														" · G",
														member.generation
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dp-bars",
													"aria-label": `${identity.name} 状态`,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dp-bar",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dp-hp",
															style: { width: `${lifePercent(member.lifeState)}%` }
														})
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dp-bar",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dp-power",
															style: { width: `${activityPercent(member.activityState)}%` }
														})
													})]
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dp-member-state",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dp-role",
												children: identity.role
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dp-state",
												children: [
													member.lifeState ?? "alive",
													" · ",
													member.readiness ?? "ready"
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "dp-current",
											children: healerActivity ?? currentTask?.workOrder.title ?? (member.currentSessionId ? "等待任务指令" : "尚未召集")
										})
									]
								}, slot);
							})
						})] }) : null,
						tab === "quests" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dp-section-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dp-section-title",
								children: "地下城任务日志"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dp-section-meta",
								children: [tasks.length, " QUESTS"]
							})]
						}), tasks.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dp-quest-list",
							children: tasks.map((task) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskRow, { task }, task.workOrder.id))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dp-empty",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dp-empty-glyph",
								children: "⌁"
							}), "指挥官尚未发布作战任务"]
						})] }) : null,
						tab === "chronicle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dp-metrics",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dp-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: run.validationReports.length }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "验收报告" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dp-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: run.battleResChargesRemaining }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "战斗复活" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dp-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: run.commanderBattleResChargesRemaining }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "领队复活" })]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dp-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-section-title",
									children: "冒险者战报"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-section-meta",
									children: "AUDIT LOG"
								})]
							}),
							messages.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dp-timeline",
								children: messages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dp-event",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
											partyIdentity[message.fromSlot].name,
											" → ",
											partyIdentity[message.toSlot].name
										] }),
										message.summary,
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dp-time",
											children: [
												message.createdAt,
												" · ",
												message.kind
											]
										})
									]
								}, message.messageId))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dp-empty",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-empty-glyph",
									children: "☷"
								}), "战斗尚未产生队伍通信"]
							})
						] }) : null,
						tab === "actions" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dp-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-section-title",
									children: "团队领队技能"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dp-section-meta",
									children: "CONFIRM REQUIRED"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dp-actions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dp-button",
										onClick: () => setPendingInstruction("请检查所有疑似停滞的 DPS，按副本协议请求 lease-bound checkpoint，并根据证据决定缩小任务、中断或重派。"),
										children: [
											"⌛ 请求停滞检查",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "检查失去响应的输出成员与任务租约" })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dp-button",
										onClick: () => setPendingInstruction("请检查验收奶 readiness；若其 degraded 但仍响应，请调用 party_direct_recovery 指示原 Session 自我稳定。"),
										children: [
											"✚ 指示奶自我稳定",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "恢复圣谕者的独立验收能力" })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dp-button",
										onClick: () => setPendingInstruction("请检查 commanderLoad 和待决策队列；若承压，请暂停新派工并先清理关键决策，然后安全恢复派工。"),
										children: [
											"♜ 处理指挥承压",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "暂停派遣并清理关键决策队列" })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dp-button",
										onClick: () => setPendingInstruction(`网络中断后继续当前副本：请调用 party_recover，runId=${run.id}，action=continue；从持久状态恢复全部已绑定成员并继续调度。`),
										children: [
											"↻ 继续当前副本",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "断线或团灭后从持久进度恢复" })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dp-button",
										onClick: () => setPendingInstruction(`放弃当前副本并重新开始：请调用 party_recover，runId=${run.id}，action=restart；保留目标和工作区但创建全新 run。`),
										children: [
											"⚑ 重开副本",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "终止本次进度并创建新的队伍" })
										]
									})
								]
							}),
							pendingInstruction ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "alertdialog",
								"aria-label": "确认副本操作",
								className: "dp-confirm",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "施放团队技能？" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: pendingInstruction }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dp-confirm-row",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: isSubmitting,
											onClick: async () => {
												setSubmitting(true);
												try {
													setFeedback(await requestAction(pendingInstruction) ? "指令已进入领队行动队列。" : "指令提交失败，请检查领队状态。");
													setPendingInstruction(void 0);
												} finally {
													setSubmitting(false);
												}
											},
											children: "确认提交"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: isSubmitting,
											onClick: () => setPendingInstruction(void 0),
											children: "取消"
										})]
									})
								]
							}) : null,
							feedback ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dp-feedback",
								role: "status",
								children: feedback
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: "dp-raw",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "开发者模式 · 原始事件投影" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(run, null, 2) })]
							})
						] }) : null
					]
				})
			]
		}) : null]
	});
}
const inject = ["slots", "sessions"];
function installStyles() {
	const id = "dsh-dungeon-party/styles";
	if (document.querySelector(`style[data-plugin-css="${id}"]`)) return () => void 0;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-dungeon-party";
	tag.dataset.pluginCss = id;
	tag.textContent = styles;
	document.head.appendChild(tag);
	return () => tag.remove();
}
function apply(ctx) {
	const sessions = ctx.sessions;
	ctx.effect(installStyles, "dungeon-party styles");
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "dungeon-party",
		order: 20,
		inject: () => ({ requestAction: async (instruction) => {
			const current = sessions.list.getSnapshot().current;
			const session = current ? sessions.binding(current)?.session : void 0;
			if (!session) return false;
			return (await session.prompt([{
				type: "text",
				text: instruction
			}], "queue")).ok;
		} })
	}, DungeonPartyOverlay));
}

//#endregion
exports.DungeonPartyOverlay = DungeonPartyOverlay;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map