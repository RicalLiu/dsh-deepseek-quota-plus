// dsh-deepseek-quota-plus — browser half.
//
// 一体化 UI:入口放在输入工具行右侧(conversation.input.right,低调徽标按钮,
// 悬停才显示背景),输入框下方 composer dock 显示今日消费/会话成本读条,
// 点击入口在右下角 shell.overlay 弹出完整面板(余额明细、充值/用量/发票跳转、
// 可选的平台 userToken 配置)。样式全部使用 webUI 官方 --dsw-alias-* token,
// 自动跟随明暗主题。
//
// 基于 yingjunnan/dsh-deepseek-quota lib/client.js(MIT)重构,UI 布局改为
// 工具行入口形态(参考 dsh-balance-plugin),并新增平台 token 保存交互。
window.__ModuleLoader__.load({
	id: "dsh-deepseek-quota-plus",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		const { useState, useEffect, useCallback, useRef } = react;
		const { jsx, jsxs, Fragment } = jsxRuntime;

		// ---- constants -------------------------------------------------
		const POLL_MS = 60 * 1000;
		const COST_POLL_MS = 5 * 1000;
		const BALANCE_PATH = "/api/deepseek-balance";
		const SESSION_COST_PATH = "/api/deepseek-session-cost";
		const SET_TOKEN_PATH = "/api/deepseek-set-platform-token";

		// ---- small helpers ---------------------------------------------
		function currencySymbol(code) {
			switch (code) {
				case "CNY": return "¥";
				case "USD": return "$";
				case "EUR": return "€";
				case "JPY": return "¥";
				case "HKD": return "HK$";
				default: return code ? `${code} ` : "";
			}
		}

		function formatBalance(value, currency) {
			const symbol = currencySymbol(currency);
			return `${symbol}${String(value)}`;
		}

		// 费用展示:按量级选择小数位,避免 ¥0.000000… 长尾(参考 dsh-web-billing)。
		function formatCost(value, currency) {
			const symbol = currencySymbol(currency);
			if (!Number.isFinite(value) || value <= 0) return `${symbol}0`;
			if (value >= 100) return `${symbol}${value.toFixed(0)}`;
			if (value >= 1) return `${symbol}${value.toFixed(2)}`;
			if (value >= 0.01) return `${symbol}${value.toFixed(3)}`;
			return `${symbol}${value.toPrecision(2)}`;
		}

		// 千分位格式化 token 数。
		function formatTokens(value) {
			return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		// 单价展示(¥/M,CNY 计价)。
		function formatRate(rate) {
			const n = rate >= 1 ? rate.toFixed(2) : rate.toFixed(3);
			return `¥${n}/M`;
		}

		function formatTime(date) {
			const hh = String(date.getHours()).padStart(2, "0");
			const mm = String(date.getMinutes()).padStart(2, "0");
			const ss = String(date.getSeconds()).padStart(2, "0");
			return `${hh}:${mm}:${ss}`;
		}

		async function fetchBalance() {
			const res = await fetch(BALANCE_PATH, { cache: "no-store" });
			let body = null;
			try {
				body = await res.json();
			} catch {}
			if (!res.ok || !body || body.ok !== true) {
				const message =
					body && typeof body.message === "string"
						? body.message
						: `请求失败(HTTP ${res.status})`;
				const error = new Error(message);
				error.code = body && typeof body.error === "string" ? body.error : `http-${res.status}`;
				throw error;
			}
			return body;
		}

		async function fetchSessionCost(sessionId) {
			const res = await fetch(`${SESSION_COST_PATH}?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
			try {
				return await res.json();
			} catch {
				return null;
			}
		}

		async function savePlatformToken(token) {
			const res = await fetch(SET_TOKEN_PATH, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token })
			});
			try {
				return await res.json();
			} catch {
				return { ok: false, message: `HTTP ${res.status}` };
			}
		}

		// ---- shared panel visibility (module-level, both slots read it) --
		let panelVisible = false;
		const panelListeners = new Set();
		function setPanel(value) {
			panelVisible = !!value;
			for (const fn of panelListeners) fn(panelVisible);
		}
		function subscribePanel(fn) {
			panelListeners.add(fn);
			return () => panelListeners.delete(fn);
		}

		// ---- theme-aware inline styles ----------------------------------
		const entryStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			height: 24,
			padding: "0 8px",
			borderRadius: 6,
			border: 0,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			lineHeight: 1,
			cursor: "pointer",
			transition: "background .15s ease, color .15s ease",
			fontFamily: "inherit"
		};
		const entryHoverStyle = {
			...entryStyle,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)"
		};

		const panelStyle = {
			position: "fixed",
			right: 14,
			bottom: 58,
			width: 284,
			boxSizing: "border-box",
			borderRadius: 10,
			padding: "12px 14px",
			background: "var(--dsw-alias-bg-overlay)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l1)",
			boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
			fontSize: 12.5,
			lineHeight: "18px",
			zIndex: 60,
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
		};
		const panelHeadStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			marginBottom: 6,
			fontWeight: 600,
			fontSize: 13
		};
		const balanceStyle = {
			fontSize: 22,
			lineHeight: "30px",
			fontWeight: 700,
			margin: "2px 0 8px",
			fontVariantNumeric: "tabular-nums"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "baseline",
			justifyContent: "space-between",
			padding: "2px 0",
			color: "var(--dsw-alias-label-secondary)",
			fontVariantNumeric: "tabular-nums"
		};
		const rowValueStyle = {
			color: "var(--dsw-alias-label-primary)",
			fontWeight: 600
		};
		const actionsStyle = {
			display: "flex",
			gap: 6,
			marginTop: 10
		};
		const actionBtnStyle = {
			flex: 1,
			textAlign: "center",
			padding: "5px 6px",
			borderRadius: 6,
			textDecoration: "none",
			fontSize: 12,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l1)",
			cursor: "pointer"
		};
		const actionPrimaryStyle = {
			...actionBtnStyle,
			background: "var(--dsw-alias-brand-primary)",
			color: "#fff",
			borderColor: "transparent"
		};
		const closeBtnStyle = {
			background: "none",
			border: 0,
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer",
			fontSize: 13,
			padding: "0 4px"
		};
		const errorTextStyle = {
			color: "var(--dsw-alias-state-error-primary)",
			fontSize: 12,
			marginTop: 6,
			wordBreak: "break-all"
		};
		const tipStyle = {
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			marginTop: 8
		};
		const tokenInputStyle = {
			width: "100%",
			boxSizing: "border-box",
			marginTop: 4,
			padding: "4px 6px",
			fontSize: 12,
			borderRadius: 6,
			border: "1px solid var(--dsw-alias-border-l1)",
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit"
		};
		const dockStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)"
		};
		const dockDotStyle = {
			flex: "none",
			width: 7,
			height: 7,
			borderRadius: "50%",
			background: "var(--dsw-alias-state-success-primary)"
		};

		// ---- shared data hook ------------------------------------------
		function useBalance() {
			const [summary, setSummary] = useState(null);
			const load = useCallback(async () => {
				try {
					const result = await fetchBalance();
					setSummary(result);
				} catch (error) {
					setSummary({ ok: false, error: error.code || "error", message: error.message });
				}
			}, []);
			useEffect(() => {
				load();
				const timer = setInterval(load, POLL_MS);
				return () => clearInterval(timer);
			}, [load]);
			return { summary, refresh: load };
		}

		function useSessionCost(sessionId) {
			const [cost, setCost] = useState(null);
			useEffect(() => {
				if (sessionId === void 0 || sessionId === "") {
					setCost(null);
					return;
				}
				let cancelled = false;
				const load = async () => {
					const body = await fetchSessionCost(sessionId);
					if (!cancelled && body && body.ok === true) setCost(body);
				};
				load();
				const timer = setInterval(load, COST_POLL_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId]);
			return cost;
		}

		// ---- ② 工具行入口:conversation.input.right ---------------------
		function QuotaEntry(props) {
			const { summary, refresh } = useBalance();
			const [open, setOpen] = useState(false);
			const [hover, setHover] = useState(false);
			useEffect(() => subscribePanel(setOpen), []);
			const b = summary && summary.ok ? summary.balance : null;
			const total = b && b.totalBalance !== null && b.totalBalance !== undefined ? Number(b.totalBalance) : NaN;
			let label = "💰";
			let title = "DeepSeek 额度";
			if (Number.isFinite(total)) {
				label = `${currencySymbol(b.currency)} ${total.toFixed(2)}`;
				title = `DeepSeek 余额 ${formatBalance(total.toFixed(2), b.currency)} · 点击查看详情`;
			} else if (summary && summary.message) {
				title = `DeepSeek 额度:${summary.message}`;
			}
			return jsx("button", {
				type: "button",
				style: hover ? entryHoverStyle : entryStyle,
				"aria-label": "DeepSeek 额度",
				title,
				onClick: () => { setPanel(!panelVisible); },
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				children: label
			});
		}

		// ---- ① 常驻读条:conversation.composer.dock ----------------------
		function QuotaDock(props) {
			const sessionId = props.sessionId || "";
			const { summary } = useBalance();
			const cost = useSessionCost(sessionId);
			const text = [];
			let low = false;
			if (summary && summary.ok) {
				const b = summary.balance;
				const total = b && b.totalBalance !== null && b.totalBalance !== undefined ? Number(b.totalBalance) : NaN;
				if (Number.isFinite(total) && total < 20) low = true;
				if (summary.todayConsumed !== null && summary.todayConsumed !== undefined) {
					const prefix = summary.todayConsumedSource === "official" ? "" : "≈";
					text.push(`今日 ${prefix}${currencySymbol(b ? b.currency : "CNY")}${Number(summary.todayConsumed).toFixed(2)}`);
				}
			} else if (summary && summary.message) {
				text.push(`额度:${summary.message}`);
			} else {
				text.push("额度加载中…");
			}
			if (cost && cost.cost !== null && cost.cost !== undefined) {
				text.push(`本会话 ${currencySymbol("CNY")}${Number(cost.cost).toFixed(3)}`);
			}
			if (text.length === 0) return null;
			return jsx("span", {
				title: "DeepSeek 额度",
				style: dockStyle,
				children: jsxs(Fragment, {
					children: [
						jsx("span", { "aria-hidden": true, style: { ...dockDotStyle, ...(low ? { background: "var(--dsw-alias-state-error-primary)" } : {}) } }),
						jsx("span", { children: text.join(" · ") })
					]
				})
			});
		}

		// ---- ③ 完整面板:shell.overlay -----------------------------------
		function QuotaPanel(props) {
			const { summary, refresh } = useBalance();
			const [visible, setVisible] = useState(false);
			const [tokenDraft, setTokenDraft] = useState("");
			const [saveMsg, setSaveMsg] = useState(null);
			useEffect(() => subscribePanel(setVisible), []);
			const useSessions = props.useSessions;
			const currentSessionId = typeof useSessions === "function" ? useSessions((s) => s.current) : void 0;
			const cost = useSessionCost(currentSessionId);
			if (!visible) return null;
			const saveToken = async () => {
				setSaveMsg(null);
				const r = await savePlatformToken(tokenDraft);
				setSaveMsg(r && r.ok ? "已保存 ✓" : `保存失败:${r && r.message ? r.message : ""}`);
				if (r && r.ok) refresh();
			};
			const children = [];
			children.push(jsxs("div", {
				style: panelHeadStyle,
				children: [
					jsx("span", { children: "DeepSeek 额度" }),
					jsx("button", { type: "button", style: closeBtnStyle, title: "关闭", onClick: () => setPanel(false), children: "✕" })
				]
			}));
			if (summary && summary.ok) {
				const b = summary.balance || {};
				const total = b.totalBalance !== null && b.totalBalance !== undefined ? Number(b.totalBalance) : NaN;
				const currency = b.currency || "CNY";
				children.push(jsxs("div", {
					style: balanceStyle,
					children: [
						Number.isFinite(total) ? `${currencySymbol(currency)} ${total.toFixed(2)}` : "—",
						jsx("span", {
							style: {
								fontSize: 12,
								fontWeight: 400,
								marginLeft: 8,
								color: b.is_available ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"
							},
							children: b.is_available ? "● 可用" : "● 不可用"
						})
					]
				}));
				children.push(jsxs("div", {
					style: rowStyle,
					children: [
						jsx("span", { children: "充值余额" }),
						jsx("span", { style: rowValueStyle, children: b.toppedUpBalance !== null && b.toppedUpBalance !== undefined ? `${currencySymbol(currency)} ${Number(b.toppedUpBalance).toFixed(2)}` : "—" })
					]
				}));
				children.push(jsxs("div", {
					style: rowStyle,
					children: [
						jsx("span", { children: "赠送余额" }),
						jsx("span", { style: rowValueStyle, children: b.grantedBalance !== null && b.grantedBalance !== undefined ? `${currencySymbol(currency)} ${Number(b.grantedBalance).toFixed(2)}` : "—" })
					]
				}));
				if (cost && cost.cost !== null && cost.cost !== undefined) {
					children.push(jsxs("div", {
						style: rowStyle,
						children: [
							jsx("span", { children: "本会话费用" }),
							jsx("span", { style: rowValueStyle, children: `${formatCost(cost.cost, "CNY")} ${cost.source === "log" ? "" : "(实时)"}` })
						]
					}));
				}
				const consumedText = summary.todayConsumed !== null && summary.todayConsumed !== undefined
					? `${summary.todayConsumedSource === "official" ? "" : "≈"}${currencySymbol(currency)} ${Number(summary.todayConsumed).toFixed(2)}`
					: "—";
				children.push(jsxs("div", {
					style: rowStyle,
					children: [
						jsx("span", { children: "今日消费" }),
						jsx("span", {
							style: rowValueStyle,
							children: [
								consumedText,
								jsx("span", {
									style: { fontSize: 10, marginLeft: 4, opacity: 0.7 },
									children: summary.todayConsumedSource === "official" ? "官方" : summary.todayConsumedSource === "estimate" ? "估算" : ""
								})
							]
						})
					]
				}));
				children.push(jsxs("div", {
					style: rowStyle,
					children: [
						jsx("span", { children: "刷新" }),
						jsx("span", { style: { ...rowValueStyle, fontWeight: 400 }, children: formatTime(new Date(summary.refreshedAt)) })
					]
				}));
				if (summary.hasPlatformToken === false) {
					children.push(jsx("div", { style: tipStyle, children: "今日消费为余额差值估算。粘贴平台 userToken 可升级为官方精确值:" }));
					children.push(jsx("input", {
						style: tokenInputStyle,
						value: tokenDraft,
						placeholder: "platform.deepseek.com 的 userToken",
						onChange: (e) => setTokenDraft(e.target.value)
					}));
					children.push(jsx("button", {
						type: "button",
						style: { ...actionBtnStyle, marginTop: 6, width: "100%" },
						onClick: saveToken,
						children: "保存 token"
					}));
					if (saveMsg) children.push(jsx("div", { style: errorTextStyle, children: saveMsg }));
				}
			} else if (summary && summary.message) {
				children.push(jsx("div", { style: errorTextStyle, children: summary.message }));
			} else {
				children.push(jsx("div", { style: { color: "var(--dsw-alias-label-secondary)" }, children: "加载中…" }));
			}
			children.push(jsxs("div", {
				style: actionsStyle,
				children: [
					jsx("a", { style: actionPrimaryStyle, href: "https://platform.deepseek.com/top_up", target: "_blank", rel: "noreferrer", children: "💰 充值" }),
					jsx("a", { style: actionBtnStyle, href: "https://platform.deepseek.com/usage", target: "_blank", rel: "noreferrer", children: "📊 用量" }),
					jsx("a", { style: actionBtnStyle, href: "https://platform.deepseek.com/billing", target: "_blank", rel: "noreferrer", children: "🧾 发票" })
				]
			}));
			return jsx("div", { role: "status", "aria-live": "polite", "data-plugin": "dsh-deepseek-quota-plus", style: panelStyle, children });
		}

		// ---- client plugin body -----------------------------------------
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "deepseek-quota-entry",
				order: 200,
				label: "DeepSeek 额度"
			}, QuotaEntry));
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "deepseek-quota-dock",
				order: 100,
				label: "DeepSeek 额度"
			}, QuotaDock));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "deepseek-quota-panel",
				order: 100,
				label: "DeepSeek 额度"
			}, QuotaPanel));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
