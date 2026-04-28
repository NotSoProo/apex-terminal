import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

// ════════════════ TOKENS ════════════════
const C = { bg: "#0a0a0a", surface: "#111111", surface2: "#161616", surface3: "#1a1a1a", border: "#202020", borderH: "#2a2a2a", text: "#fafafa", textM: "#a3a3a3", textD: "#525252", dim: "#262626", accent: "#d4a574", green: "#10b981", greenD: "#065f46", red: "#ef4444", redD: "#7f1d1d", amber: "#f59e0b" };
const F_UI = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const F_MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

const DEFAULT_SETTINGS = {
  // Capital architecture
  totalCapital: 12000000,    // ₹1.2Cr total
  inrCapital: 8500000,       // AB ₹85L
  usdCapital: 35000,         // Exness $35,000
  fxRate: 100,               // 1 USD = ₹100
  // AB sub-buckets (₹)
  abStocks: 6500000,         // ₹65L
  abTrading: 1200000,        // ₹12L
  abDryPowder: 800000,       // ₹8L
  // Stocks sub-buckets (₹)
  stocksPledged: 4500000,    // ₹45L
  stocksUnpledged: 2000000,  // ₹20L
  // Current deployed (manual)
  pledgeMargin: 0,
  tradingDeployed: 0,
  dryPowderUsed: 0,
  // Risk limits
  dailyDDLimit: 3,
  weeklyDDLimit: 6,
  monthlyDDLimit: 10,
  annualDDLimit: 30,
  // HWM tracking
  weekHWM: 0, monthHWM: 0,
  weekHWMDate: null, monthHWMDate: null,
  // Monthly review shown today flag
  reviewShownDate: null,
  holdings: [],
};
const MARKETS_INR = ["Indian Equity", "Stock Futures", "Nifty 50", "BankNifty", "MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium"];
const MARKETS_USD = ["XAU/USD (Gold)", "XAG/USD (Silver)", "Oil (WTI)", "Natural Gas", "Copper", "Aluminium", "BTC/USD", "EUR/USD", "USD/JPY", "GBP/USD"];

// Contract multipliers — how many price units per 1 lot
// e.g. GoldM price quote is per 10g but 1 lot = 100g, so multiplier = 10
const CONTRACT_MULTIPLIERS = {
  "MCX Gold Mini": 10,        // 100g lot, quote per 10g
  "MCX Silver Mini": 5,       // 5kg lot, quote per 1kg
  "MCX Crude Oil": 100,       // 100 barrels lot, quote per 1 barrel
  "MCX Natural Gas": 1250,    // 1250 mmBtu lot, quote per 1 mmBtu
  "MCX Copper": 2500,         // 2500 kg lot, quote per 1kg
  "MCX Aluminium": 5000,      // 5000 kg lot, quote per 1kg
  "Nifty 50": 65,             // SEBI revised Jan 2026
  "BankNifty": 30,            // SEBI revised Jan 2026
  "Indian Equity": 1,
  "Stock Futures": 1,         // manual override per stock
};
const SETUP_TAGS = ["Liquidity Sweep", "BOS / Continuation", "Other"];
const MISTAKE_TAGS = ["Setup didn't play out", "Broke a rule", "Random market noise", "Wrong timeframe", "News event", "FOMO entry", "Late entry", "Stop too wide", "Stop too tight"];

const PRE_TRADE_CHECKLIST = [
  { key: "bias", label: "HTF bias confirmed" },
  { key: "rr", label: "Min 1:3 R:R set" },
  { key: "conviction", label: "Full conviction — would enter blind" },
  { key: "noAdding", label: "Not adding to a loser" },
  { key: "stop", label: "Stop loss defined" },
];

const RULES_CHECKLIST = [
  { key: "plannedSetup", label: "Setup was pre-planned" },
  { key: "waitedConfirm", label: "Waited for confirmation" },
  { key: "properRR", label: "Min 1:3 R:R met" },
  { key: "stopFirst", label: "Stop defined before entry" },
  { key: "noFOMO", label: "No FOMO — clean entry" },
  { key: "noAveraging", label: "Did not average down" },
  { key: "convictionHigh", label: "Conviction was high (7+/10)" },
];

const PRE_MARKET_CHECKLIST = [
  { key: "news", label: "Checked overnight news + economic calendar" },
  { key: "openPos", label: "Reviewed all open positions + stops" },
  { key: "journal", label: "Reviewed yesterday's journal + mistakes" },
  { key: "biasSet", label: "Set daily bias for each market" },
  { key: "conviction", label: "Full conviction on today's setups — not chasing" },
];

const LAWS = [
  "Default 1% risk · Max 2.5% · Min R:R 1:3",
  "Stop loss defined BEFORE every entry",
  "Move stop to breakeven at 1R profit",
  "Never average down — close the trade + take the day off",
  "Max 5 trades with active risk · Unlimited at breakeven",
  "Pre-trade checklist before every single trade",
  "Circuit breakers: 3% daily · 6% weekly · 10% monthly",
  "Drawdown 4–7% → cut to 0.5% · 7–10% → 0.25%",
  "HWM: give back 50% of weekly gains (after +5%) = lockdown",
  "Keep 10–15% capital aside as emergency reserve",
  "Monthly target 6–10% net",
  "Month-end review every 1st of the month",
];

const OPTIONAL_TACTICS = [
  "Pyramid: add 50% size at 1R with tighter stop (50% original distance)",
  "Partial exit: close 60% at 0.6× target, trail rest on EMA",
];

const TRADER_MANTRAS = [
  "Don't feel bad about missed opportunities — they're inevitable",
  "Know exactly why you're entering, your SL, and your target",
  "Keep 10–15% aside as emergency reserve + for new opportunities",
  "Watch charts more than news. The chart is truth",
  "Macro beliefs will be challenged short-term — don't fight it",
  "Safe over greedy. High risk high reward = greed = max loss",
  "Never chase losers or add to them — your biggest weakness",
  "Only enter with full conviction. Doubt = no trade",
];

// ════════════════ HELPERS ════════════════
const fmt = (n, cur = "₹") => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 100000 ? (a / 100000).toFixed(2) + "L" : a >= 1000 ? (a / 1000).toFixed(1) + "K" : a.toFixed(0);
  return (n < 0 ? "-" : "") + cur + s;
};
const dAmt = (n, cur, hidden) => hidden ? cur + "••••" : fmt(n, cur);
const today = () => new Date().toISOString().split("T")[0];
const weekStart = () => { const d = new Date(); const day = d.getDay() || 7; if (day !== 1) d.setHours(-24 * (day - 1)); return d.toISOString().split("T")[0]; };
const monthStart = () => today().slice(0, 7) + "-01";

const calcMetrics = (t) => {
  const entry = +t.entry, sl = +t.stopLoss, target = +t.target, qty = +t.qty;
  const mult = +t.multiplier || CONTRACT_MULTIPLIERS[t.market] || 1;
  if (!entry || !sl || !qty || Math.abs(entry - sl) < 0.0001) return { rr: 0, riskAmt: 0, posVal: entry * qty * mult, pnl: t.pnl, mult, stopDist: 0, slAtBE: false, livePnl: null, liveR: null, bePrice: entry };
  const isLong = t.direction === "Long";
  const stopDist = Math.abs(entry - sl);
  const targetDist = target ? Math.abs(target - entry) : 0;
  const rr = stopDist > 0 ? +(targetDist / stopDist).toFixed(2) : 0;
  const bePrice = entry; // true breakeven = entry price (moving SL here = no loss)
  const oneRLevel = isLong ? entry + stopDist : entry - stopDist; // price where you SHOULD move SL to BE
  const slAtBE = t.currentSL ? (isLong ? +t.currentSL >= entry - 0.01 : +t.currentSL <= entry + 0.01) : false;
  const riskAmt = slAtBE ? 0 : stopDist * qty * mult;
  const posVal = entry * qty * mult;
  let pnl = t.pnl;
  if (t.status === "Closed" && t.exitPrice) {
    const diff = isLong ? +t.exitPrice - entry : entry - +t.exitPrice;
    pnl = diff * qty * mult;
  }
  let livePnl = null, liveR = null;
  if (t.status === "Open" && t.cmp && entry) {
    const diff = isLong ? +t.cmp - entry : entry - +t.cmp;
    livePnl = diff * qty * mult;
    liveR = stopDist > 0 ? +(diff / stopDist).toFixed(2) : 0;
  }
  return { rr, riskAmt, posVal, pnl, stopDist, mult, bePrice, slAtBE, livePnl, liveR };
};

// ════════════════ UI PIECES ════════════════
const Card = ({ children, style = {}, padding = 18 }) => <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding, ...style }}>{children}</div>;
const Label = ({ children, style = {} }) => <div style={{ fontSize: 10, letterSpacing: 1.5, color: C.textM, textTransform: "uppercase", fontWeight: 500, ...style }}>{children}</div>;
const Stat = ({ label, value, sub, color = C.text }) => <Card><Label>{label}</Label><div style={{ fontSize: 22, color, fontWeight: 600, fontFamily: F_MONO, marginTop: 8, lineHeight: 1.2, wordBreak: "break-word" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: C.textM, marginTop: 4, fontFamily: F_MONO }}>{sub}</div>}</Card>;

