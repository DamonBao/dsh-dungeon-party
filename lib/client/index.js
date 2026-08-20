import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region client/index.tsx
const slots = [
	"tank",
	"dps-1",
	"dps-2",
	"dps-3",
	"healer"
];
const roleNames = {
	tank: "指挥 T",
	"dps-1": "DPS 1",
	"dps-2": "DPS 2",
	"dps-3": "DPS 3",
	healer: "验收奶"
};
const panelStyle = {
	position: "fixed",
	inset: 24,
	zIndex: 80,
	overflow: "auto",
	padding: 24,
	borderRadius: 18,
	border: "1px solid color-mix(in srgb, CanvasText 18%, transparent)",
	background: "color-mix(in srgb, Canvas 96%, transparent)",
	color: "CanvasText",
	boxShadow: "0 24px 80px rgba(0,0,0,.35)",
	pointerEvents: "auto"
};
function TaskRow({ task }) {
	return /* @__PURE__ */ jsxs("li", {
		style: {
			padding: "10px 0",
			borderBottom: "1px solid color-mix(in srgb, CanvasText 12%, transparent)"
		},
		children: [
			/* @__PURE__ */ jsx("strong", { children: task.workOrder.title }),
			" · ",
			task.status,
			" · ",
			task.ownerSlot ?? "未分配",
			/* @__PURE__ */ jsxs("div", {
				style: {
					opacity: .72,
					fontSize: 12
				},
				children: [
					"Scope: ",
					task.workOrder.writeScopes.join(", ") || "无",
					" · 优先级: ",
					task.workOrder.priority
				]
			})
		]
	});
}
function DungeonPartyOverlay({ useSessions, requestAction }) {
	const run = useSessions((state) => state.current ? state.byId[state.current]?.projectionValues?.["dungeon-party"] ?? null : null);
	const [open, setOpen] = useState(false);
	const [pendingInstruction, setPendingInstruction] = useState();
	const [feedback, setFeedback] = useState();
	const [isSubmitting, setSubmitting] = useState(false);
	if (!run) return null;
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("button", {
		type: "button",
		"aria-label": "打开副本面板",
		onClick: () => setOpen(true),
		style: {
			position: "fixed",
			top: 14,
			right: 16,
			zIndex: 70,
			pointerEvents: "auto",
			border: "1px solid color-mix(in srgb, CanvasText 18%, transparent)",
			borderRadius: 999,
			padding: "7px 12px",
			background: "Canvas",
			color: "CanvasText",
			cursor: "pointer"
		},
		children: ["副本 · ", run.phase]
	}), open ? /* @__PURE__ */ jsxs("section", {
		role: "dialog",
		"aria-modal": "true",
		"aria-label": "副本状态",
		style: panelStyle,
		children: [
			/* @__PURE__ */ jsxs("header", {
				style: {
					display: "flex",
					alignItems: "start",
					justifyContent: "space-between",
					gap: 16
				},
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("h1", {
					style: { margin: 0 },
					children: ["五人本 · ", run.phase]
				}), /* @__PURE__ */ jsx("p", {
					style: {
						marginTop: 6,
						opacity: .72
					},
					children: run.objective
				})] }), /* @__PURE__ */ jsx("button", {
					type: "button",
					"aria-label": "关闭副本面板",
					onClick: () => setOpen(false),
					children: "关闭"
				})]
			}),
			/* @__PURE__ */ jsx("h2", { children: "队伍" }),
			/* @__PURE__ */ jsx("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
					gap: 12
				},
				children: slots.map((slot) => {
					const member = run.slots[slot];
					const task = Object.values(run.tasks).find((item) => item.ownerSlot === slot && item.status === "running");
					return /* @__PURE__ */ jsxs("article", {
						style: {
							padding: 14,
							borderRadius: 12,
							border: "1px solid color-mix(in srgb, CanvasText 14%, transparent)"
						},
						children: [
							/* @__PURE__ */ jsx("strong", { children: roleNames[slot] }),
							/* @__PURE__ */ jsxs("div", { children: [
								member.lifeState,
								" · ",
								member.readiness
							] }),
							/* @__PURE__ */ jsxs("small", { children: [
								"generation ",
								member.generation,
								" · ",
								member.activityState
							] }),
							/* @__PURE__ */ jsx("div", {
								style: { marginTop: 8 },
								children: task?.workOrder.title ?? "当前无任务"
							})
						]
					}, slot);
				})
			}),
			/* @__PURE__ */ jsx("h2", { children: "任务" }),
			/* @__PURE__ */ jsx("ul", {
				style: {
					listStyle: "none",
					padding: 0
				},
				children: Object.values(run.tasks).map((task) => /* @__PURE__ */ jsx(TaskRow, { task }, task.workOrder.id))
			}),
			/* @__PURE__ */ jsx("h2", { children: "验收与战复" }),
			/* @__PURE__ */ jsxs("p", { children: [
				"验收报告 ",
				run.validationReports.length,
				" 份 · 战复剩余 ",
				run.battleResChargesRemaining,
				" · 指挥战复剩余 ",
				run.commanderBattleResChargesRemaining
			] }),
			/* @__PURE__ */ jsx("h2", { children: "承压与恢复" }),
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8
				},
				children: [
					/* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setPendingInstruction("请检查所有疑似停滞的 DPS，按副本协议请求 lease-bound checkpoint，并根据证据决定缩小任务、中断或重派。"),
						children: "请求停滞检查"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setPendingInstruction("请检查验收奶 readiness；若其 degraded 但仍响应，请调用 party_direct_recovery 指示原 Session 自我稳定。"),
						children: "指示奶自我稳定"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setPendingInstruction("请检查 commanderLoad 和待决策队列；若承压，请暂停新派工并先清理关键决策，然后安全恢复派工。"),
						children: "处理指挥承压"
					})
				]
			}),
			pendingInstruction ? /* @__PURE__ */ jsxs("div", {
				role: "alertdialog",
				"aria-label": "确认副本操作",
				style: {
					marginTop: 12,
					padding: 12,
					border: "1px solid currentColor",
					borderRadius: 10
				},
				children: [
					/* @__PURE__ */ jsx("strong", { children: "确认影响" }),
					/* @__PURE__ */ jsx("p", { children: pendingInstruction }),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: isSubmitting,
						onClick: async () => {
							setSubmitting(true);
							try {
								setFeedback(await requestAction(pendingInstruction) ? "已提交给当前指挥 Session。" : "提交失败，请查看当前 Session 状态。");
								setPendingInstruction(void 0);
							} finally {
								setSubmitting(false);
							}
						},
						children: "确认提交"
					}),
					" ",
					/* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: isSubmitting,
						onClick: () => setPendingInstruction(void 0),
						children: "取消"
					})
				]
			}) : null,
			feedback ? /* @__PURE__ */ jsx("p", {
				role: "status",
				children: feedback
			}) : null,
			/* @__PURE__ */ jsxs("details", { children: [/* @__PURE__ */ jsx("summary", { children: "原始状态与事件证据" }), /* @__PURE__ */ jsx("pre", {
				style: {
					overflow: "auto",
					fontSize: 11
				},
				children: JSON.stringify(run, null, 2)
			})] })
		]
	}) : null] });
}
const inject = ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-layout"];
function apply(ctx) {
	const sessions = ctx.sessions;
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
export { DungeonPartyOverlay, apply, inject };