const Btn = ({ onClick, children, variant = "default", size = "md", style = {}, disabled }) => {
  const sizes = { sm: { padding: "5px 10px", fontSize: 11 }, md: { padding: "8px 14px", fontSize: 12 }, lg: { padding: "10px 18px", fontSize: 13 } };
  const variants = {
    default: { background: C.surface2, color: C.text, border: `1px solid ${C.border}` },
    primary: { background: C.accent, color: C.bg, fontWeight: 600, border: "none" },
    ghost: { background: "transparent", color: C.textM, border: `1px solid ${C.border}` },
    danger: { background: C.red + "20", color: C.red, border: `1px solid ${C.red}40` },
    success: { background: C.green + "20", color: C.green, border: `1px solid ${C.green}40` },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer", fontFamily: F_UI, fontWeight: 500, opacity: disabled ? 0.4 : 1, transition: "all 0.15s", ...sizes[size], ...variants[variant], ...style }}>{children}</button>;
};

const Input = ({ value, onChange, placeholder, type = "text", style = {} }) => <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "10px 12px", fontSize: 13, fontFamily: F_MONO, outline: "none", width: "100%", boxSizing: "border-box", ...style }} />;
const Select = ({ value, onChange, options, style = {} }) => <select value={value} onChange={onChange} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "10px 12px", fontSize: 13, fontFamily: F_UI, outline: "none", width: "100%", boxSizing: "border-box", cursor: "pointer", ...style }}>{options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select>;
const Dot = ({ ok }) => <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: ok ? C.green : C.red, marginRight: 8, boxShadow: `0 0 6px ${ok ? C.green : C.red}80` }} />;
const timeSince = (dateStr) => {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr + "T00:00:00")) / 1000 / 60);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins/60)}h`;
  return `${Math.floor(mins/1440)}d`;
};
const Bar_ = ({ pct, color = C.accent, height = 6 }) => <div style={{ width: "100%", height, background: C.dim, borderRadius: height, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width 0.4s" }} /></div>;

const Eye = ({ open, size = 14 }) => open
  ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;

// ════════════════ MAIN ════════════════
export default function ApexTerminal() {
  const [page, setPage] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [trades, setTrades] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [preMarket, setPreMarket] = useState({});
  const [reviews, setReviews] = useState({});
  const [showPreMarket, setShowPreMarket] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [pyramidTrade, setPyramidTrade] = useState(null);
  const [closeTrade, setCloseTrade] = useState(null);
  const [hideCapital, setHideCapital] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (document.querySelector("#apex-fonts")) return;
    const l = document.createElement("link"); l.id = "apex-fonts";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (() => {
      const _t = localStorage.getItem("nsf_trades");
      if (_t) try { setTrades(JSON.parse(_t)); } catch(e) {}
      const _s = localStorage.getItem("nsf_settings");
      if (_s) try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(_s) }); } catch(e) {}
      const _h = localStorage.getItem("nsf_hide");
      if (_h) try { setHideCapital(JSON.parse(_h)); } catch(e) {}
      const _r = localStorage.getItem("nsf_reviews");
      if (_r) try { setReviews(JSON.parse(_r)); } catch(e) {}
      const _p = localStorage.getItem("nsf_premarket");
      if (_p) { try { const data = JSON.parse(_p); setPreMarket(data); if (!data[today()]) setShowPreMarket(true); } catch(e) { setShowPreMarket(true); } }
      else setShowPreMarket(true);
      const _rev = (() => { try { return _r ? JSON.parse(_r) : {}; } catch(e) { return {}; } })();
      const d = new Date();
      if (d.getDate() === 1) {
        const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
        const _sett = _s ? (() => { try { return JSON.parse(_s); } catch(e) { return {}; } })() : {};
        const todayStr = new Date().toISOString().split("T")[0];
        if (!_rev[lm] && _sett.reviewShownDate !== todayStr) setShowReview(true);
      }
      setLoaded(true);
    })();
  }, []);

  const saveTrades = (next) => { setTrades(next); try { localStorage.setItem("nsf_trades", JSON.stringify(next)); } catch (e) {} };
  const saveSettings = (next) => { setSettings(next); try { localStorage.setItem("nsf_settings", JSON.stringify(next)); } catch (e) {} };
  const savePreMarket = (next) => { setPreMarket(next); try { localStorage.setItem("nsf_premarket", JSON.stringify(next)); } catch (e) {} };
  const saveReviews = (next) => { setReviews(next); try { localStorage.setItem("nsf_reviews", JSON.stringify(next)); } catch (e) {} };
  const toggleHide = () => { const n = !hideCapital; setHideCapital(n); try { localStorage.setItem("nsf_hide", JSON.stringify(n)); } catch (e) {} };

  // ════════════════ METRICS ════════════════
  const metrics = useMemo(() => {
    const closed = trades.filter(t => t.status === "Closed");
    const open = trades.filter(t => t.status === "Open");
    const t = today(); const ws = weekStart(); const ms = monthStart();

    const inrPnl = closed.filter(x => x.platform === "AB").reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);
    const usdPnl = closed.filter(x => x.platform === "Exness").reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);

    const todayInrPnl = closed.filter(x => x.platform === "AB" && x.exitDate === t).reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);
    const todayUsdPnl = closed.filter(x => x.platform === "Exness" && x.exitDate === t).reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);
    const todayLosses = closed.filter(x => x.exitDate === t && (calcMetrics(x).pnl || 0) < 0).length;

    const weekInrPnl = closed.filter(x => x.platform === "AB" && (x.exitDate || "") >= ws).reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);
    const weekUsdPnl = closed.filter(x => x.platform === "Exness" && (x.exitDate || "") >= ws).reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);

    const monthClosed = closed.filter(x => (x.exitDate || "") >= ms);
    const monthInrPnl = monthClosed.filter(x => x.platform === "AB").reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);
    const monthUsdPnl = monthClosed.filter(x => x.platform === "Exness").reduce((a, x) => a + (calcMetrics(x).pnl || 0), 0);

    const totalCapInr = settings.inrCapital + settings.usdCapital * settings.fxRate;
    const dayCombined = todayInrPnl + todayUsdPnl * settings.fxRate;
    const weekCombined = weekInrPnl + weekUsdPnl * settings.fxRate;
    const monthCombined = monthInrPnl + monthUsdPnl * settings.fxRate;
    const dayDD = totalCapInr > 0 ? (dayCombined / totalCapInr) * 100 : 0;
    const weekDD = totalCapInr > 0 ? (weekCombined / totalCapInr) * 100 : 0;
    const monthDD = totalCapInr > 0 ? (monthCombined / totalCapInr) * 100 : 0;
    const monthReturnPct = monthDD;

    // HWM lockdown: if peak >= threshold AND now <= half of peak
    // HWM: trigger lockdown if peak gain >= 5% weekly or 10% monthly, then drops to 50% of peak
    const weekLockdownActive = (settings.weekHWM || 0) >= 5 && weekDD <= (settings.weekHWM || 0) / 2;
    const monthLockdownActive = (settings.monthHWM || 0) >= 10 && monthDD <= (settings.monthHWM || 0) / 2;

    // open risk — trades at BE have riskAmt=0 from calcMetrics
    const openWithRisk = open.filter(x => !calcMetrics(x).slAtBE);
    const openInrRisk = open.filter(x => x.platform === "AB").reduce((a, x) => a + calcMetrics(x).riskAmt, 0);
    const openUsdRisk = open.filter(x => x.platform === "Exness").reduce((a, x) => a + calcMetrics(x).riskAmt, 0);
    const totalOpenRiskInr = openInrRisk + openUsdRisk * settings.fxRate;
    const totalRiskPct = totalCapInr > 0 ? (totalOpenRiskInr / totalCapInr) * 100 : 0;
    const inrRiskPct = totalCapInr > 0 ? (openInrRisk / totalCapInr) * 100 : 0;
    const usdRiskPct = totalCapInr > 0 ? (openUsdRisk * settings.fxRate / totalCapInr) * 100 : 0;

    const mLimit = settings.monthlyDDLimit || 10;
    let recommendedRisk = 1;
    if (monthDD <= -(mLimit * 0.7)) recommendedRisk = 0.25;
    else if (monthDD <= -(mLimit * 0.4)) recommendedRisk = 0.5;

    // breaches
    const breaches = [];
    trades.filter(x => x.status !== "Pending").forEach(x => {
      const m = calcMetrics(x);
      const riskInr = x.platform === "AB" ? m.riskAmt : m.riskAmt * settings.fxRate;
      const pct = totalCapInr > 0 ? (riskInr / totalCapInr) * 100 : 0;
      if (pct > (settings.maxRiskPct || 2.5)) breaches.push({ msg: `${x.market}: risk ${pct.toFixed(1)}% of total > 2.5%` });
    });
    if (todayLosses >= 3) breaches.push({ msg: `${todayLosses} losses today — STOP TRADING` });
    if (dayDD <= -(settings.dailyDDLimit || 3)) breaches.push({ msg: `Daily circuit hit: ${dayDD.toFixed(1)}%` });
    if (weekDD <= -(settings.weeklyDDLimit || 6)) breaches.push({ msg: `Weekly circuit hit: ${weekDD.toFixed(1)}%` });
    if (monthDD <= -(settings.monthlyDDLimit || 10)) breaches.push({ msg: `Monthly circuit hit: ${monthDD.toFixed(1)}%` });
    if (weekLockdownActive) breaches.push({ msg: "Weekly HWM lockdown — gave back 50% of +5% gains" });
    if (monthLockdownActive) breaches.push({ msg: "Monthly HWM lockdown — gave back 50% of +10% gains" });
    if (openWithRisk.length >= 5) breaches.push({ msg: "5 trades with active risk — max reached" });

    return {
      inrPnl, usdPnl, todayInrPnl, todayUsdPnl, todayLosses,
      openInrRisk, openUsdRisk, inrRiskPct, usdRiskPct, totalRiskPct, totalCapInr,
      monthInrPnl, monthUsdPnl, weekInrPnl, weekUsdPnl, dayDD, weekDD, monthDD, monthReturnPct,
      breaches, openCount: open.length, openWithRiskCount: openWithRisk.length,
      closedCount: closed.length, recommendedRisk,
      weekLockdownActive, monthLockdownActive,
    };
  }, [trades, settings]);

  // Update HWM peaks — reset at start of new week/month
  useEffect(() => {
    if (!loaded) return;
    const upd = {};
    const todayStr = today();
    const wStart = weekStart();
    const mStart = monthStart();
    // Reset weekly HWM if new week started
    if (settings.weekHWMDate && settings.weekHWMDate < wStart) { upd.weekHWM = 0; upd.weekHWMDate = wStart; }
    // Reset monthly HWM if new month started
    if (settings.monthHWMDate && settings.monthHWMDate < mStart) { upd.monthHWM = 0; upd.monthHWMDate = mStart; }
    // Update peaks
    if (metrics.weekDD > (settings.weekHWM || 0)) { upd.weekHWM = metrics.weekDD; if (!settings.weekHWMDate) upd.weekHWMDate = wStart; }
    if (metrics.monthDD > (settings.monthHWM || 0)) { upd.monthHWM = metrics.monthDD; if (!settings.monthHWMDate) upd.monthHWMDate = mStart; }
    if (Object.keys(upd).length > 0) saveSettings({ ...settings, ...upd });
  }, [metrics.weekDD, metrics.monthDD, loaded]);

  if (!loaded) return <div style={{ background: C.bg, color: C.textM, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_MONO, fontSize: 13 }}>loading...</div>;

  const NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "positions", label: "Positions" },
    { id: "holdings", label: "Holdings" },
    { id: "returns", label: "Returns" },
    { id: "addtrade", label: "Add Trade" },
    { id: "calculator", label: "Calculator" },
    { id: "journal", label: "Journal" },
    { id: "rules", label: "Rules" },
  ];

  const inrTotal = settings.inrCapital + metrics.inrPnl;
  const usdTotal = settings.usdCapital + metrics.usdPnl;
  const combined = inrTotal + usdTotal * settings.fxRate;

  const exportData = () => {
    const data = { trades, settings, reviews, preMarket, exportedAt: new Date().toISOString(), version: 8 };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `nsf-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.trades) saveTrades(data.trades);
        if (data.settings) saveSettings(data.settings);
        if (data.reviews) saveReviews(data.reviews);
        if (data.preMarket) savePreMarket(data.preMarket);
        alert("Imported successfully.");
      } catch { alert("Invalid backup file."); }
    };
    reader.readAsText(file);
  };

  const shared = { metrics, settings, trades, hideCapital, combined, inrTotal, usdTotal, isMobile };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: F_UI, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      {showPreMarket && <PreMarketModal preMarket={preMarket} savePreMarket={savePreMarket} setShowPreMarket={setShowPreMarket} setShowBrief={setShowBrief} />}
      {showBrief && <DailyBriefModal metrics={metrics} settings={settings} trades={trades} hideCapital={hideCapital} setShowBrief={setShowBrief} />}
      {showSettings && <SettingsModal settings={settings} saveSettings={saveSettings} setShowSettings={setShowSettings} exportData={exportData} importData={importData} />}
      {closeTrade && <CloseTradeModal trade={closeTrade} setCloseTrade={setCloseTrade} trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} />}
      {showReview && <MonthlyReviewModal trades={trades} settings={settings} reviews={reviews} saveReviews={saveReviews} setShowReview={setShowReview} />}
      {editTrade && <EditTradeModal trade={editTrade} setEditTrade={setEditTrade} trades={trades} saveTrades={saveTrades} />}
      {pyramidTrade && <PyramidModal trade={pyramidTrade} setPyramidTrade={setPyramidTrade} trades={trades} saveTrades={saveTrades} />}

      {/* SIDEBAR (DESKTOP) */}
      {!isMobile && (
        <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, padding: "20px 0", position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: C.text }}>NSF</div>
            <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.textD, marginTop: 2 }}>NotSoFolio Alpha</div>
          </div>
          <div style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 20px", background: page === n.id ? C.surface2 : "transparent", border: "none", borderLeft: page === n.id ? `2px solid ${C.accent}` : "2px solid transparent", color: page === n.id ? C.text : C.textM, fontSize: 13, fontFamily: F_UI, cursor: "pointer" }}>{n.label}</button>
            ))}
          </div>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Label style={{ fontSize: 9 }}>Capital</Label>
              <button onClick={toggleHide} style={{ background: "transparent", border: "none", color: C.textM, cursor: "pointer", padding: 0, display: "flex" }}><Eye open={!hideCapital} size={13} /></button>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.text, fontFamily: F_MONO, marginTop: 4 }}>{dAmt(combined, "₹", hideCapital)}</div>
            <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO, marginTop: 2 }}>{hideCapital ? "₹•••• · $••••" : `₹${(inrTotal / 1000).toFixed(1)}K · $${usdTotal.toFixed(0)}`}</div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => setShowReview(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "6px 12px", borderRadius: 4, fontSize: 11, fontFamily: F_UI, cursor: "pointer" }}>Monthly Review</button>
              <button onClick={() => setShowSettings(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "6px 12px", borderRadius: 4, fontSize: 11, fontFamily: F_UI, cursor: "pointer" }}>Settings · Export</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE TOP BAR */}
      {isMobile && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: C.text }}>NSF</div>
              <div style={{ fontSize: 8, letterSpacing: 2, color: C.textD }}>ALPHA</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={toggleHide} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "6px 10px", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center" }}><Eye open={!hideCapital} size={12} /></button>
              <button onClick={() => setShowReview(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: F_UI }}>Review</button>
              <button onClick={() => setShowSettings(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: F_UI }}>⚙</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", borderTop: `1px solid ${C.border}` }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)} style={{ flexShrink: 0, padding: "11px 14px", background: page === n.id ? C.surface2 : "transparent", border: "none", borderBottom: page === n.id ? `2px solid ${C.accent}` : "2px solid transparent", color: page === n.id ? C.text : C.textM, fontSize: 12, fontFamily: F_UI, cursor: "pointer", width: "25%", textAlign: "center", boxSizing: "border-box" }}>{n.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: isMobile ? "14px 16px" : "20px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 600, textTransform: "capitalize" }}>{page === "addtrade" ? "Add Trade" : page}</div>
            <div style={{ fontSize: 10, color: C.textD, marginTop: 2, fontFamily: F_MONO }}>{new Date().toLocaleDateString("en-GB", { weekday: isMobile ? "short" : "long", day: "numeric", month: isMobile ? "short" : "long", year: "numeric" })}</div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <Label style={{ fontSize: 9 }}>Today P&L</Label>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: F_MONO, color: (metrics.todayInrPnl + metrics.todayUsdPnl * settings.fxRate) >= 0 ? C.green : C.red, marginTop: 2 }}>{dAmt(metrics.todayInrPnl + metrics.todayUsdPnl * settings.fxRate, "₹", hideCapital)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Label style={{ fontSize: 9 }}>USD/INR</Label>
              <input type="number" value={settings.fxRate} onChange={e => saveSettings({ ...settings, fxRate: +e.target.value })} style={{ background: "transparent", border: "none", color: C.text, fontSize: 13, fontFamily: F_MONO, width: 56, textAlign: "right", outline: "none", marginTop: 2 }} />
            </div>
          </div>
        </div>

        <div style={{ padding: isMobile ? "16px" : "28px" }}>
          {page === "dashboard" && <Dashboard metrics={metrics} settings={settings} trades={trades} hideCapital={hideCapital} combined={combined} inrTotal={inrTotal} usdTotal={usdTotal} isMobile={isMobile} />}
          {page === "positions" && <Positions trades={trades} saveTrades={saveTrades} setEditTrade={setEditTrade} setPyramidTrade={setPyramidTrade} setCloseTrade={setCloseTrade} hideCapital={hideCapital} isMobile={isMobile} metrics={metrics} settings={settings} />}
          {page === "holdings" && <Holdings settings={settings} saveSettings={saveSettings} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "addtrade" && <AddTrade trades={trades} saveTrades={saveTrades} settings={settings} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} recommendedRisk={metrics.recommendedRisk} />}
          {page === "journal" && <Journal trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "returns" && <Returns trades={trades} settings={settings} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "rules" && <Rules metrics={metrics} />}
          {page === "calculator" && <Calculator settings={settings} trades={trades} saveTrades={saveTrades} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} recommendedRisk={metrics.recommendedRisk} />}
        </div>
      </div>
    </div>
  );
}

// ════════════════ PRE-MARKET MODAL ════════════════
function PreMarketModal({ preMarket, savePreMarket, setShowPreMarket, setShowBrief }) {
  const t = today();
  const [s, setS] = useState(preMarket[t] || PRE_MARKET_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}));
  const allDone = PRE_MARKET_CHECKLIST.every(c => s[c.key]);
  const submit = () => {
    savePreMarket({ ...preMarket, [t]: s });
    setShowPreMarket(false);
    setShowBrief(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, maxWidth: 520, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>Pre-Market · Step 1 of 2</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 6 }}>Ready to trade?</div>
        <div style={{ fontSize: 12, color: C.textM, marginBottom: 22, lineHeight: 1.6 }}>30 seconds. Done once daily.</div>
        {PRE_MARKET_CHECKLIST.map(c => (
          <div key={c.key} onClick={() => setS({ ...s, [c.key]: !s[c.key] })} style={{ display: "flex", alignItems: "center", padding: "11px 0", borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, border: `1.5px solid ${s[c.key] ? C.accent : C.borderH}`, background: s[c.key] ? C.accent : "transparent", borderRadius: 3, marginRight: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s[c.key] && <span style={{ color: C.bg, fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
            <span style={{ fontSize: 13, color: s[c.key] ? C.text : C.textM }}>{c.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <Btn variant="ghost" onClick={() => setShowPreMarket(false)} size="lg" style={{ flex: 1 }}>Skip</Btn>
          <Btn variant="primary" onClick={submit} size="lg" disabled={!allDone} style={{ flex: 2 }}>{allDone ? "Continue →" : `${PRE_MARKET_CHECKLIST.filter(c => s[c.key]).length}/${PRE_MARKET_CHECKLIST.length}`}</Btn>
        </div>
      </div>
    </div>
  );
}

// ════════════════ DAILY BRIEF MODAL ════════════════
function DailyBriefModal({ metrics, settings, trades, hideCapital, setShowBrief }) {
  const dailyHeadroom = 3 + metrics.dayDD; // how much % left before 3% daily limit
  const weeklyHeadroom = 5 + metrics.weekDD;
  const monthlyHeadroom = 10 + metrics.monthDD;
  const open = trades.filter(t => t.status === "Open");
  const lastJournal = trades.filter(t => t.notes && t.notes.length > 0).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>Daily Brief · Step 2 of 2</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 20 }}>Today's setup</div>

        {/* Headroom */}
        <Label>Circuit Headroom</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, marginBottom: 18 }}>
          <div style={{ background: C.surface2, borderRadius: 5, padding: 10 }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1.5 }}>DAILY</div>
            <div style={{ fontSize: 16, color: dailyHeadroom > 2 ? C.green : dailyHeadroom > 1 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{dailyHeadroom.toFixed(1)}%</div>
            <div style={{ fontSize: 9, color: C.textD, marginTop: 2 }}>left of -3%</div>
          </div>
          <div style={{ background: C.surface2, borderRadius: 5, padding: 10 }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1.5 }}>WEEKLY</div>
            <div style={{ fontSize: 16, color: weeklyHeadroom > 3 ? C.green : weeklyHeadroom > 1.5 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{weeklyHeadroom.toFixed(1)}%</div>
            <div style={{ fontSize: 9, color: C.textD, marginTop: 2 }}>left of -5%</div>
          </div>
          <div style={{ background: C.surface2, borderRadius: 5, padding: 10 }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1.5 }}>MONTHLY</div>
            <div style={{ fontSize: 16, color: monthlyHeadroom > 6 ? C.green : monthlyHeadroom > 3 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{monthlyHeadroom.toFixed(1)}%</div>
            <div style={{ fontSize: 9, color: C.textD, marginTop: 2 }}>left of -10%</div>
          </div>
        </div>

        {/* Recommended risk */}
        <div style={{ background: metrics.recommendedRisk < 1 ? C.amber + "10" : C.green + "10", border: `1px solid ${metrics.recommendedRisk < 1 ? C.amber : C.green}30`, borderRadius: 5, padding: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: metrics.recommendedRisk < 1 ? C.amber : C.green, marginBottom: 4 }}>RECOMMENDED RISK TODAY</div>
          <div style={{ fontSize: 22, color: metrics.recommendedRisk < 1 ? C.amber : C.green, fontFamily: F_MONO, fontWeight: 600 }}>{metrics.recommendedRisk}% per trade</div>
          {metrics.recommendedRisk < 1 && <div style={{ fontSize: 11, color: C.textM, marginTop: 4 }}>Drawdown active — reduce size until recovered</div>}
        </div>

        {/* Open positions */}
        {open.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Label>Open Positions ({open.length}/5)</Label>
            <div style={{ marginTop: 8 }}>
              {open.map(t => {
                const m = calcMetrics(t);
                const cur = t.platform === "AB" ? "₹" : "$";
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: C.surface2, borderRadius: 4, marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 12, color: C.text }}>{t.market} · {t.direction === "Long" ? "L" : "S"}</div>
                      <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO }}>Entry {t.entry} · SL {t.stopLoss}</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.textM, fontFamily: F_MONO, textAlign: "right" }}>
                      <div>Risk {dAmt(m.riskAmt, cur, hideCapital)}</div>
                      <div style={{ color: m.rr >= 3 ? C.green : C.amber, fontSize: 10 }}>1:{m.rr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Last journal lesson */}
        {lastJournal && (
          <div style={{ marginBottom: 18 }}>
            <Label>Last Journal Entry</Label>
            <div style={{ marginTop: 8, padding: 12, background: C.surface2, borderRadius: 5, borderLeft: `2px solid ${C.accent}` }}>
              <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO, marginBottom: 6 }}>{lastJournal.date} · {lastJournal.market}</div>
              <div style={{ fontSize: 12, color: C.textM, lineHeight: 1.6, fontStyle: "italic" }}>"{lastJournal.notes.slice(0, 220)}{lastJournal.notes.length > 220 ? "..." : ""}"</div>
            </div>
          </div>
        )}

        <Btn variant="primary" onClick={() => setShowBrief(false)} size="lg" style={{ width: "100%" }}>Start Trading</Btn>
      </div>
    </div>
  );
}

// ════════════════ SETTINGS MODAL ════════════════
function SettingsModal({ settings, saveSettings, setShowSettings, exportData, importData }) {
  const [s, setS] = useState(settings);
  const importRef = useRef();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 18 }}>Settings</div>
        <div style={{ marginBottom: 14 }}><Label style={{ marginBottom: 6 }}>Total Capital (₹)</Label><Input type="number" value={s.totalCapital || 12000000} onChange={e => setS({ ...s, totalCapital: +e.target.value })} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><Label style={{ marginBottom: 6 }}>AB Capital (₹)</Label><Input type="number" value={s.inrCapital || 8500000} onChange={e => setS({ ...s, inrCapital: +e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Exness Capital ($)</Label><Input type="number" value={s.usdCapital || 35000} onChange={e => setS({ ...s, usdCapital: +e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 14 }}><Label style={{ marginBottom: 6 }}>USD/INR Rate</Label><Input type="number" value={s.fxRate || 100} onChange={e => setS({ ...s, fxRate: +e.target.value })} /></div>
        <div style={{ marginBottom: 14 }}><Label style={{ marginBottom: 6 }}>Net Pledge Margin (₹) — after haircut</Label><Input type="number" value={s.pledgeMargin || ""} onChange={e => setS({ ...s, pledgeMargin: +e.target.value })} placeholder="Usable margin amount" />{s.pledgeMargin > 0 && <div style={{ fontSize: 11, color: C.green, fontFamily: F_MONO, marginTop: 6 }}>₹{(+s.pledgeMargin).toLocaleString("en-IN")} usable</div>}</div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <Label style={{ marginBottom: 10 }}>AB Sub-Buckets (₹)</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Stocks Target</Label><Input type="number" value={s.abStocks || 6500000} onChange={e => setS({ ...s, abStocks: +e.target.value })} /></div>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Trading Capital</Label><Input type="number" value={s.abTrading || 1200000} onChange={e => setS({ ...s, abTrading: +e.target.value })} /></div>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Dry Powder</Label><Input type="number" value={s.abDryPowder || 800000} onChange={e => setS({ ...s, abDryPowder: +e.target.value })} /></div>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Dry Powder Used</Label><Input type="number" value={s.dryPowderUsed || 0} onChange={e => setS({ ...s, dryPowderUsed: +e.target.value })} /></div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <Label style={{ marginBottom: 10 }}>Stocks Split (₹)</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Pledged Value</Label><Input type="number" value={s.stocksPledged || 4500000} onChange={e => setS({ ...s, stocksPledged: +e.target.value })} /></div>
            <div><Label style={{ marginBottom: 5, fontSize: 9 }}>Unpledged Value</Label><Input type="number" value={s.stocksUnpledged || 2000000} onChange={e => setS({ ...s, stocksUnpledged: +e.target.value })} /></div>
          </div>
        </div>
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <Label style={{ marginBottom: 12 }}>Data Backup</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={exportData} size="md" style={{ flex: 1 }}>Export JSON</Btn>
            <Btn onClick={() => importRef.current?.click()} size="md" style={{ flex: 1 }}>Import JSON</Btn>
            <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </div>
          <div style={{ fontSize: 10, color: C.textD, marginTop: 8, lineHeight: 1.6 }}>Export before changes. Import restores all trades + settings.</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <Btn variant="ghost" onClick={() => setShowSettings(false)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={() => { saveSettings(s); setShowSettings(false); }} size="lg" style={{ flex: 1 }}>Save</Btn>
        </div>
      </div>
    </div>
  );
}

function MonthlyReviewModal({ trades, settings, reviews, saveReviews, setShowReview }) {
  const d = new Date(); d.setDate(0);
  const month = d.toISOString().slice(0, 7);
  const monthName = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const ex = reviews[month] || {};
  const [form, setForm] = useState({ commonMistake: ex.commonMistake || "", ruleBroke: ex.ruleBroke || "", ruleFollowed: ex.ruleFollowed || "", improvement: ex.improvement || "", notes: ex.notes || "" });
  const closed = trades.filter(t => t.status === "Closed" && (t.exitDate || "").startsWith(month));
  const totalCapInr = settings.inrCapital + settings.usdCapital * settings.fxRate;
  const pnlInr = closed.reduce((a, t) => { const m = calcMetrics(t); return a + (t.platform === "AB" ? (m.pnl || 0) : (m.pnl || 0) * settings.fxRate); }, 0);
  const wins = closed.filter(t => (calcMetrics(t).pnl || 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const returnPct = totalCapInr > 0 ? (pnlInr / totalCapInr) * 100 : 0;
  const avgRR = closed.length > 0 ? closed.reduce((a, t) => a + calcMetrics(t).rr, 0) / closed.length : 0;
  const mistakeCounts = {};
  closed.filter(t => t.mistakeTag).forEach(t => { mistakeCounts[t.mistakeTag] = (mistakeCounts[t.mistakeTag] || 0) + 1; });
  const topMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0];
  const QUESTIONS = [
    { key: "commonMistake", label: "Most common mistake this month", placeholder: topMistake ? `Suggested: "${topMistake[0]}" (${topMistake[1]}x tagged)` : "What kept showing up?" },
    { key: "ruleBroke", label: "One rule I broke", placeholder: "Be specific — which trade, which rule" },
    { key: "ruleFollowed", label: "One rule I followed well", placeholder: "What discipline showed up consistently?" },
    { key: "improvement", label: "One thing to improve next month", placeholder: "One concrete change, not a list" },
    { key: "notes", label: "Any other notes", placeholder: "Anything else worth capturing" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>Monthly Review</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>{monthName}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[["Net P&L", fmt(pnlInr), pnlInr >= 0 ? C.green : C.red], ["Return", `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`, returnPct >= 6 ? C.green : returnPct >= 0 ? C.text : C.red], ["Trades / Win Rate", `${closed.length} · ${winRate.toFixed(0)}%`, C.text], ["Avg R:R", `1:${avgRR.toFixed(2)}`, avgRR >= 3 ? C.green : C.amber]].map(([label, value, color]) => (
            <div key={label} style={{ background: C.surface2, borderRadius: 5, padding: 12 }}><Label>{label}</Label><div style={{ fontSize: 18, color, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{value}</div></div>
          ))}
        </div>
        {QUESTIONS.map(q => (
          <div key={q.key} style={{ marginBottom: 14 }}>
            <Label style={{ marginBottom: 8 }}>{q.label}</Label>
            <textarea value={form[q.key]} onChange={e => setForm({ ...form, [q.key]: e.target.value })} placeholder={q.placeholder} style={{ width: "100%", minHeight: 64, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: 12, fontSize: 13, fontFamily: F_UI, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setShowReview(false)} size="lg" style={{ flex: 1 }}>Later</Btn>
          <Btn variant="primary" onClick={() => { saveReviews({ ...reviews, [month]: { ...form, completedAt: new Date().toISOString() } }); saveSettings({ ...settings, reviewShownDate: today() }); setShowReview(false); }} size="lg" style={{ flex: 2 }}>Save Review</Btn>
        </div>
      </div>
    </div>
  );
}

// ════════════════ HOLDINGS ════════════════
function Holdings({ settings, saveSettings, setPage, hideCapital, isMobile }) {
  const [holdings, setHoldings] = useState(settings.holdings || []);
  const [form, setForm] = useState({ name: "", qty: "", avgPrice: "", cmp: "", pledged: false });
  const [editId, setEditId] = useState(null);

  const save = (list) => {
    setHoldings(list);
    saveSettings({ ...settings, holdings: list });
  };

  const addOrUpdate = () => {
    if (!form.name || !form.qty) return;
    if (editId) {
      save(holdings.map(h => h.id === editId ? { ...form, id: editId } : h));
      setEditId(null);
    } else {
      save([...holdings, { ...form, id: "h_" + Date.now() }]);
    }
    setForm({ name: "", qty: "", avgPrice: "", cmp: "", pledged: false });
  };

  const remove = (id) => save(holdings.filter(h => h.id !== id));
  const startEdit = (h) => { setForm({ name: h.name, qty: h.qty, avgPrice: h.avgPrice, cmp: h.cmp || "", pledged: h.pledged || false }); setEditId(h.id); };
  const updateCMP = (id, val) => save(holdings.map(h => h.id === id ? { ...h, cmp: val } : h));
  const togglePledge = (id) => save(holdings.map(h => h.id === id ? { ...h, pledged: !h.pledged } : h));

  const totalValue = holdings.reduce((a, h) => a + (+h.qty * (+h.cmp || +h.avgPrice)), 0);
  const totalPnl = holdings.reduce((a, h) => a + ((+h.cmp || +h.avgPrice) - +h.avgPrice) * +h.qty, 0);
  const pledgedValue = holdings.filter(h => h.pledged).reduce((a, h) => a + (+h.qty * (+h.cmp || +h.avgPrice)), 0);
  const g2 = isMobile ? "1fr" : "1fr 1fr";

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <Stat label="Portfolio Value" value={dAmt(totalValue, "₹", hideCapital)} sub={`${holdings.length} stocks`} />
        <Stat label="Unrealized P&L" value={dAmt(totalPnl, "₹", hideCapital)} color={totalPnl >= 0 ? C.green : C.red} sub={totalValue > 0 ? `${((totalPnl/totalValue)*100).toFixed(2)}%` : ""} />
        <Stat label="Pledged Value" value={dAmt(pledgedValue, "₹", hideCapital)} sub={`${holdings.filter(h=>h.pledged).length} stocks pledged`} color={C.amber} />
        <Stat label="Net Margin" value={dAmt(settings.pledgeMargin || 0, "₹", hideCapital)} sub="From settings" color={C.green} />
      </div>

      {/* Add / Edit form */}
      <Card style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 14 }}>{editId ? "Edit Holding" : "Add Holding"}</Label>
        <div style={{ display: "grid", gridTemplateColumns: g2, gap: 10, marginBottom: 10 }}>
          <div><Label style={{ marginBottom: 5 }}>Stock Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. HDFC Bank" /></div>
          <div><Label style={{ marginBottom: 5 }}>Quantity (shares)</Label><Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" /></div>
          <div><Label style={{ marginBottom: 5 }}>Avg Buy Price (₹)</Label><Input type="number" value={form.avgPrice} onChange={e => setForm({ ...form, avgPrice: e.target.value })} placeholder="0.00" /></div>
          <div><Label style={{ marginBottom: 5 }}>Current Price (₹)</Label><Input type="number" value={form.cmp} onChange={e => setForm({ ...form, cmp: e.target.value })} placeholder="0.00" /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => setForm({ ...form, pledged: !form.pledged })} style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
            <div style={{ width: 16, height: 16, border: `1.5px solid ${form.pledged ? C.amber : C.borderH}`, background: form.pledged ? C.amber + "30" : "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>{form.pledged && <span style={{ color: C.amber, fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
            <span style={{ fontSize: 12, color: form.pledged ? C.amber : C.textM }}>Pledged for margin</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {editId && <Btn variant="ghost" onClick={() => { setEditId(null); setForm({ name: "", qty: "", avgPrice: "", cmp: "", pledged: false }); }} size="md">Cancel</Btn>}
            <Btn variant="primary" onClick={addOrUpdate} size="md" disabled={!form.name || !form.qty}>{editId ? "Save Changes" : "+ Add Stock"}</Btn>
          </div>
        </div>
      </Card>

      {/* Holdings list */}
      {holdings.length === 0 ? (
        <Card><div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No holdings yet — add your first stock above</div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {holdings.map(h => {
            const cmp = +h.cmp || +h.avgPrice;
            const pnl = (cmp - +h.avgPrice) * +h.qty;
            const pnlPct = +h.avgPrice > 0 ? ((cmp - +h.avgPrice) / +h.avgPrice) * 100 : 0;
            const value = cmp * +h.qty;
            return (
              <Card key={h.id} padding={14}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{h.name}</div>
                      {h.pledged && <span style={{ fontSize: 9, padding: "2px 7px", background: C.amber + "20", color: C.amber, borderRadius: 3, fontWeight: 600, letterSpacing: 1 }}>PLEDGED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginTop: 2 }}>{h.qty} shares · Avg ₹{h.avgPrice}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, color: pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(pnl, "₹", hideCapital)}</div>
                    <div style={{ fontSize: 11, color: pnl >= 0 ? C.green : C.red, fontFamily: F_MONO }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: C.surface2, borderRadius: 4, padding: "7px 10px" }}>
                    <div style={{ fontSize: 9, color: C.textD }}>AVG PRICE</div>
                    <div style={{ fontSize: 13, color: C.text, fontFamily: F_MONO }}>₹{h.avgPrice}</div>
                  </div>
                  <div style={{ background: C.surface2, borderRadius: 4, padding: "7px 10px" }}>
                    <div style={{ fontSize: 9, color: C.textD }}>CMP</div>
                    <input type="number" value={h.cmp || ""} onChange={e => updateCMP(h.id, e.target.value)} placeholder="Update" style={{ background: "transparent", border: "none", color: C.text, fontSize: 13, fontFamily: F_MONO, width: "100%", outline: "none", padding: 0, marginTop: 2 }} />
                  </div>
                  <div style={{ background: C.surface2, borderRadius: 4, padding: "7px 10px" }}>
                    <div style={{ fontSize: 9, color: C.textD }}>VALUE</div>
                    <div style={{ fontSize: 13, color: C.text, fontFamily: F_MONO }}>{dAmt(value, "₹", hideCapital)}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn variant="primary" onClick={() => setPage("addtrade")} size="sm">+ Add Trade</Btn>
                  <Btn onClick={() => togglePledge(h.id)} size="sm" style={{ color: h.pledged ? C.amber : C.textM, borderColor: h.pledged ? C.amber + "60" : C.border }}>{h.pledged ? "✓ Pledged" : "Mark Pledged"}</Btn>
                  <Btn onClick={() => startEdit(h)} size="sm">Edit</Btn>
                  <Btn variant="danger" onClick={() => remove(h.id)} size="sm">×</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bottom CTA if no holdings but want to add trade anyway */}
      <div style={{ marginTop: 16, padding: 14, background: C.surface2, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.textM }}>Trading a market not in your holdings?</span>
        <Btn variant="primary" onClick={() => setPage("addtrade")} size="sm">Add Trade Directly</Btn>
      </div>
    </div>
  );
}

function CloseTradeModal({ trade, setCloseTrade, trades, saveTrades, hideCapital }) {
  const [exitPrice, setExitPrice] = useState(trade.cmp || "");
  const [exitDate, setExitDate] = useState(today());
  const m = calcMetrics({ ...trade, exitPrice, status: "Closed" });
  const cur = trade.platform === "AB" ? "₹" : "$";
  const achievedR = exitPrice && trade.entry && trade.stopLoss
    ? (Math.abs(+exitPrice - +trade.entry) / Math.abs(+trade.entry - +trade.stopLoss)) * (m.pnl >= 0 ? 1 : -1) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, maxWidth: 420, width: "100%" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Close Trade</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{trade.market} · {trade.direction}</div>
        <div style={{ marginBottom: 14 }}><Label style={{ marginBottom: 6 }}>Exit Price</Label><Input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="Enter exit price" /></div>
        <div style={{ marginBottom: 16 }}><Label style={{ marginBottom: 6 }}>Exit Date</Label><Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} /></div>
        {exitPrice && (
          <div style={{ background: m.pnl >= 0 ? C.greenD + "20" : C.redD + "20", border: `1px solid ${m.pnl >= 0 ? C.green : C.red}40`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
            <Label>Realized P&L</Label>
            <div style={{ fontSize: 26, color: m.pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{dAmt(m.pnl, cur, hideCapital)}</div>
            {achievedR !== null && <div style={{ fontSize: 12, color: C.textM, fontFamily: F_MONO, marginTop: 4 }}>{achievedR > 0 ? "+" : ""}{achievedR.toFixed(2)}R achieved</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setCloseTrade(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={() => { if (!exitPrice) return; saveTrades(trades.map(t => t.id === trade.id ? { ...t, status: "Closed", exitPrice, exitDate } : t)); setCloseTrade(null); }} size="lg" style={{ flex: 2 }} disabled={!exitPrice}>Close Trade</Btn>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ metrics, settings, trades, hideCapital, combined, inrTotal, usdTotal, isMobile }) {
  const curve = useMemo(() => {
    const closed = trades.filter(t => t.status === "Closed" && t.exitDate);
    const byDate = {};
    closed.forEach(t => { const p = t.platform === "AB" ? calcMetrics(t).pnl : (calcMetrics(t).pnl || 0) * settings.fxRate; byDate[t.exitDate] = (byDate[t.exitDate] || 0) + (p || 0); });
    const dates = Object.keys(byDate).sort().slice(-30);
    let cum = 0;
    return dates.map(d => { cum += byDate[d]; return { date: d.slice(5), pnl: cum }; });
  }, [trades, settings]);

  // Deployment = marginPerLot × lots if entered (real capital), else riskAmt (avoid showing notional)
  const inrDep = trades.filter(t => t.status === "Open" && t.platform === "AB").reduce((a, t) => {
    const m = calcMetrics(t);
    const margin = +t.marginPerLot || 0;
    return a + (margin > 0 ? +t.qty * margin : m.riskAmt);
  }, 0);
  const usdDep = trades.filter(t => t.status === "Open" && t.platform === "Exness").reduce((a, t) => {
    const m = calcMetrics(t);
    const margin = +t.marginPerLot || 0;
    return a + (margin > 0 ? +t.qty * margin : m.riskAmt);
  }, 0);
  const g2 = isMobile ? "1fr" : "1fr 1fr";
  const g3 = isMobile ? "1fr" : "1fr 1fr 1fr";

  const totalCap = settings.totalCapital || 12000000;
  const abTarget = settings.inrCapital || 8500000;
  const exCapUsd = settings.usdCapital || 35000;
  const exTarget = exCapUsd * (settings.fxRate || 100);
  const abStocks = settings.abStocks || 6500000;
  const abTrading = settings.abTrading || 1200000;
  const abDryPowder = settings.abDryPowder || 800000;
  const stocksPledged = settings.stocksPledged || 4500000;
  const stocksUnpledged = settings.stocksUnpledged || 2000000;
  const tradingDeployed = inrDep;
  const pledgeNet = settings.pledgeMargin || 0;
  const dryPowderUsed = settings.dryPowderUsed || 0;
  const annualLossLimit = totalCap * (settings.annualDDLimit || 30) / 100;
  // Annual DD — current year only
  const currentYear = new Date().getFullYear().toString();
  const yearTrades = trades.filter(t => t.status === "Closed" && (t.exitDate || "").startsWith(currentYear));
  const yearInrPnl = yearTrades.filter(t => t.platform === "AB").reduce((a, t) => a + (calcMetrics(t).pnl || 0), 0);
  const yearUsdPnl = yearTrades.filter(t => t.platform === "Exness").reduce((a, t) => a + (calcMetrics(t).pnl || 0), 0);
  const totalPnlInr = yearInrPnl + yearUsdPnl * (settings.fxRate || 100);
  const annualDDUsed = Math.min(0, totalPnlInr);
  const annualDDPct = totalCap > 0 ? Math.abs(annualDDUsed) / totalCap * 100 : 0;
  const dDLimit = settings.dailyDDLimit || 3;
  const wDLimit = settings.weeklyDDLimit || 6;
  const mDLimit = settings.monthlyDDLimit || 10;

  // deployment % for top cards
  const combinedDeployed = inrDep + usdDep * (settings.fxRate || 100);
  const combinedDepPct = combined > 0 ? (combinedDeployed / combined) * 100 : 0;
  const abDepPct = abTarget > 0 ? (inrDep / abTarget) * 100 : 0;
  const exDepPct = exTarget > 0 ? (usdDep * (settings.fxRate||100) / exTarget) * 100 : 0;

  const pnlColor = (n) => n > 0 ? C.green : n < 0 ? C.red : C.textM;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── ALERTS ── */}
      {(metrics.dayDD <= -dDLimit || metrics.weekDD <= -wDLimit || metrics.monthDD <= -mDLimit || metrics.weekLockdownActive || metrics.monthLockdownActive) && (
        <div style={{ background: C.redD + "30", border: `1px solid ${C.red}50`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: C.red, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>⚠ Circuit / HWM Alert</div>
          {metrics.dayDD <= -dDLimit && <div style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>Daily circuit ({metrics.dayDD.toFixed(1)}%) — stop today</div>}
          {metrics.weekDD <= -wDLimit && <div style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>Weekly circuit ({metrics.weekDD.toFixed(1)}%) — stop this week</div>}
          {metrics.monthDD <= -mDLimit && <div style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>Monthly circuit ({metrics.monthDD.toFixed(1)}%) — full stop</div>}
          {metrics.weekLockdownActive && <div style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>Weekly HWM lockdown — no new trades</div>}
          {metrics.monthLockdownActive && <div style={{ fontSize: 12, color: C.text, padding: "3px 0" }}>Monthly HWM lockdown — no new trades</div>}
        </div>
      )}
      {metrics.recommendedRisk < 1 && (
        <div style={{ background: C.amber + "12", border: `1px solid ${C.amber}40`, borderRadius: 8, padding: 12 }}>
          <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>Size cut active — </span>
          <span style={{ fontSize: 11, color: C.textM }}>Monthly DD {metrics.monthDD.toFixed(1)}% → use </span>
          <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>{metrics.recommendedRisk}% risk per trade</span>
        </div>
      )}
      {metrics.breaches.filter(b => !b.msg.includes("circuit") && !b.msg.includes("HWM")).map((b, i) => (
        <div key={i} style={{ background: C.redD + "20", border: `1px solid ${C.red}35`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.text }}>⚠ {b.msg}</div>
      ))}

      {/* ── PORTFOLIO OVERVIEW — 3 big cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: g3, gap: 10 }}>
        {/* Combined */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <Label style={{ marginBottom: 8 }}>Total Portfolio</Label>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: C.text, fontFamily: F_MONO, lineHeight: 1.1 }}>{dAmt(combined, "₹", hideCapital)}</div>
          <div style={{ fontSize: 11, color: pnlColor(totalPnlInr), fontFamily: F_MONO, marginTop: 4 }}>{totalPnlInr >= 0 ? "+" : ""}{dAmt(totalPnlInr, "₹", hideCapital)} all time</div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.textD }}>Deployed in trades</span>
              <span style={{ fontSize: 10, color: C.textM, fontFamily: F_MONO }}>{combinedDepPct.toFixed(1)}%</span>
            </div>
            <Bar_ pct={combinedDepPct} color={C.accent} height={5} />
          </div>
        </div>

        {/* Aditya Birla */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <Label style={{ marginBottom: 8 }}>Aditya Birla</Label>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: C.text, fontFamily: F_MONO, lineHeight: 1.1 }}>{dAmt(inrTotal, "₹", hideCapital)}</div>
          <div style={{ fontSize: 11, color: pnlColor(metrics.inrPnl), fontFamily: F_MONO, marginTop: 4 }}>{metrics.inrPnl >= 0 ? "+" : ""}{dAmt(metrics.inrPnl, "₹", hideCapital)} P&L</div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.textD }}>Deployed</span>
              <span style={{ fontSize: 10, color: C.textM, fontFamily: F_MONO }}>{abDepPct.toFixed(1)}% · {dAmt(inrDep, "₹", hideCapital)}</span>
            </div>
            <Bar_ pct={abDepPct} color={C.green} height={5} />
          </div>
        </div>

        {/* Exness */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <Label style={{ marginBottom: 8 }}>Exness</Label>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: C.text, fontFamily: F_MONO, lineHeight: 1.1 }}>{dAmt(usdTotal, "$", hideCapital)}</div>
          <div style={{ fontSize: 11, color: pnlColor(metrics.usdPnl), fontFamily: F_MONO, marginTop: 4 }}>{metrics.usdPnl >= 0 ? "+" : ""}{dAmt(metrics.usdPnl, "$", hideCapital)} P&L</div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.textD }}>Deployed</span>
              <span style={{ fontSize: 10, color: C.textM, fontFamily: F_MONO }}>{exDepPct.toFixed(1)}% · {dAmt(usdDep, "$", hideCapital)}</span>
            </div>
            <Bar_ pct={exDepPct} color={C.green} height={5} />
          </div>
        </div>
      </div>

      {/* ── CIRCUIT GAUGES — inline compact row ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <Label style={{ marginBottom: 12 }}>Drawdown Gauges</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[[`Daily`, metrics.dayDD, dDLimit], [`Weekly`, metrics.weekDD, wDLimit], [`Monthly`, metrics.monthDD, mDLimit]].map(([label, dd, lim]) => {
            const pct = Math.min(100, Math.abs(dd) / lim * 100);
            const color = dd <= -lim ? C.red : dd <= -lim * 0.66 ? C.amber : C.green;
            return (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.textM }}>{label} <span style={{ color: C.textD, fontSize: 10 }}>limit -{lim}%</span></span>
                  <span style={{ fontSize: 12, color, fontFamily: F_MONO, fontWeight: 600 }}>{dd >= 0 ? "+" : ""}{dd.toFixed(2)}% <span style={{ fontSize: 10, color: C.textD }}>({pct.toFixed(0)}% used)</span></span>
                </div>
                <Bar_ pct={pct} color={color} height={6} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CAPITAL ARCHITECTURE ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <Label style={{ marginBottom: 16 }}>Capital Architecture</Label>

        {/* AB Section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Aditya Birla</span>
            <span style={{ fontSize: 13, color: C.textM, fontFamily: F_MONO }}>{dAmt(abTarget, "₹", hideCapital)}</span>
          </div>

          {/* Stacked breakdown bar */}
          <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", marginBottom: 8 }}>
            <div style={{ width: `${(abStocks/abTarget)*100}%`, background: C.accent, opacity: 0.9 }} />
            <div style={{ width: `${(abTrading/abTarget)*100}%`, background: C.green, opacity: 0.9 }} />
            <div style={{ width: `${(abDryPowder/abTarget)*100}%`, background: C.amber, opacity: 0.9 }} />
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {[{label:"Stocks", val: abStocks, color: C.accent},{label:"Trading", val: abTrading, color: C.green},{label:"Dry Powder", val: abDryPowder, color: C.amber}].map(b => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                <span style={{ fontSize: 10, color: C.textM }}>{b.label}</span>
                <span style={{ fontSize: 10, color: b.color, fontFamily: F_MONO }}>{dAmt(b.val, "₹", hideCapital)}</span>
              </div>
            ))}
          </div>

          {/* Individual bucket rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Stocks", target: abStocks, deployed: pledgeNet > 0 ? pledgeNet : 0, free: abStocks - Math.min(abStocks, pledgeNet), color: C.accent, sub: `Pledged ₹${(stocksPledged/100000).toFixed(0)}L · Unpledged ₹${(stocksUnpledged/100000).toFixed(0)}L` },
              { label: "Trading Capital", target: abTrading, deployed: tradingDeployed, free: Math.max(0, abTrading - tradingDeployed), color: C.green, sub: "Active futures / options" },
              { label: "Dry Powder", target: abDryPowder, deployed: dryPowderUsed, free: Math.max(0, abDryPowder - dryPowderUsed), color: C.amber, sub: "For new opportunities" },
            ].map(b => (
              <div key={b.label} style={{ background: C.surface2, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{b.label}</span>
                    <div style={{ fontSize: 10, color: C.textD, marginTop: 1 }}>{b.sub}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: b.color, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(b.target, "₹", hideCapital)}</div>
                    <div style={{ fontSize: 9, color: C.textD, fontFamily: F_MONO }}>{dAmt(b.free, "₹", hideCapital)} free</div>
                  </div>
                </div>
                <Bar_ pct={b.target > 0 ? (b.deployed / b.target) * 100 : 0} color={b.color} height={4} />
              </div>
            ))}
          </div>

          {/* Stocks pledge detail */}
          <div style={{ marginTop: 8, padding: "10px 12px", background: C.dim, borderRadius: 6, borderLeft: `3px solid ${C.accent}` }}>
            <div style={{ fontSize: 10, color: C.textD, letterSpacing: 1, marginBottom: 8 }}>STOCKS DETAIL</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 9, color: C.textD }}>PLEDGED</div><div style={{ fontSize: 13, color: C.amber, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{dAmt(stocksPledged, "₹", hideCapital)}</div></div>
              <div><div style={{ fontSize: 9, color: C.textD }}>NET MARGIN</div><div style={{ fontSize: 13, color: C.green, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{dAmt(pledgeNet, "₹", hideCapital)}</div></div>
              <div><div style={{ fontSize: 9, color: C.textD }}>UNPLEDGED</div><div style={{ fontSize: 13, color: C.text, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{dAmt(stocksUnpledged, "₹", hideCapital)}</div></div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border, marginBottom: 20 }} />

        {/* Exness Section */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Exness</span>
            <span style={{ fontSize: 13, color: C.textM, fontFamily: F_MONO }}>{dAmt(exCapUsd, "$", hideCapital)} = {dAmt(exTarget, "₹", hideCapital)}</span>
          </div>
          <div style={{ background: C.surface2, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>Open Positions</span>
                <div style={{ fontSize: 10, color: C.textD, marginTop: 1 }}>Forex, metals, commodities</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: C.green, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(usdDep, "$", hideCapital)}</div>
                <div style={{ fontSize: 9, color: C.textD, fontFamily: F_MONO }}>{dAmt(Math.max(0, exCapUsd - usdDep), "$", hideCapital)} free</div>
              </div>
            </div>
            <Bar_ pct={exCapUsd > 0 ? (usdDep / exCapUsd) * 100 : 0} color={C.green} height={4} />
          </div>
        </div>
      </div>

      {/* ── RISK + ANNUAL DD ── */}
      <div style={{ display: "grid", gridTemplateColumns: g2, gap: 10 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <Label style={{ marginBottom: 12 }}>Risk Exposure</Label>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Combined</span>
            <span style={{ fontSize: 16, color: metrics.totalRiskPct > 5 ? C.red : metrics.totalRiskPct > 3 ? C.amber : C.green, fontFamily: F_MONO, fontWeight: 700 }}>{metrics.totalRiskPct.toFixed(2)}%</span>
          </div>
          <Bar_ pct={metrics.totalRiskPct * 10} color={metrics.totalRiskPct > 5 ? C.red : metrics.totalRiskPct > 3 ? C.amber : C.green} height={7} />
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textD }}>AB · {metrics.inrRiskPct.toFixed(2)}%</span><span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>{dAmt(metrics.openInrRisk, "₹", hideCapital)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textD }}>Exness · {metrics.usdRiskPct.toFixed(2)}%</span><span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>{dAmt(metrics.openUsdRisk, "$", hideCapital)}</span></div>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: C.textD }}>Active risk / 5 trades · BE excluded</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 13, color: metrics.openWithRiskCount >= 5 ? C.red : C.text, fontFamily: F_MONO, fontWeight: 700 }}>{metrics.openWithRiskCount}/5</div>
            <span style={{ fontSize: 11, color: C.textD }}>trades with active risk</span>
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <Label style={{ marginBottom: 12 }}>Annual Drawdown · {settings.annualDDLimit || 30}% limit</Label>
          <div style={{ fontSize: 22, color: annualDDPct > 20 ? C.red : annualDDPct > 15 ? C.amber : C.text, fontFamily: F_MONO, fontWeight: 700 }}>{dAmt(Math.abs(annualDDUsed), "₹", hideCapital)}</div>
          <div style={{ fontSize: 11, color: C.textM, marginTop: 4 }}>{annualDDPct.toFixed(2)}% of {dAmt(annualLossLimit, "₹", hideCapital)} used</div>
          <div style={{ marginTop: 10 }}><Bar_ pct={annualDDPct / (settings.annualDDLimit || 30) * 100} color={annualDDPct > 20 ? C.red : annualDDPct > 15 ? C.amber : C.green} height={7} /></div>
          <div style={{ marginTop: 8, fontSize: 11, color: annualDDUsed < 0 ? C.textM : C.green }}>{annualDDUsed < 0 ? `${dAmt(Math.max(0, annualLossLimit - Math.abs(annualDDUsed)), "₹", hideCapital)} remaining this year` : "No losses recorded this year"}</div>
        </div>
      </div>

      {/* ── EQUITY CURVE ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <Label style={{ marginBottom: 14 }}>Equity Curve · Last 30 Days</Label>
        <div style={{ height: 180 }}>
          {curve.length > 1 ? (
            <ResponsiveContainer><LineChart data={curve} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke={C.border} strokeDasharray="2 2" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} /><YAxis tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} tickFormatter={v => hideCapital ? "•" : fmt(v)} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: F_MONO }} formatter={v => [dAmt(v, "₹", hideCapital), "Cum P&L"]} /><Line type="monotone" dataKey="pnl" stroke={C.accent} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
          ) : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: C.textD }}>No closed trades yet</div>}
        </div>
      </div>

      {/* ── PERFORMANCE SUMMARY ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <Label style={{ marginBottom: 14 }}>Performance</Label>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 14 }}>
          {[
            { label: "Monthly Return", value: hideCapital ? "•••" : `${metrics.monthReturnPct >= 0 ? "+" : ""}${metrics.monthReturnPct.toFixed(2)}%`, sub: "Target 6–10%", color: metrics.monthReturnPct >= 6 ? C.green : metrics.monthReturnPct >= 0 ? C.text : C.red },
            { label: "Weekly P&L", value: dAmt((metrics.weekInrPnl||0)+(metrics.weekUsdPnl||0)*(settings.fxRate||100),"₹",hideCapital), sub: "This week", color: (metrics.weekInrPnl||0)+(metrics.weekUsdPnl||0)*(settings.fxRate||100) >= 0 ? C.green : C.red },
            { label: "Month ₹ P&L", value: dAmt(metrics.monthInrPnl,"₹",hideCapital), sub: "AB platform", color: metrics.monthInrPnl >= 0 ? C.green : C.red },
            { label: "Losses Today", value: String(metrics.todayLosses), sub: "3 = stop trading", color: metrics.todayLosses >= 3 ? C.red : metrics.todayLosses >= 2 ? C.amber : C.text },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, color: C.textD, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ fontSize: 20, color: s.color, fontFamily: F_MONO, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function Positions({ trades, saveTrades, setEditTrade, setPyramidTrade, setCloseTrade, hideCapital, isMobile, metrics, settings }) {
  const [filter, setFilter] = useState("All");
  const [pf, setPf] = useState("All");
  const filtered = trades.filter(t => (filter === "All" || t.status === filter) && (pf === "All" || t.platform === pf));
  const del = (id) => { if (confirm("Delete this trade?")) saveTrades(trades.filter(t => t.id !== id)); };
  const activate = (id) => saveTrades(trades.map(t => t.id === id ? { ...t, status: "Open" } : t));
  const updateCMP = (id, val) => saveTrades(trades.map(t => t.id === id ? { ...t, cmp: val } : t));
  const updateSL = (id, val) => saveTrades(trades.map(t => t.id === id ? { ...t, currentSL: val } : t));

  const FilterBar = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {["All", "Open", "Closed", "Pending"].map(f => <Btn key={f} variant={filter === f ? "primary" : "ghost"} onClick={() => setFilter(f)} size="sm">{f}</Btn>)}
      <div style={{ width: 1, background: C.border, margin: "0 2px" }} />
      {["All", "AB", "Exness"].map(p => <Btn key={p} variant={pf === p ? "primary" : "ghost"} onClick={() => setPf(p)} size="sm">{p}</Btn>)}
    </div>
  );

  // Summary stats for open trades
  const openTrades = trades.filter(t => t.status === "Open");
  const totalLivePnl = openTrades.reduce((a, t) => {
    const m = calcMetrics(t);
    return a + (m.livePnl !== null ? (t.platform === "AB" ? m.livePnl : m.livePnl * settings.fxRate) : 0);
  }, 0);
  const totalActiveRisk = metrics.openWithRiskCount;
  const hasCMP = openTrades.some(t => t.cmp);

  const SummaryBar = () => openTrades.length > 0 ? (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>OPEN</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: F_MONO, marginTop: 4 }}>{openTrades.length}</div>
        <div style={{ fontSize: 9, color: C.textD }}>trades total</div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>ACTIVE RISK</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: totalActiveRisk >= 5 ? C.red : totalActiveRisk >= 3 ? C.amber : C.text, fontFamily: F_MONO, marginTop: 4 }}>{totalActiveRisk}/5</div>
        <div style={{ fontSize: 9, color: C.textD }}>trades at risk</div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${hasCMP ? (totalLivePnl >= 0 ? C.green + "40" : C.red + "40") : C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>LIVE P&L</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: !hasCMP ? C.textD : totalLivePnl >= 0 ? C.green : C.red, fontFamily: F_MONO, marginTop: 4 }}>{hasCMP ? dAmt(totalLivePnl, "₹", hideCapital) : "—"}</div>
        <div style={{ fontSize: 9, color: C.textD }}>{hasCMP ? "update CMP for live" : "enter CMP to track"}</div>
      </div>
      {!isMobile && <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>RISK AMOUNT</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: F_MONO, marginTop: 4 }}>{dAmt(metrics.openInrRisk, "₹", hideCapital)}</div>
        <div style={{ fontSize: 9, color: C.textD }}>{metrics.totalRiskPct.toFixed(2)}% of capital</div>
      </div>}
    </div>
  ) : null;

  if (filtered.length === 0) return <div><SummaryBar /><FilterBar /><Card><div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No trades match these filters</div></Card></div>;

  // MOBILE: card layout
  if (isMobile) return (
    <div>
      <SummaryBar />
      <FilterBar />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(t => {
          const m = calcMetrics(t); const cur = t.platform === "AB" ? "₹" : "$";
          const isOpen = t.status === "Open";
          const isPending = t.status === "Pending";
          const isClosed = t.status === "Closed";
          const sColor = isOpen ? C.green : isClosed ? C.textD : C.amber;
          const displayPnl = isClosed ? m.pnl : m.livePnl;
          const pnlColor = (displayPnl || 0) > 0 ? C.green : (displayPnl || 0) < 0 ? C.red : C.textD;
          return (
            <div key={t.id} style={{ background: C.surface, border: `1px solid ${isOpen ? C.border : C.dim}`, borderRadius: 10, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{t.market}{t.parentId && <span style={{ color: C.amber, fontSize: 11, marginLeft: 6 }}>↗</span>}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction}</span>
                        <span style={{ fontSize: 11, color: C.textD }}>·</span>
                        <span style={{ fontSize: 11, color: C.textD }}>{t.platform === "AB" ? "AB" : "Exness"}</span>
                        <span style={{ fontSize: 11, color: C.textD }}>·</span>
                        <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>{t.date.slice(5)}{isOpen ? ` · ${timeSince(t.date)}` : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: sColor + "20", color: sColor, fontWeight: 600 }}>{t.status}</span>
                    {displayPnl !== null && displayPnl !== undefined && (
                      <span style={{ fontSize: 15, fontFamily: F_MONO, fontWeight: 700, color: pnlColor }}>{dAmt(displayPnl, cur, hideCapital)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Price grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border }}>
                {[
                  ["ENTRY", t.entry, C.text],
                  ["STOP", `${t.currentSL || t.stopLoss}${m.slAtBE ? " ✓BE" : ""}`, m.slAtBE ? C.green : C.textM],
                  ["TARGET", t.target || "—", C.textM],
                  ["LOTS", t.qty, C.text],
                  ["R:R", m.rr ? `1:${m.rr}` : "—", m.rr >= 3 ? C.green : m.rr > 0 ? C.amber : C.textD],
                  ["RISK", m.riskAmt > 0 ? dAmt(m.riskAmt, cur, hideCapital) : (m.slAtBE ? "0 (BE)" : "—"), m.slAtBE ? C.green : C.textM],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: C.surface2, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, color, fontFamily: F_MONO, fontWeight: 600 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Live tracking — open trades only */}
              {isOpen && (
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textD, marginBottom: 6, letterSpacing: 0.5 }}>Current Price (CMP)</div>
                      <input type="number" value={t.cmp || ""} onChange={e => updateCMP(t.id, e.target.value)} placeholder="Enter to track P&L" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", fontSize: 14, fontFamily: F_MONO, width: "100%", boxSizing: "border-box", outline: "none" }} />
                      {m.liveR !== null && (
                        <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                          <span style={{ fontSize: 12, color: m.liveR >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{m.liveR >= 0 ? "+" : ""}{m.liveR}R</span>
                          <span style={{ fontSize: 12, color: pnlColor, fontFamily: F_MONO }}>{dAmt(displayPnl, cur, hideCapital)}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: C.textD }}>Stop Loss (current)</div>
                        {!m.slAtBE && m.bePrice > 0 && (
                          <button onClick={() => updateSL(t.id, m.bePrice.toFixed(2))} style={{ fontSize: 10, padding: "3px 8px", background: C.amber + "25", border: `1px solid ${C.amber}50`, color: C.amber, borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>→ BE</button>
                        )}
                      </div>
                      <input type="number" value={t.currentSL || ""} onChange={e => updateSL(t.id, e.target.value)} placeholder={`Move to ${m.bePrice > 0 ? m.bePrice.toFixed(2) : "entry"}`} style={{ background: C.surface2, border: `1.5px solid ${m.slAtBE ? C.green : C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", fontSize: 14, fontFamily: F_MONO, width: "100%", boxSizing: "border-box", outline: "none" }} />
                      {m.slAtBE && <div style={{ fontSize: 11, color: C.green, marginTop: 5, fontWeight: 600 }}>✓ At breakeven — free trade</div>}
                      {!m.slAtBE && m.oneRLevel > 0 && t.cmp && +t.cmp >= m.oneRLevel && (
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 5 }}>Price at 1R — move SL to entry now</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isPending && <Btn variant="success" onClick={() => activate(t.id)} size="md" style={{ flex: 1 }}>Activate</Btn>}
                {isOpen && <Btn variant="danger" onClick={() => setCloseTrade(t)} size="md" style={{ flex: 1 }}>Close Trade</Btn>}
                {isOpen && !t.parentId && <Btn onClick={() => setPyramidTrade(t)} size="md" style={{ color: C.amber, borderColor: C.amber + "50", flex: 1 }}>+ Pyramid</Btn>}
                <Btn onClick={() => setEditTrade(t)} size="md" style={{ flex: 1 }}>Edit</Btn>
                <Btn variant="danger" onClick={() => del(t.id)} size="sm">×</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // DESKTOP: table
  return (
    <div>
      <SummaryBar />
      <FilterBar />
      <Card padding={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                {["Date", "Market", "Plat", "Dir", "Entry", "SL / BE", "Target", "Qty", "CMP", "R:R", "Status", "P&L", ""].map(h => (
                  <th key={h} style={{ padding: "11px 10px", textAlign: "left", color: C.textM, fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const m = calcMetrics(t); const cur = t.platform === "AB" ? "₹" : "$";
                const displayPnl = t.status === "Closed" ? m.pnl : m.livePnl;
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 10px", color: C.textM, fontFamily: F_MONO, whiteSpace: "nowrap" }}>{t.date.slice(5)}</td>
                    <td style={{ padding: "10px 10px", color: C.text, whiteSpace: "nowrap" }}>{t.market}{t.parentId && <span style={{ color: C.amber, fontSize: 9, marginLeft: 4 }}>↗</span>}</td>
                    <td style={{ padding: "10px 10px", color: C.textM, fontSize: 11 }}>{t.platform === "AB" ? "AB" : "Ex"}</td>
                    <td style={{ padding: "10px 10px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction[0]}</td>
                    <td style={{ padding: "10px 10px", color: C.text, fontFamily: F_MONO }}>{t.entry}</td>
                    <td style={{ padding: "10px 10px", fontFamily: F_MONO }}>
                      <div style={{ color: m.slAtBE ? C.green : C.textM }}>{t.currentSL || t.stopLoss}{m.slAtBE && <span style={{ fontSize: 9, marginLeft: 4, color: C.green }}>BE</span>}</div>
                      {t.status === "Open" && <input type="number" value={t.currentSL || ""} onChange={e => updateSL(t.id, e.target.value)} placeholder="update" style={{ background: "transparent", border: "none", color: C.textD, fontSize: 10, fontFamily: F_MONO, width: 60, outline: "none", marginTop: 2 }} />}
                    </td>
                    <td style={{ padding: "10px 10px", color: C.textM, fontFamily: F_MONO }}>{t.target || "—"}</td>
                    <td style={{ padding: "10px 10px", color: C.text, fontFamily: F_MONO }}>{t.qty}</td>
                    <td style={{ padding: "10px 10px" }}>
                      {t.status === "Open" && <input type="number" value={t.cmp || ""} onChange={e => updateCMP(t.id, e.target.value)} placeholder="—" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, fontFamily: F_MONO, width: 76, padding: "4px 6px", borderRadius: 3, outline: "none" }} />}
                    </td>
                    <td style={{ padding: "10px 10px", color: m.rr >= 3 ? C.green : m.rr > 0 ? C.amber : C.textD, fontFamily: F_MONO }}>{m.rr ? `1:${m.rr}` : "—"}</td>
                    <td style={{ padding: "10px 10px" }}><span style={{ fontSize: 10, padding: "3px 7px", borderRadius: 3, background: t.status === "Open" ? C.green + "20" : t.status === "Closed" ? C.dim : C.amber + "20", color: t.status === "Open" ? C.green : t.status === "Closed" ? C.textM : C.amber, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>{t.status}</span></td>
                    <td style={{ padding: "10px 10px", color: (displayPnl || 0) > 0 ? C.green : (displayPnl || 0) < 0 ? C.red : C.textD, fontFamily: F_MONO, fontWeight: 600 }}>
                      {displayPnl !== null && displayPnl !== undefined ? dAmt(displayPnl, cur, hideCapital) : "—"}
                      {m.liveR !== null && t.status === "Open" && <div style={{ fontSize: 9, color: m.liveR >= 0 ? C.green : C.red }}>{m.liveR >= 0 ? "+" : ""}{m.liveR}R</div>}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      {t.status === "Pending" && <Btn variant="success" onClick={() => activate(t.id)} size="sm" style={{ marginRight: 4 }}>Activate</Btn>}
                      {t.status === "Open" && <Btn variant="danger" onClick={() => setCloseTrade(t)} size="sm" style={{ marginRight: 4 }}>Close</Btn>}
                      {t.status === "Open" && !t.parentId && <button onClick={() => setPyramidTrade(t)} style={{ background: "transparent", border: "none", color: C.amber, cursor: "pointer", fontSize: 14, marginRight: 6, fontWeight: 700 }}>+</button>}
                      <button onClick={() => setEditTrade(t)} style={{ background: "transparent", border: "none", color: C.textM, cursor: "pointer", fontSize: 11, marginRight: 6 }}>Edit</button>
                      <button onClick={() => del(t.id)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AddTrade({ trades, saveTrades, settings, setPage, hideCapital, isMobile, recommendedRisk }) {
  const [t, setT] = useState({ date: today(), market: "MCX Gold Mini", platform: "AB", direction: "Long", entry: "", stopLoss: "", target: "", qty: "", marginPerLot: "", conviction: 7, status: "Pending", setupTag: SETUP_TAGS[0], multiplier: CONTRACT_MULTIPLIERS["MCX Gold Mini"] });
  const [preTrade, setPreTrade] = useState(PRE_TRADE_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}));

  const onMarketChange = (m) => setT({ ...t, market: m, multiplier: CONTRACT_MULTIPLIERS[m] !== undefined ? CONTRACT_MULTIPLIERS[m] : 1 });
  const onPlatformChange = (p) => { const m = p === "AB" ? MARKETS_INR[0] : MARKETS_USD[0]; setT({ ...t, platform: p, market: m, multiplier: CONTRACT_MULTIPLIERS[m] !== undefined ? CONTRACT_MULTIPLIERS[m] : 1 }); };

  const m = calcMetrics(t);
  const cur = t.platform === "AB" ? "₹" : "$";
  const totalCap = settings.inrCapital + settings.usdCapital * settings.fxRate;
  const riskInr = t.platform === "AB" ? m.riskAmt : m.riskAmt * settings.fxRate;
  const actualRiskPct = totalCap > 0 ? (riskInr / totalCap) * 100 : 0;
  const warnRR = m.rr > 0 && m.rr < 2.99;
  const warnRisk = actualRiskPct > 2.5;
  const checklistCount = Object.values(preTrade).filter(Boolean).length;
  const multLocked = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "Nifty 50", "BankNifty"].includes(t.market);
  const g2 = isMobile ? "1fr" : "1fr 1fr";
  const g4 = isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)";

  const submit = () => {
    if (!t.entry || !t.stopLoss || !t.qty) { alert("Entry, Stop Loss, Quantity are required"); return; }
    saveTrades([{ ...t, id: "trade_" + Date.now(), checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}), pnl: null, exitPrice: null, exitDate: null, preTrade, mistakeTag: null, exitReason: null }, ...trades]);
    setPage("positions");
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Card>
        <Label>Trade Details</Label>
        <div style={{ display: "grid", gridTemplateColumns: g2, gap: 14, marginTop: 16 }}>
          <div><Label style={{ marginBottom: 6 }}>Platform</Label><Select value={t.platform} onChange={e => onPlatformChange(e.target.value)} options={[{ value: "AB", label: "Aditya Birla (₹)" }, { value: "Exness", label: "Exness ($)" }]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Market</Label><Select value={t.market} onChange={e => onMarketChange(e.target.value)} options={t.platform === "AB" ? MARKETS_INR : MARKETS_USD} /></div>
          <div><Label style={{ marginBottom: 6 }}>Direction</Label><Select value={t.direction} onChange={e => setT({ ...t, direction: e.target.value })} options={["Long", "Short"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Status</Label><Select value={t.status} onChange={e => setT({ ...t, status: e.target.value })} options={["Pending", "Open"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Entry Price</Label><Input type="number" value={t.entry} onChange={e => setT({ ...t, entry: e.target.value })} placeholder="0.00" /></div>
          <div><Label style={{ marginBottom: 6 }}>Stop Loss</Label><Input type="number" value={t.stopLoss} onChange={e => setT({ ...t, stopLoss: e.target.value })} placeholder="0.00" /></div>
          <div><Label style={{ marginBottom: 6 }}>Target</Label><Input type="number" value={t.target} onChange={e => setT({ ...t, target: e.target.value })} placeholder="0.00" /></div>
          <div>
            <Label style={{ marginBottom: 6 }}>Number of Lots</Label>
            <Input type="number" value={t.qty} onChange={e => setT({ ...t, qty: e.target.value })} placeholder="e.g. 4" />
            <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>How many lots you bought/sold</div>
          </div>
          <div>
            <Label style={{ marginBottom: 6 }}>Margin per Lot (₹) <span style={{ color: C.textD, fontSize: 9 }}>optional</span></Label>
            <Input type="number" value={t.marginPerLot || ""} onChange={e => setT({ ...t, marginPerLot: e.target.value })} placeholder="e.g. 55000" />
            <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Real capital blocked per lot by broker</div>
          </div>
          {t.platform === "AB" && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Contract Multiplier {multLocked && <span style={{ color: C.textD, fontSize: 9, marginLeft: 6 }}>auto-set</span>}</Label>
              <Input type="number" value={t.multiplier} onChange={e => setT({ ...t, multiplier: +e.target.value || 1 })} style={{ opacity: multLocked ? 0.7 : 1 }} />
            </div>
          )}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Conviction (1–10)</Label>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setT({ ...t, conviction: n })} style={{ flex: 1, padding: "8px 0", background: t.conviction >= n ? (n >= 8 ? C.green + "30" : n >= 6 ? C.amber + "20" : C.red + "20") : C.surface2, color: t.conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) : C.textD, border: `1px solid ${t.conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) + "50" : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: "pointer", fontWeight: 600 }}>{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, marginTop: 6, color: t.conviction >= 8 ? C.green : t.conviction >= 6 ? C.amber : C.red }}>{t.conviction >= 8 ? "High conviction — good to go" : t.conviction >= 6 ? "Medium — double-check setup" : "Low conviction — consider skipping"}</div>
          </div>
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}><Label style={{ marginBottom: 6 }}>Setup Type</Label><Select value={t.setupTag} onChange={e => setT({ ...t, setupTag: e.target.value })} options={SETUP_TAGS} /></div>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Label>Pre-Trade Checklist</Label>
          <span style={{ fontSize: 10, color: checklistCount === PRE_TRADE_CHECKLIST.length ? C.green : C.textD, fontFamily: F_MONO }}>{checklistCount}/{PRE_TRADE_CHECKLIST.length}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 8 }}>
          {PRE_TRADE_CHECKLIST.map(c => (
            <div key={c.key} onClick={() => setPreTrade({ ...preTrade, [c.key]: !preTrade[c.key] })} style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: preTrade[c.key] ? C.green + "10" : C.surface2, border: `1px solid ${preTrade[c.key] ? C.green + "40" : C.border}`, borderRadius: 4, cursor: "pointer" }}>
              <div style={{ width: 12, height: 12, border: `1.5px solid ${preTrade[c.key] ? C.green : C.borderH}`, background: preTrade[c.key] ? C.green : "transparent", borderRadius: 2, marginRight: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{preTrade[c.key] && <span style={{ color: C.bg, fontSize: 8, fontWeight: 700 }}>✓</span>}</div>
              <span style={{ fontSize: 11, color: preTrade[c.key] ? C.text : C.textM }}>{c.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: g4, gap: 12, marginTop: 16 }}>
        <Stat label="Risk Amount" value={dAmt(m.riskAmt, cur, hideCapital)} sub={`${actualRiskPct.toFixed(2)}% of total`} color={warnRisk ? C.red : C.text} />
        <Stat label="R:R Ratio" value={m.rr ? `1:${m.rr}` : "—"} sub={warnRR ? "Below 1:3" : m.rr >= 3 ? "✓ Min met" : ""} color={warnRR ? C.red : m.rr >= 3 ? C.green : C.text} />
        <Stat
          label={+t.marginPerLot > 0 ? "Capital Required" : "Position Value (Notional)"}
          value={+t.marginPerLot > 0 ? dAmt(+t.qty * +t.marginPerLot, cur, hideCapital) : dAmt(m.posVal, cur, hideCapital)}
          sub={+t.marginPerLot > 0 ? `${+t.qty} lots × ${dAmt(+t.marginPerLot, cur, false)}` : "Notional — enter margin/lot for real"}
          color={+t.marginPerLot > 0 ? C.amber : C.text}
        />
        <Stat label="Stop Distance" value={m.stopDist ? m.stopDist.toFixed(2) : "—"} sub="Per unit" />
      </div>
      {(warnRR || warnRisk) && (
        <div style={{ marginTop: 16, background: C.redD + "20", border: `1px solid ${C.red}40`, borderRadius: 6, padding: 14 }}>
          {warnRisk && <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>⚠ Risk exceeds 2.5% of total capital</div>}
          {warnRR && <div style={{ fontSize: 12, color: C.red }}>⚠ R:R below minimum 1:3</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <Btn variant="ghost" onClick={() => setPage("dashboard")} size="lg">Cancel</Btn>
        <Btn variant="primary" onClick={submit} size="lg" style={{ flex: 1 }}>Save Trade</Btn>
      </div>
    </div>
  );
}

function EditTradeModal({ trade, setEditTrade, trades, saveTrades }) {
  const [t, setT] = useState({ ...trade });
  const m = calcMetrics(t);
  const cur = t.platform === "AB" ? "₹" : "$";
  const save = () => {
    const updated = { ...t };
    if (updated.status === "Closed" && !updated.exitDate) updated.exitDate = today();
    saveTrades(trades.map(tr => tr.id === t.id ? updated : tr));
    setEditTrade(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Edit Trade</div>
        <div style={{ fontSize: 16, color: C.text, marginBottom: 20 }}>{t.market} · {t.platform === "AB" ? "Aditya Birla" : "Exness"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><Label style={{ marginBottom: 6 }}>Status</Label><Select value={t.status} onChange={e => setT({ ...t, status: e.target.value })} options={["Pending", "Open", "Closed"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Direction</Label><Select value={t.direction} onChange={e => setT({ ...t, direction: e.target.value })} options={["Long", "Short"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Entry</Label><Input type="number" value={t.entry} onChange={e => setT({ ...t, entry: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Stop Loss</Label><Input type="number" value={t.stopLoss} onChange={e => setT({ ...t, stopLoss: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Target</Label><Input type="number" value={t.target} onChange={e => setT({ ...t, target: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Quantity</Label><Input type="number" value={t.qty} onChange={e => setT({ ...t, qty: e.target.value })} /></div>
          {t.platform === "AB" && (
            <div><Label style={{ marginBottom: 6 }}>Multiplier</Label><Input type="number" value={t.multiplier ?? CONTRACT_MULTIPLIERS[t.market] ?? 1} onChange={e => setT({ ...t, multiplier: +e.target.value || 1 })} /></div>
          )}
          {t.status === "Closed" && <>
            <div><Label style={{ marginBottom: 6 }}>Exit Price</Label><Input type="number" value={t.exitPrice ?? ""} onChange={e => setT({ ...t, exitPrice: e.target.value })} /></div>
            <div><Label style={{ marginBottom: 6 }}>Exit Date</Label><Input type="date" value={t.exitDate ?? today()} onChange={e => setT({ ...t, exitDate: e.target.value })} /></div>
          </>}
        </div>
        {t.status === "Closed" && m.pnl !== null && (
          <div style={{ background: m.pnl >= 0 ? C.greenD + "20" : C.redD + "20", border: `1px solid ${m.pnl >= 0 ? C.green : C.red}40`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <Label>Realized P&L</Label>
            <div style={{ fontSize: 22, color: m.pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 4 }}>{fmt(m.pnl, cur)}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setEditTrade(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={save} size="lg" style={{ flex: 2 }}>Save</Btn>
        </div>
      </div>
    </div>
  );
}

// ════════════════ PYRAMID MODAL ════════════════
function PyramidModal({ trade, setPyramidTrade, trades, saveTrades }) {
  const parent = trade;
  const isLong = parent.direction === "Long";
  const stopDist = Math.abs(+parent.entry - +parent.stopLoss);
  const oneR = isLong ? +parent.entry + stopDist : +parent.entry - stopDist;
  // Tighter stop: new stop is 50% of original distance behind the new entry (1R level)
  const newStop = isLong ? oneR - stopDist * 0.5 : oneR + stopDist * 0.5;
  const newQty = (+parent.qty * 0.5).toFixed(2);

  const [pyramid, setPyramid] = useState({
    entry: oneR.toFixed(2),
    stopLoss: newStop.toFixed(2),
    target: parent.target,
    qty: newQty,
  });

  const submit = () => {
    const newTrade = {
      id: "trade_" + Date.now(),
      date: today(),
      market: parent.market,
      platform: parent.platform,
      direction: parent.direction,
      entry: pyramid.entry,
      stopLoss: pyramid.stopLoss,
      target: pyramid.target,
      qty: pyramid.qty,
      status: "Open",
      setupTag: parent.setupTag,
      parentId: parent.id,
      multiplier: parent.multiplier || CONTRACT_MULTIPLIERS[parent.market] || 1,
      checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}),
      pnl: null, exitPrice: null, exitDate: null, mistakeTag: null, exitReason: null,
    };
    saveTrades([newTrade, ...trades]);
    setPyramidTrade(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.amber, textTransform: "uppercase", marginBottom: 4 }}>Pyramid Add</div>
        <div style={{ fontSize: 16, color: C.text, marginBottom: 6 }}>{parent.market} · {parent.direction}</div>
        <div style={{ fontSize: 11, color: C.textM, marginBottom: 20, lineHeight: 1.6 }}>Trade hit 1:1. Add 50% of original size with tighter stop. Original size: {parent.qty} → adding {newQty}.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><Label style={{ marginBottom: 6 }}>Entry (1R)</Label><Input type="number" value={pyramid.entry} onChange={e => setPyramid({ ...pyramid, entry: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Stop (Tighter)</Label><Input type="number" value={pyramid.stopLoss} onChange={e => setPyramid({ ...pyramid, stopLoss: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Target</Label><Input type="number" value={pyramid.target} onChange={e => setPyramid({ ...pyramid, target: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Quantity (50%)</Label><Input type="number" value={pyramid.qty} onChange={e => setPyramid({ ...pyramid, qty: e.target.value })} /></div>
        </div>

        <div style={{ background: C.amber + "10", border: `1px solid ${C.amber}30`, borderRadius: 5, padding: 10, marginBottom: 16, fontSize: 11, color: C.textM, lineHeight: 1.6 }}>
          Don't forget — also move the original trade's stop to breakeven now.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setPyramidTrade(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} size="lg" style={{ flex: 2 }}>Add Pyramid</Btn>
        </div>
      </div>
    </div>
  );
}

// ════════════════ JOURNAL ════════════════
function Journal({ trades, saveTrades, hideCapital, isMobile }) {
  const [expanded, setExpanded] = useState(null);
  const list = trades.filter(t => t.status !== "Pending").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const update = (id, patch) => saveTrades(trades.map(t => t.id === id ? { ...t, ...patch } : t));

  const JOURNAL_QUESTIONS = [
    { key: "whyEntered", label: "Why did you enter this trade?", placeholder: "What was the setup? What did the chart show?" },
    { key: "learning", label: "One learning from this trade", placeholder: "Win or loss — what does it teach you?" },
    { key: "freeNotes", label: "Any other notes", placeholder: "Anything else worth capturing" },
  ];

  return (
    <div>
      {list.length === 0 ? <Card><div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No trades to journal yet</div></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(t => {
            const m = calcMetrics(t); const cur = t.platform === "AB" ? "₹" : "$";
            const isOpen = expanded === t.id;
            const isClosed = t.status === "Closed";
            const isLoss = isClosed && (m.pnl || 0) < 0;
            const checklistDone = Object.values(t.checklist || {}).filter(Boolean).length;
            const isLongTrade = t.direction === "Long";
            const achievedR = isClosed && t.exitPrice && t.entry && t.stopLoss
              ? (() => {
                  const diff = isLongTrade ? +t.exitPrice - +t.entry : +t.entry - +t.exitPrice;
                  const stopDist = Math.abs(+t.entry - +t.stopLoss);
                  return stopDist > 0 ? +(diff / stopDist).toFixed(2) : 0;
                })() : null;
            return (
              <Card key={t.id} padding={0}>
                <div onClick={() => setExpanded(isOpen ? null : t.id)} style={{ padding: "14px 18px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: C.text }}>{t.market}{t.parentId && <span style={{ color: C.amber, fontSize: 9, marginLeft: 6 }}>↗</span>}</div>
                      <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO, marginTop: 2 }}>{t.date} · {t.setupTag}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {t.conviction && <span style={{ fontSize: 10, color: +t.conviction >= 8 ? C.green : +t.conviction >= 6 ? C.amber : C.red, fontFamily: F_MONO }}>C:{t.conviction}</span>}
                      <span style={{ fontSize: 11, color: checklistDone === RULES_CHECKLIST.length ? C.green : checklistDone >= 5 ? C.amber : C.textD, fontFamily: F_MONO }}>{checklistDone}/{RULES_CHECKLIST.length}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: m.pnl > 0 ? C.green : m.pnl < 0 ? C.red : C.textD, fontFamily: F_MONO, fontWeight: 600 }}>{m.pnl !== null && m.pnl !== undefined && isClosed ? dAmt(m.pnl, cur, hideCapital) : "Open"}</span>
                    <span style={{ fontSize: 11, color: C.textM, fontFamily: F_MONO }}>Plan 1:{m.rr || "—"}</span>
                    {achievedR !== null && <span style={{ fontSize: 11, color: achievedR >= m.rr ? C.green : achievedR > 0 ? C.amber : C.red, fontFamily: F_MONO }}>Got {achievedR > 0 ? "+" : ""}{achievedR.toFixed(2)}R</span>}
                    {t.mistakeTag && <span style={{ fontSize: 10, padding: "2px 6px", background: C.red + "20", color: C.red, borderRadius: 3 }}>{t.mistakeTag}</span>}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ marginTop: 16 }}>
                      <Label>Rules Checklist</Label>
                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                        {RULES_CHECKLIST.map(c => (
                          <div key={c.key} onClick={() => update(t.id, { checklist: { ...t.checklist, [c.key]: !t.checklist?.[c.key] } })} style={{ display: "flex", alignItems: "center", padding: "6px 0", cursor: "pointer" }}>
                            <div style={{ width: 16, height: 16, border: `1.5px solid ${t.checklist?.[c.key] ? C.green : C.borderH}`, background: t.checklist?.[c.key] ? C.green : "transparent", borderRadius: 3, marginRight: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.checklist?.[c.key] && <span style={{ color: C.bg, fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
                            <span style={{ fontSize: 12, color: t.checklist?.[c.key] ? C.text : C.textM }}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {isClosed && (
                      <div style={{ marginTop: 16 }}>
                        <Label style={{ marginBottom: 8 }}>Outcome vs Plan</Label>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8 }}>
                          <div style={{ background: C.surface2, padding: "8px 10px", borderRadius: 4 }}><div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>PLANNED R:R</div><div style={{ fontSize: 13, color: C.text, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>1:{m.rr || "—"}</div></div>
                          <div style={{ background: C.surface2, padding: "8px 10px", borderRadius: 4 }}><div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>ACHIEVED</div><div style={{ fontSize: 13, color: achievedR >= m.rr ? C.green : achievedR > 0 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{achievedR !== null ? `${achievedR > 0 ? "+" : ""}${achievedR.toFixed(2)}R` : "—"}</div></div>
                          <div style={{ background: C.surface2, padding: "8px 10px", borderRadius: 4 }}><div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>EXIT REASON</div><select value={t.exitReason || ""} onChange={e => update(t.id, { exitReason: e.target.value })} style={{ background: "transparent", border: "none", color: C.text, fontSize: 12, fontFamily: F_UI, outline: "none", padding: 0, marginTop: 2, width: "100%", cursor: "pointer" }}><option value="">Select...</option>{["Hit target", "Hit stop", "Discretionary exit", "Trail stopped", "Time-based exit"].map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                        </div>
                      </div>
                    )}
                    {t.conviction && (
                      <div style={{ marginTop: 16 }}>
                        <Label style={{ marginBottom: 8 }}>Conviction at Entry</Label>
                        <div style={{ display: "flex", gap: 3 }}>{[1,2,3,4,5,6,7,8,9,10].map(n => <div key={n} style={{ flex: 1, height: 6, borderRadius: 2, background: n <= +t.conviction ? (+t.conviction >= 8 ? C.green : +t.conviction >= 6 ? C.amber : C.red) : C.dim }} />)}</div>
                        <div style={{ fontSize: 10, color: C.textD, marginTop: 4, fontFamily: F_MONO }}>{t.conviction}/10</div>
                      </div>
                    )}
                    {isLoss && (
                      <div style={{ marginTop: 16 }}>
                        <Label style={{ marginBottom: 8 }}>Why did this lose?</Label>
                        <select value={t.mistakeTag || ""} onChange={e => update(t.id, { mistakeTag: e.target.value })} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "10px 12px", fontSize: 13, fontFamily: F_UI, outline: "none", width: "100%", cursor: "pointer" }}><option value="">Select cause...</option>{MISTAKE_TAGS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                      </div>
                    )}
                    {JOURNAL_QUESTIONS.map(q => (
                      <div key={q.key} style={{ marginTop: 16 }}>
                        <Label style={{ marginBottom: 8 }}>{q.label}</Label>
                        <textarea value={t[q.key] || ""} onChange={e => update(t.id, { [q.key]: e.target.value })} placeholder={q.placeholder} style={{ width: "100%", minHeight: 72, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: 12, fontSize: 13, fontFamily: F_UI, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Returns({ trades, settings, hideCapital, isMobile }) {
  const [view, setView] = useState("market");
  const closed = trades.filter(t => t.status === "Closed");
  const data = useMemo(() => {
    const groups = {};
    closed.forEach(t => {
      const m = calcMetrics(t);
      const pnlInr = t.platform === "AB" ? (m.pnl || 0) : (m.pnl || 0) * settings.fxRate;
      const k = view === "market" ? t.market : view === "platform" ? (t.platform === "AB" ? "Aditya Birla" : "Exness") : (t.exitDate || t.date).slice(0, 7);
      if (!groups[k]) groups[k] = { name: k, pnl: 0, trades: 0, wins: 0 };
      groups[k].pnl += pnlInr; groups[k].trades += 1;
      if ((m.pnl || 0) > 0) groups[k].wins += 1;
    });
    return Object.values(groups).sort((a, b) => view === "month" ? a.name.localeCompare(b.name) : b.pnl - a.pnl);
  }, [view, closed, settings]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["market", "By Market"], ["platform", "By Platform"], ["month", "By Month"]].map(([v, l]) => <Btn key={v} variant={view === v ? "primary" : "ghost"} onClick={() => setView(v)} size="md">{l}</Btn>)}
      </div>
      <Card><Label>P&L · Normalized to ₹</Label>
        {data.length > 0 ? (
          <div style={{ marginTop: 16, height: 220 }}>
            <ResponsiveContainer><BarChart data={data} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke={C.border} strokeDasharray="2 2" vertical={false} /><XAxis dataKey="name" tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} /><YAxis tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} tickFormatter={v => hideCapital ? "•" : fmt(v)} /><Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: F_MONO }} formatter={v => dAmt(v, "₹", hideCapital)} cursor={{ fill: C.surface3 }} /><Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? C.green : C.red} />)}</Bar></BarChart></ResponsiveContainer>
          </div>
        ) : <div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No closed trades yet</div>}
      </Card>
      <div style={{ marginTop: 16 }}>
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.map(d => (
              <Card key={d.name} padding={12}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: 13, color: C.text }}>{d.name}</div><div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginTop: 2 }}>{d.trades} trades · {((d.wins / d.trades) * 100).toFixed(0)}% win rate</div></div>
                  <div style={{ fontSize: 16, color: d.pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(d.pnl, "₹", hideCapital)}</div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card padding={0}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>{["Category", "Trades", "Wins", "Win Rate", "P&L (₹)"].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: C.textM, fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{data.map(d => <tr key={d.name} style={{ borderBottom: `1px solid ${C.border}` }}><td style={{ padding: "11px 14px", color: C.text }}>{d.name}</td><td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>{d.trades}</td><td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>{d.wins}</td><td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>{((d.wins / d.trades) * 100).toFixed(0)}%</td><td style={{ padding: "11px 14px", color: d.pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(d.pnl, "₹", hideCapital)}</td></tr>)}</tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function Rules({ metrics }) {
  const checks = [
    { label: "All trades within 2.5% risk (total capital)", ok: !metrics.breaches.find(b => b.msg.includes("2.5%")) },
    { label: "Less than 3 losses today", ok: metrics.todayLosses < 3 },
    { label: "Daily drawdown above -3%", ok: metrics.dayDD > -3 },
    { label: "Weekly drawdown above -5%", ok: metrics.weekDD > -5 },
    { label: "Monthly drawdown above -10%", ok: metrics.monthDD > -10 },
    { label: "Trades with active risk: under 5", ok: metrics.openWithRiskCount < 5 },
    { label: "Weekly HWM not locked", ok: !metrics.weekLockdownActive },
    { label: "Monthly HWM not locked", ok: !metrics.monthLockdownActive },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <Label>Live Rule Status</Label>
        <div style={{ marginTop: 14 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: i < checks.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <Dot ok={c.ok} /><span style={{ fontSize: 12, color: c.ok ? C.text : C.red, flex: 1 }}>{c.label}</span>
              <span style={{ fontSize: 10, color: c.ok ? C.green : C.red, fontFamily: F_MONO, letterSpacing: 1 }}>{c.ok ? "OK" : "BREACH"}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>The Laws</Label>
        <div style={{ marginTop: 14 }}>
          {LAWS.map((l, i) => (
            <div key={i} style={{ display: "flex", padding: "9px 0", borderBottom: i < LAWS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.accent, fontFamily: F_MONO, fontSize: 11, minWidth: 28, fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{l}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>Optional Tactics</Label>
        <div style={{ marginTop: 14 }}>
          {OPTIONAL_TACTICS.map((t, i) => (
            <div key={i} style={{ display: "flex", padding: "9px 0", borderBottom: i < OPTIONAL_TACTICS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.textD, fontFamily: F_MONO, fontSize: 11, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 12, color: C.textM, lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>Trader's Mantras</Label>
        <div style={{ marginTop: 14 }}>
          {TRADER_MANTRAS.map((m, i) => (
            <div key={i} style={{ display: "flex", padding: "9px 0", borderBottom: i < TRADER_MANTRAS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.textD, fontFamily: F_MONO, fontSize: 11, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 12, color: C.textM, lineHeight: 1.5, fontStyle: "italic" }}>{m}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Calculator({ settings, trades, saveTrades, setPage, hideCapital, isMobile, recommendedRisk }) {
  const [c, setC] = useState({
    platform: "AB", entry: "", sl: "", riskPct: recommendedRisk, rr: 3,
    market: "MCX Gold Mini", direction: "Long",
    multiplier: CONTRACT_MULTIPLIERS["MCX Gold Mini"], marginPerLot: "",
    manualLots: "", // for reverse mode
  });
  const [mode, setMode] = useState("auto"); // "auto" = risk%→lots | "manual" = lots→risk%

  const onMarketChange = (m) => setC({ ...c, market: m, multiplier: CONTRACT_MULTIPLIERS[m] !== undefined ? CONTRACT_MULTIPLIERS[m] : 1 });
  const onPlatformChange = (p) => { const m = p === "AB" ? MARKETS_INR[0] : MARKETS_USD[0]; setC({ ...c, platform: p, market: m, multiplier: CONTRACT_MULTIPLIERS[m] !== undefined ? CONTRACT_MULTIPLIERS[m] : 1 }); };

  const totalCapInr = settings.inrCapital + settings.usdCapital * settings.fxRate;
  const cur = c.platform === "AB" ? "₹" : "$";
  const riskAmtInr = (totalCapInr * c.riskPct) / 100;
  const riskAmt = c.platform === "AB" ? riskAmtInr : riskAmtInr / settings.fxRate;
  const mult = +c.multiplier || 1;
  const diff = c.entry && c.sl ? Math.abs(+c.entry - +c.sl) : 0;

  const wholeLotMarkets = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "Nifty 50", "BankNifty", "Stock Futures"];
  const needsWholeLot = wholeLotMarkets.includes(c.market);
  const roundLot = (n) => (n - Math.floor(n)) >= 0.75 ? Math.ceil(n) : Math.floor(n);

  // AUTO mode: risk% → calculate lots
  const rawQtyAuto = diff > 0 && mult > 0 ? (riskAmt / (diff * mult)) : 0;
  const qtyAuto = needsWholeLot ? roundLot(rawQtyAuto) : rawQtyAuto;

  // MANUAL mode: lots entered → calculate risk
  const qtyManual = +c.manualLots || 0;

  const qty = mode === "auto" ? qtyAuto : qtyManual;
  const actualRisk = qty * mult * diff;
  const actualRiskPct = totalCapInr > 0 ? (actualRisk * (c.platform === "AB" ? 1 : settings.fxRate)) / totalCapInr * 100 : 0;

  const marginPerLot = +c.marginPerLot || 0;
  const posVal = marginPerLot > 0 ? qty * marginPerLot : qty * mult * (+c.entry || 0);
  const notionalVal = qty * mult * (+c.entry || 0);
  const effectiveLeverage = marginPerLot > 0 && qty > 0 ? (notionalVal / (qty * marginPerLot)).toFixed(1) : "—";
  const target = diff > 0 && c.entry ? (c.direction === "Long" ? +c.entry + diff * c.rr : +c.entry - diff * c.rr) : 0;
  const oneRLevel = diff > 0 && c.entry ? (c.direction === "Long" ? +c.entry + diff : +c.entry - diff) : 0;
  const partialTarget = diff > 0 && c.entry ? (c.direction === "Long" ? +c.entry + diff * c.rr * 0.6 : +c.entry - diff * c.rr * 0.6) : 0;

  const showMultiplier = c.platform === "AB";
  const multLocked = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "Nifty 50", "BankNifty"].includes(c.market);
  const grid2 = isMobile ? "1fr" : "1fr 1fr";

  const saveAsPending = () => {
    if (!c.entry || !c.sl) { alert("Need entry and stop loss"); return; }
    if (qty <= 0) { alert("Quantity is 0 — check entry, SL, and risk settings"); return; }
    const newTrade = {
      id: "trade_" + Date.now(), date: today(), market: c.market, platform: c.platform,
      direction: c.direction, entry: c.entry, stopLoss: c.sl,
      target: target > 0 ? target.toFixed(2) : "",
      qty: needsWholeLot ? qty.toString() : qty.toFixed(2),
      marginPerLot: c.marginPerLot || "",
      riskPct: c.riskPct, status: "Pending", setupTag: SETUP_TAGS[0],
      multiplier: mult,
      checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}),
      pnl: null, exitPrice: null, exitDate: null, mistakeTag: null, exitReason: null,
    };
    saveTrades([newTrade, ...trades]);
    setPage("positions");
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {recommendedRisk < 1 && (
        <div style={{ background: C.amber + "15", border: `1px solid ${C.amber}40`, borderRadius: 6, padding: 12, marginBottom: 14, fontSize: 12, color: C.amber }}>
          ⚠ Drawdown active — recommended risk {recommendedRisk}%
        </div>
      )}

      {/* ── PRIMARY RESULT — lots shown BIG ── */}
      {qty > 0 && diff > 0 && (
        <div style={{ background: C.surface, border: `2px solid ${C.accent}40`, borderRadius: 10, padding: "20px 24px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textD, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{mode === "auto" ? "Calculated Lots" : "Manual Lots"}</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: C.accent, fontFamily: F_MONO, lineHeight: 1 }}>{needsWholeLot ? qty : qty.toFixed(2)}</div>
            {mode === "auto" && needsWholeLot && rawQtyAuto > 0 && rawQtyAuto !== qty && (
              <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginTop: 4 }}>Exact: {rawQtyAuto.toFixed(3)} → rounded</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textD, letterSpacing: 1 }}>ACTUAL RISK</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: actualRiskPct > 2 ? C.red : actualRiskPct > 1 ? C.amber : C.green, fontFamily: F_MONO }}>{dAmt(actualRisk, cur, hideCapital)}</div>
              <div style={{ fontSize: 11, color: C.textM, fontFamily: F_MONO }}>{actualRiskPct.toFixed(3)}% of total</div>
            </div>
          </div>
        </div>
      )}

      {/* ── INPUTS ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Label>Position Size Calculator</Label>
          <div style={{ fontSize: 10, color: C.textD }}>Risk on {dAmt(totalCapInr, "₹", hideCapital)} total</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 12 }}>
          <div><Label style={{ marginBottom: 6 }}>Platform</Label><Select value={c.platform} onChange={e => onPlatformChange(e.target.value)} options={[{ value: "AB", label: "Aditya Birla (₹)" }, { value: "Exness", label: "Exness ($)" }]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Market</Label><Select value={c.market} onChange={e => onMarketChange(e.target.value)} options={c.platform === "AB" ? MARKETS_INR : MARKETS_USD} /></div>
          <div><Label style={{ marginBottom: 6 }}>Direction</Label><Select value={c.direction} onChange={e => setC({ ...c, direction: e.target.value })} options={["Long", "Short"]} /></div>
          <div>
            <Label style={{ marginBottom: 6 }}>Risk %</Label>
            <div style={{ display: "flex", gap: 3 }}>
              {[0.25, 0.5, 1, 1.5, 2, 2.5].map(r => (
                <button key={r} onClick={() => setC({ ...c, riskPct: r })} style={{ flex: 1, padding: "9px 0", background: c.riskPct === r ? C.accent : C.surface2, color: c.riskPct === r ? C.bg : C.textM, border: `1px solid ${c.riskPct === r ? C.accent : C.border}`, borderRadius: 4, fontSize: 10, fontFamily: F_MONO, cursor: "pointer", fontWeight: 600 }}>{r}%</button>
              ))}
            </div>
          </div>
          <div><Label style={{ marginBottom: 6 }}>Entry Price</Label><Input type="number" value={c.entry} onChange={e => setC({ ...c, entry: e.target.value })} placeholder="0.00" /></div>
          <div><Label style={{ marginBottom: 6 }}>Stop Loss</Label><Input type="number" value={c.sl} onChange={e => setC({ ...c, sl: e.target.value })} placeholder="0.00" /></div>

          {/* MODE TOGGLE + MANUAL LOTS */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Label>Lots</Label>
              <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 5, overflow: "hidden" }}>
                <button onClick={() => setMode("auto")} style={{ padding: "5px 14px", background: mode === "auto" ? C.accent : C.surface2, color: mode === "auto" ? C.bg : C.textM, border: "none", fontSize: 11, fontFamily: F_UI, cursor: "pointer", fontWeight: mode === "auto" ? 600 : 400 }}>Auto calculate</button>
                <button onClick={() => setMode("manual")} style={{ padding: "5px 14px", background: mode === "manual" ? C.accent : C.surface2, color: mode === "manual" ? C.bg : C.textM, border: "none", fontSize: 11, fontFamily: F_UI, cursor: "pointer", fontWeight: mode === "manual" ? 600 : 400 }}>Enter manually</button>
              </div>
            </div>
            {mode === "manual" ? (
              <div>
                <Input type="number" value={c.manualLots} onChange={e => setC({ ...c, manualLots: e.target.value })} placeholder={`e.g. 4 lots`} />
                <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Enter your lot count — see the resulting risk below</div>
              </div>
            ) : (
              <div style={{ background: C.surface2, borderRadius: 5, padding: "10px 12px", fontSize: 12, color: C.textM }}>
                Auto-calculated from your risk% and stop distance.
                {qty > 0 ? <span style={{ color: C.accent, fontWeight: 600, marginLeft: 6 }}>{needsWholeLot ? qty : qty.toFixed(2)} lots</span> : <span style={{ color: C.textD, marginLeft: 6 }}>Fill entry + SL to calculate</span>}
              </div>
            )}
          </div>

          {/* MARGIN PER LOT */}
          {c.platform === "AB" && needsWholeLot && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Margin per Lot (₹) <span style={{ color: C.textD, fontSize: 9 }}>optional</span></Label>
              <Input type="number" value={c.marginPerLot || ""} onChange={e => setC({ ...c, marginPerLot: e.target.value })} placeholder="e.g. 55000 — ask your broker" />
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Real capital blocked per lot. Without this, position value shows notional (misleading for futures).</div>
            </div>
          )}

          {/* CONTRACT MULTIPLIER */}
          {showMultiplier && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Contract Multiplier {multLocked && <span style={{ color: C.textD, fontSize: 9, marginLeft: 6 }}>auto-set</span>}</Label>
              <Input type="number" value={c.multiplier} onChange={e => setC({ ...c, multiplier: +e.target.value || 1 })} style={{ opacity: multLocked ? 0.7 : 1 }} />
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>
                {c.market === "MCX Gold Mini" && "100g lot · price per 10g"}
                {c.market === "MCX Silver Mini" && "5kg lot · price per 1kg"}
                {c.market === "MCX Crude Oil" && "100 barrels · price per barrel"}
                {c.market === "MCX Natural Gas" && "1250 mmBtu · price per mmBtu"}
                {c.market === "MCX Copper" && "2500kg · price per kg"}
                {c.market === "MCX Aluminium" && "5000kg · price per kg"}
                {c.market === "Nifty 50" && "Lot size 65 (SEBI Jan 2026)"}
                {c.market === "BankNifty" && "Lot size 30 (SEBI Jan 2026)"}
                {c.market === "Stock Futures" && "Enter stock lot size manually"}
                {c.market === "Indian Equity" && "Shares — no multiplier needed"}
              </div>
            </div>
          )}

          {/* TARGET R:R */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Target R:R</Label>
            <div style={{ display: "flex", gap: 3 }}>
              {[3, 4, 5, 7, 10, 15].map(r => (
                <button key={r} onClick={() => setC({ ...c, rr: r })} style={{ flex: 1, padding: "9px 0", background: c.rr === r ? C.accent : C.surface2, color: c.rr === r ? C.bg : C.textM, border: `1px solid ${c.rr === r ? C.accent : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: "pointer", fontWeight: 600 }}>1:{r}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RESULT CARDS ── */}
      {qty > 0 && diff > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
          {/* Risk row */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Risk Budget</div>
              <div style={{ fontSize: 18, fontFamily: F_MONO, fontWeight: 600, color: C.textM }}>{dAmt(riskAmt, cur, hideCapital)}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{c.riskPct}% of total cap</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${actualRiskPct > 2 ? C.red : C.border}`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Actual Risk</div>
              <div style={{ fontSize: 18, fontFamily: F_MONO, fontWeight: 600, color: actualRiskPct > 2 ? C.red : actualRiskPct > 1 ? C.amber : C.green }}>{dAmt(actualRisk, cur, hideCapital)}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{actualRiskPct.toFixed(3)}%</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{marginPerLot > 0 ? "Capital Required" : "Notional Value"}</div>
              <div style={{ fontSize: 18, fontFamily: F_MONO, fontWeight: 600, color: marginPerLot > 0 ? C.amber : C.textM }}>{dAmt(posVal, cur, hideCapital)}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{marginPerLot > 0 ? `${effectiveLeverage}× leverage` : "enter margin/lot for real"}</div>
            </div>
          </div>

          {/* Price levels row */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Entry</div>
              <div style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 600, color: C.text }}>{c.entry || "—"}</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.green}30`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>1R Level</div>
              <div style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 600, color: C.green }}>{oneRLevel > 0 ? oneRLevel.toFixed(2) : "—"}</div>
              <div style={{ fontSize: 9, color: C.textD, marginTop: 3 }}>Move SL to entry here</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.amber}30`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Partial Exit (60%)</div>
              <div style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 600, color: C.amber }}>{partialTarget > 0 ? partialTarget.toFixed(2) : "—"}</div>
              <div style={{ fontSize: 9, color: C.textD, marginTop: 3 }}>Profit: {dAmt(actualRisk * c.rr * 0.6, cur, hideCapital)}</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.accent}30`, borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Final Target</div>
              <div style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 600, color: C.accent }}>{target > 0 ? target.toFixed(2) : "—"}</div>
              <div style={{ fontSize: 9, color: C.textD, marginTop: 3 }}>Profit: {dAmt(actualRisk * c.rr, cur, hideCapital)}</div>
            </div>
          </div>
        </div>
      )}

      <Btn variant="primary" onClick={saveAsPending} size="lg" style={{ marginTop: 16, width: "100%" }} disabled={qty <= 0}>
        {qty <= 0 && diff > 0 ? "Stop too small for 1 lot" : qty <= 0 ? "Fill entry + SL first" : `Save ${needsWholeLot ? qty : qty.toFixed(2)} lots as Pending Trade`}
      </Btn>
    </div>
  );
}
