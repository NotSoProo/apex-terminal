import { useState, useEffect, useMemo, useRef, memo } from "react";
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
const MARKETS_INR = ["Stocks", "Stock Futures", "Nifty 50", "BankNifty", "MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium"];
const OPTIONS_NSE = ["Nifty Options", "BankNifty Options", "Stock Options"];
const OPTIONS_MCX = ["MCX Gold Options", "MCX Silver Options", "MCX Crude Options"];
const ALL_OPTIONS = [...OPTIONS_NSE, ...OPTIONS_MCX];

const OPTIONS_MULTIPLIERS = {
  "Nifty Options": 65,
  "BankNifty Options": 30,
  "Stock Options": 0,       // user enters
  "MCX Gold Options": 10,   // 100g lot, price per 10g — same as Gold Mini
  "MCX Silver Options": 5,  // 5kg lot, price per kg — same as Silver Mini
  "MCX Crude Options": 100, // 100 barrels — same as Crude
};

const MARKETS_USD = [
  "XAU/USD (Gold)", "XAG/USD (Silver)",
  "Oil (WTI/USOIL)", "Natural Gas",
  "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "NZD/USD",
  "USD/CHF", "USD/CAD", "GBP/JPY", "EUR/JPY", "EUR/GBP",
  "BTC/USD", "ETH/USD",
  "Custom",
];

// Contract multipliers — how many price units per 1 lot
// e.g. GoldM price quote is per 10g but 1 lot = 100g, so multiplier = 10
// Exness: risk = |entry-sl| × contract_size × lots (in USD)
// For forex pairs: 1 pip = 0.0001, contract = 100000, so $10/pip/lot
const EXNESS_MULTIPLIERS = {
  "XAU/USD (Gold)": 100,           // 100 oz/lot, $1 move = $100
  "XAG/USD (Silver)": 5000,        // 5000 oz/lot — but price in oz, $0.01 = $50
  "Oil (WTI/USOIL)": 1000,         // 1000 barrels/lot, $1 move = $1000
  "Natural Gas": 10000,             // 10,000 mmBtu/lot
  "EUR/USD": 100000,                // forex standard: 100,000 units, $10/pip/lot
  "GBP/USD": 100000,
  "AUD/USD": 100000,
  "NZD/USD": 100000,
  "USD/CHF": 100000,
  "USD/CAD": 100000,
  "USD/JPY": 100000,
  "GBP/JPY": 100000,
  "EUR/JPY": 100000,
  "EUR/GBP": 100000,
  "BTC/USD": 1,                     // 1 BTC/lot, $1 move = $1
  "ETH/USD": 1,
  "Custom": 1,                      // user enters manually
};
// For forex, price difference is in pips (0.0001) not dollars
// Risk = |entry-sl| × 100000 × lots — this works directly since entry/sl entered in price
const FOREX_PAIRS = ["EUR/USD","GBP/USD","AUD/USD","NZD/USD","USD/CHF","USD/CAD","USD/JPY","GBP/JPY","EUR/JPY","EUR/GBP"];

const CONTRACT_MULTIPLIERS = {
  "MCX Gold Mini": 10,        // 100g lot, quote per 10g
  "MCX Silver Mini": 5,       // 5kg lot, quote per 1kg
  "MCX Crude Oil": 100,       // 100 barrels lot, quote per 1 barrel
  "MCX Natural Gas": 1250,    // 1250 mmBtu lot, quote per 1 mmBtu
  "MCX Copper": 2500,         // 2500 kg lot, quote per 1kg
  "MCX Aluminium": 5000,      // 5000 kg lot, quote per 1kg
  "Nifty 50": 65,             // SEBI revised Jan 2026
  "BankNifty": 30,            // SEBI revised Jan 2026
  "Stocks": 1,
  "Stock Futures": 0,         // manual override per stock
};
const SETUP_TAGS = ["Mentor G", "Mentor Y", "Mentor J", "Liquidity Sweep", "Other"];
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
let _cap = 12000000; // updated by App on each render
let _mtfRate = 8.5; // MTF annual interest rate %, updated by App
let _exnessComm = 7; // Exness commission $ per lot round trip
const dAmt = (n, cur, hideMode, totalCapForPct) => {
  if (hideMode === "hidden" || hideMode === true) return "•••";
  if (n === null || n === undefined) return "—";
  if (hideMode === "pct") {
    const cap = totalCapForPct || _cap;
    if (cap > 0) { const pct = (n / cap) * 100; return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`; }
  }
  return fmt(n, cur);
};
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
  const rr = stopDist > 0 ? Math.floor(targetDist / stopDist) : 0;
  const bePrice = entry; // true breakeven = entry price (moving SL here = no loss)
  const oneRLevel = isLong ? entry + stopDist : entry - stopDist; // price where you SHOULD move SL to BE
  const slAtBE = t.currentSL ? (isLong ? +t.currentSL >= entry - 0.01 : +t.currentSL <= entry + 0.01) : false;
  // Options buyer: max loss = premium paid (entry × lots × mult). Writer: margin-based.
  const isOptionBuyer = (t.isOption || false) && !t.isWriter;
  const riskAmt = slAtBE ? 0 : isOptionBuyer ? (entry * qty * mult) : (stopDist * qty * mult);
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

const INPUT_BASE = { background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "11px 14px", fontSize: 16, fontFamily: F_MONO, outline: "none", width: "100%", boxSizing: "border-box", display: "block", WebkitAppearance: "none", appearance: "none" };
const Input = ({ value, onChange, placeholder, type = "text", style = {} }) => <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} style={{ ...INPUT_BASE, ...style }} />;
const Select = ({ value, onChange, options, style = {} }) => <select value={value} onChange={onChange} style={{ ...INPUT_BASE, fontFamily: F_UI, cursor: "pointer", ...style }}>
  {(Array.isArray(options) ? options : []).map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
</select>;
const Dot = ({ ok }) => <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: ok ? C.green : C.red, marginRight: 8, boxShadow: `0 0 6px ${ok ? C.green : C.red}80` }} />;
const timeSince = (dateStr) => {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr + "T00:00:00")) / 1000 / 60);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins/60)}h`;
  return `${Math.floor(mins/1440)}d`;
};
const calcMTFInterest = (t) => {
  if (t.market !== "Stocks" || !t.capitalUsed || !t.entry || !t.qty) return null;
  const fullValue = +t.qty * +t.entry;
  const borrowed = fullValue - +t.capitalUsed;
  if (borrowed <= 0) return null;
  const entryDate = new Date(t.date + "T00:00:00");
  const exitDate = t.exitDate ? new Date(t.exitDate + "T00:00:00") : new Date();
  const days = Math.max(0, Math.floor((exitDate - entryDate) / (1000 * 60 * 60 * 24)));
  const dailyRate = _mtfRate / 100 / 365;
  const interest = borrowed * dailyRate * days;
  return { borrowed, days, dailyRate, interest, daily: borrowed * dailyRate };
};
const calcCharges = (t) => {
  if (!t.entry || !t.qty) return null;
  const mult = +t.multiplier || 1;
  const qty = +t.qty;
  const entry = +t.entry;
  const exit = +(t.exitPrice || t.cmp || 0);
  const mkt = t.market;
  const isExness = t.platform === "Exness";

  // ── Exness: commission only (Pro account, swap-free) ──
  if (isExness) {
    const commUsd = _exnessComm * qty; // $7/lot round trip × lots
    const commInr = commUsd * (_cap > 0 ? 100 : 100); // use fxRate approx
    return {
      platform: "Exness",
      commission: +commUsd.toFixed(2),
      commissionInr: +commInr.toFixed(2),
      swap: 0,
      total: +commUsd.toFixed(2), // in USD
      totalInr: +commInr.toFixed(2),
      currency: "$",
      note: `$${_exnessComm}/lot round trip · ${qty} lots · swap-free`,
    };
  }

  // ── AB charges ──
  const buyTurnover = entry * qty * mult;
  const sellTurnover = exit > 0 ? exit * qty * mult : buyTurnover;
  const totalTurnover = buyTurnover + sellTurnover;

  const isStocks = mkt === "Stocks";
  const isStockFut = mkt === "Stock Futures";
  const isMCX = ["MCX Gold Mini","MCX Silver Mini","MCX Crude Oil","MCX Natural Gas","MCX Copper","MCX Aluminium"].includes(mkt);
  const isNifty = ["Nifty 50","BankNifty"].includes(mkt);
  const isFO = isStockFut || isNifty;

  let brokerage = 0, stt = 0, ctt = 0, exchange = 0, sebi = 0, stamp = 0;

  if (isStocks) {
    brokerage = 0;
    stt = totalTurnover * 0.001;
    exchange = totalTurnover * 0.0000322;
    sebi = totalTurnover * 0.0000001;
    stamp = buyTurnover * 0.00015;
  } else if (isFO) {
    brokerage = 40;
    stt = sellTurnover * 0.000125;
    exchange = totalTurnover * 0.000019;
    sebi = totalTurnover * 0.0000001;
    stamp = buyTurnover * 0.00002;
  } else if (isMCX) {
    brokerage = 40;
    ctt = sellTurnover * 0.0001;
    exchange = totalTurnover * 0.000026;
    sebi = totalTurnover * 0.00000001;
    stamp = buyTurnover * 0.00002;
  } else if (ALL_OPTIONS.includes(mkt) || t.isOption) {
    // Options charges — based on PREMIUM turnover (not notional)
    const isMCXOpt = mkt.includes("MCX") || (t.optionSubmarket || "").includes("MCX");
    brokerage = 40; // ₹20/order × 2
    if (isMCXOpt) {
      ctt = sellTurnover * 0.0005; // 0.05% CTT on sell premium (MCX options)
      exchange = totalTurnover * 0.0005; // 0.05% (MCX options)
      sebi = totalTurnover * 0.00000001; // ₹1/cr
    } else {
      stt = sellTurnover * 0.000625; // 0.0625% on sell premium (NSE options)
      exchange = totalTurnover * 0.0005; // 0.05% (NSE options — 26x higher than futures!)
      sebi = totalTurnover * 0.0000001;
    }
    stamp = buyTurnover * 0.00003; // 0.003% on buy
  } else {
    brokerage = 40;
    exchange = totalTurnover * 0.000019;
    sebi = totalTurnover * 0.0000001;
    stamp = buyTurnover * 0.00002;
  }

  const gst = (brokerage + exchange + sebi) * 0.18;
  const mtf = isStocks ? calcMTFInterest(t) : null;
  const mtfInterest = mtf ? mtf.interest : 0;
  const total = brokerage + stt + ctt + exchange + sebi + gst + stamp + mtfInterest;

  return {
    platform: "AB",
    brokerage: +brokerage.toFixed(2),
    stt: +stt.toFixed(2),
    ctt: +ctt.toFixed(2),
    exchange: +exchange.toFixed(2),
    sebi: +sebi.toFixed(2),
    gst: +gst.toFixed(2),
    stamp: +stamp.toFixed(2),
    mtfInterest: +mtfInterest.toFixed(2),
    total: +total.toFixed(2),
    totalInr: +total.toFixed(2),
    currency: "₹",
    buyTurnover: +buyTurnover.toFixed(2),
    sellTurnover: +sellTurnover.toFixed(2),
  };
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
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [preMarket, setPreMarket] = useState({});
  const [reviews, setReviews] = useState({});
  const [showPreMarket, setShowPreMarket] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  
  const [closeTrade, setCloseTrade] = useState(null);
  const [hideMode, setHideMode] = useState("numbers"); // "numbers" | "pct" | "hidden"
  const hideCapital = hideMode; // pass string so dAmt pct mode works
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (document.querySelector("#apex-fonts")) return;
    // Preconnect first for faster font load
    const pc = document.createElement("link"); pc.rel = "preconnect"; pc.href = "https://fonts.googleapis.com"; document.head.appendChild(pc);
    const pc2 = document.createElement("link"); pc2.rel = "preconnect"; pc2.href = "https://fonts.gstatic.com"; pc2.crossOrigin = "anonymous"; document.head.appendChild(pc2);
    const l = document.createElement("link"); l.id = "apex-fonts";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
    // Prevent iOS auto-zoom on input focus
    const s = document.createElement("style"); s.id = "apex-nozoom";
    s.textContent = "input,select,textarea{font-size:16px!important;} @media(min-width:768px){input,select,textarea{font-size:13px!important;}} *{-webkit-tap-highlight-color:transparent;}";
    document.head.appendChild(s);
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
  const saveTemplates = (next) => { setTemplates(next); try { localStorage.setItem("nsf_templates", JSON.stringify(next)); } catch (e) {} };
  const saveSettings = (next) => { setSettings(next); try { localStorage.setItem("nsf_settings", JSON.stringify(next)); } catch (e) {} };
  const savePreMarket = (next) => { setPreMarket(next); try { localStorage.setItem("nsf_premarket", JSON.stringify(next)); } catch (e) {} };
  const saveReviews = (next) => { setReviews(next); try { localStorage.setItem("nsf_reviews", JSON.stringify(next)); } catch (e) {} };
  const toggleHide = () => { const order = ["numbers", "pct", "hidden"]; const next = order[(order.indexOf(hideMode) + 1) % 3]; setHideMode(next); try { localStorage.setItem("nsf_hide", JSON.stringify(next)); } catch (e) {} };

  // ════════════════ METRICS ════════════════
  const metrics = useMemo(() => {
    const closed = trades.filter(t => t.status === "Closed" && !t.isPaper);
    const open = trades.filter(t => t.status === "Open" && !t.isPaper);
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

  // ── Pre-compute all trade metrics once (before any early return) ──
  const allTradeMetrics = useMemo(() => {
    const map = {};
    trades.forEach(t => { map[t.id] = calcMetrics(t); });
    return map;
  }, [trades]);

  if (!loaded) return <div style={{ background: "#0a0a0a", color: "#525252", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 13, letterSpacing: 2 }}>NSF</div>;

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

  _cap = metrics.totalCapInr || (settings.inrCapital + settings.usdCapital * settings.fxRate); // update global for dAmt % mode
  _mtfRate = settings.mtfInterestRate || 8.5;
  _exnessComm = settings.exnessCommission || 7;
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

  const shared = { metrics, settings, trades, hideCapital, hideMode, combined, inrTotal, usdTotal, isMobile };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: F_UI, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: isMobile ? "visible" : "hidden" }}>
      {showPreMarket && <PreMarketModal preMarket={preMarket} savePreMarket={savePreMarket} setShowPreMarket={setShowPreMarket} setShowBrief={setShowBrief} />}
      {showBrief && <DailyBriefModal metrics={metrics} settings={settings} trades={trades} hideCapital={hideCapital} setShowBrief={setShowBrief} />}
      {showSettings && <SettingsModal settings={settings} saveSettings={saveSettings} setShowSettings={setShowSettings} exportData={exportData} importData={importData} />}
      {closeTrade && <CloseTradeModal trade={closeTrade} setCloseTrade={setCloseTrade} trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} />}
      {showReview && <MonthlyReviewModal trades={trades} settings={settings} reviews={reviews} saveReviews={saveReviews} setShowReview={setShowReview} />}
      {editTrade && <EditTradeModal trade={editTrade} setEditTrade={setEditTrade} trades={trades} saveTrades={saveTrades} />}
      

      {/* SIDEBAR (DESKTOP) */}
      {!isMobile && (
        <div style={{ width: 240, background: C.surface, borderRight: `1px solid ${C.border}`, height: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {/* Logo */}
          <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: C.text }}>NSF</div>
                <div style={{ fontSize: 9, letterSpacing: 2, color: C.textD, marginTop: 1 }}>NotSoFolio Alpha</div>
              </div>
              <button onClick={toggleHide} title={hideMode === "numbers" ? "Show %" : hideMode === "pct" ? "Hide" : "Show numbers"} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer", color: hideMode !== "numbers" ? C.accent : C.textM, fontSize: 11, fontFamily: F_MONO, fontWeight: 600 }}>{hideMode === "numbers" ? "₹" : hideMode === "pct" ? "%" : "•••"}</button>
            </div>
          </div>

          {/* Live stats strip */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 4 }}>TOTAL CAPITAL</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: F_MONO }}>{dAmt(combined, "₹", hideCapital)}</div>
              <div style={{ fontSize: 10, color: metrics.inrPnl + metrics.usdPnl * settings.fxRate >= 0 ? C.green : C.red, fontFamily: F_MONO, marginTop: 2 }}>
                {dAmt(metrics.inrPnl + metrics.usdPnl * (settings.fxRate||100), "₹", hideCapital)} all time
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Daily", val: metrics.dayDD, limit: settings.dailyDDLimit || 3 },
                { label: "Monthly", val: metrics.monthDD, limit: settings.monthlyDDLimit || 10 },
              ].map(({ label, val, limit }) => (
                <div key={label} style={{ background: C.surface2, borderRadius: 5, padding: "7px 10px" }}>
                  <div style={{ fontSize: 9, color: C.textD }}>{label}</div>
                  <div style={{ fontSize: 13, fontFamily: F_MONO, fontWeight: 600, color: val <= -limit ? C.red : val <= -limit*0.6 ? C.amber : C.green, marginTop: 2 }}>
                    {val >= 0 ? "+" : ""}{val.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
            {metrics.breaches.length > 0 && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>⚠ {metrics.breaches.length} breach{metrics.breaches.length > 1 ? "es" : ""}</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 20px", background: page === n.id ? C.surface2 : "transparent", border: "none", borderLeft: page === n.id ? `3px solid ${C.accent}` : "3px solid transparent", color: page === n.id ? C.text : C.textM, fontSize: 13, fontFamily: F_UI, cursor: "pointer", fontWeight: page === n.id ? 600 : 400, transition: "all 0.1s" }}>{n.label}</button>
            ))}
          </div>

          {/* Open trades quick view */}
          {trades.filter(t => t.status === "Open").length > 0 && (
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 8 }}>OPEN POSITIONS</div>
              {trades.filter(t => t.status === "Open").slice(0, 4).map(t => {
                const m = calcMetrics(t);
                const cur = t.platform === "AB" ? "₹" : "$";
                return (
                  <div key={t.id} onClick={() => setPage("positions")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{t.stockName || t.market.replace("MCX ", "")}</div>
                      <div style={{ fontSize: 9, color: t.direction === "Long" ? C.green : C.red }}>{t.direction} · {t.qty} lots</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {m.livePnl !== null ? <div style={{ fontSize: 11, color: m.livePnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(m.livePnl, cur, hideCapital)}</div> : <div style={{ fontSize: 10, color: C.textD }}>—</div>}
                      <div style={{ fontSize: 9, color: m.slAtBE ? C.green : C.textD }}>{m.slAtBE ? "BE ✓" : `SL ${t.currentSL || t.stopLoss}`}</div>
                    </div>
                  </div>
                );
              })}
              {trades.filter(t => t.status === "Open").length > 4 && (
                <div style={{ fontSize: 10, color: C.textD, marginTop: 6, textAlign: "center" }}>+{trades.filter(t => t.status === "Open").length - 4} more</div>
              )}
            </div>
          )}

          {/* Bottom buttons */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => setShowReview(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "7px 12px", borderRadius: 5, fontSize: 11, fontFamily: F_UI, cursor: "pointer", textAlign: "left" }}>📋 Monthly Review</button>
            <button onClick={() => setShowSettings(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textM, padding: "7px 12px", borderRadius: 5, fontSize: 11, fontFamily: F_UI, cursor: "pointer", textAlign: "left" }}>⚙ Settings · Export</button>
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
      <div style={{ flex: 1, minWidth: 0, overflowY: isMobile ? "visible" : "auto", overflowX: "hidden", height: isMobile ? "auto" : "100vh", minHeight: isMobile ? "100vh" : "auto", background: C.bg }}>
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

        <div style={{ padding: isMobile ? "16px" : "28px", minHeight: isMobile ? "calc(100vh - 160px)" : "auto" }}>
          {page === "dashboard" && <DashboardM metrics={metrics} settings={settings} trades={trades} hideCapital={hideCapital} hideMode={hideMode} combined={combined} inrTotal={inrTotal} usdTotal={usdTotal} isMobile={isMobile} />}
          {page === "positions" && <PositionsM trades={trades} saveTrades={saveTrades} setEditTrade={setEditTrade} setCloseTrade={setCloseTrade} hideCapital={hideCapital} isMobile={isMobile} metrics={metrics} settings={settings} />}
          {page === "holdings" && <HoldingsM settings={settings} saveSettings={saveSettings} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "addtrade" && <AddTradeM trades={trades} saveTrades={saveTrades} settings={settings} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} recommendedRisk={metrics.recommendedRisk} templates={templates} saveTemplates={saveTemplates} />}
          {page === "journal" && <JournalM trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "returns" && <ReturnsM trades={trades} settings={settings} hideCapital={hideCapital} isMobile={isMobile} />}
          {page === "rules" && <RulesM metrics={metrics} settings={settings} />}
          {page === "calculator" && <CalculatorM settings={settings} trades={trades} saveTrades={saveTrades} setPage={setPage} hideCapital={hideCapital} isMobile={isMobile} recommendedRisk={metrics.recommendedRisk} />}
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
  const [closeType, setCloseType] = useState("");
  const [customPrice, setCustomPrice] = useState(trade.cmp || "");
  const [exitDate, setExitDate] = useState(today());
  const cur = trade.platform === "AB" ? "₹" : "$";
  const isLong = trade.direction === "Long";
  const slPrice = trade.currentSL || trade.stopLoss;
  const targetPrice = trade.target;
  const finalExit = closeType === "sl" ? slPrice : closeType === "target" ? targetPrice : customPrice;
  const m = calcMetrics({ ...trade, exitPrice: finalExit, status: "Closed" });
  const stopDist = Math.abs(+trade.entry - +(trade.stopLoss || 0));
  const achievedR = finalExit && stopDist > 0
    ? +(( isLong ? +finalExit - +trade.entry : +trade.entry - +finalExit ) / stopDist).toFixed(1)
    : null;

  const OPTIONS = [
    { id: "sl", label: "Hit Stop Loss", price: slPrice, color: C.red, sub: `SL at ${slPrice}` },
    { id: "target", label: "Hit Target", price: targetPrice, color: C.green, sub: targetPrice ? `Target at ${targetPrice}` : "No target set", disabled: !targetPrice },
    { id: "custom", label: "Custom Exit", price: customPrice, color: C.accent, sub: "Enter price manually" },
  ];

  const doClose = () => {
    if (!finalExit) return;
    const exitReason = closeType === "sl" ? "Hit stop loss" : closeType === "target" ? "Hit target" : "Custom exit";
    saveTrades(trades.map(t => t.id === trade.id ? { ...t, status: "Closed", exitPrice: finalExit, exitDate, exitReason } : t));
    setCloseTrade(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Close Trade</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{trade.stockName ? `${trade.stockName} Fut` : trade.market} · {trade.direction}</div>
        <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginBottom: 20 }}>Entry {trade.entry} · SL {slPrice}{targetPrice ? ` · Target ${targetPrice}` : ""}</div>
        <Label style={{ marginBottom: 10 }}>How did it close?</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {OPTIONS.map(opt => (
            <div key={opt.id} onClick={() => !opt.disabled && setCloseType(opt.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: closeType === opt.id ? opt.color + "12" : C.surface2, border: `1px solid ${closeType === opt.id ? opt.color + "50" : C.border}`, borderRadius: 6, cursor: opt.disabled ? "not-allowed" : "pointer", opacity: opt.disabled ? 0.5 : 1 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${closeType === opt.id ? opt.color : C.borderH}`, background: closeType === opt.id ? opt.color : "transparent", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: closeType === opt.id ? C.text : C.textM, fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: C.textD, marginTop: 1 }}>{opt.sub}</div>
              </div>
              {opt.price && closeType === opt.id && opt.id !== "custom" && (
                <div style={{ fontSize: 15, color: opt.color, fontFamily: F_MONO, fontWeight: 700 }}>{opt.price}</div>
              )}
            </div>
          ))}
        </div>
        {closeType === "custom" && (
          <div style={{ marginBottom: 14 }}>
            <Label style={{ marginBottom: 6 }}>Exit Price</Label>
            <Input type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)} placeholder="Your exit price" />
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <Label style={{ marginBottom: 6 }}>Exit Date</Label>
          <Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
        </div>
        {finalExit && closeType && (
          <div style={{ background: (m.pnl || 0) >= 0 ? C.green + "15" : C.red + "15", border: `1px solid ${(m.pnl || 0) >= 0 ? C.green : C.red}40`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: C.textD }}>Realized P&L</div>
                <div style={{ fontSize: 26, color: (m.pnl || 0) >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{dAmt(m.pnl, cur, false)}</div>
              </div>
              {achievedR !== null && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: C.textD }}>Achieved</div>
                  <div style={{ fontSize: 22, color: achievedR >= 1 ? C.green : achievedR >= 0 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{achievedR > 0 ? "+" : ""}{achievedR}R</div>
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setCloseTrade(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={doClose} size="lg" style={{ flex: 2 }} disabled={!finalExit || !closeType}>
            {closeType === "sl" ? "Close at Stop" : closeType === "target" ? "Close at Target" : "Close Trade"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ metrics, settings, trades, hideCapital, hideMode, combined, inrTotal, usdTotal, isMobile }) {
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
  const yearTrades = trades.filter(t => t.status === "Closed" && !t.isPaper && (t.exitDate || "").startsWith(currentYear));
  const yearInrPnl = yearTrades.filter(t => t.platform === "AB").reduce((a, t) => a + (calcMetrics(t).pnl || 0), 0);
  const yearUsdPnl = yearTrades.filter(t => t.platform === "Exness").reduce((a, t) => a + (calcMetrics(t).pnl || 0), 0);
  const totalPnlInr = yearInrPnl + yearUsdPnl * (settings.fxRate || 100);
  const annualDDUsed = Math.min(0, totalPnlInr);
  const annualDDPct = totalCap > 0 ? Math.abs(annualDDUsed) / totalCap * 100 : 0;

  // ── ABNORMALITIES DETECTION ──
  const abnormalities = [];

  // Capital bucket overuse
  const tradingOver = tradingDeployed - abTrading;
  const dryPowderOver = dryPowderUsed - abDryPowder;
  if (tradingOver > 0) abnormalities.push({ type: "capital", msg: `Trading cap exceeded by ${dAmt(tradingOver, "₹", false)} — ₹${(tradingDeployed/100000).toFixed(1)}L deployed vs ₹${(abTrading/100000).toFixed(0)}L target`, color: C.red });
  if (dryPowderOver > 0) abnormalities.push({ type: "capital", msg: `Dry powder exceeded by ${dAmt(dryPowderOver, "₹", false)}`, color: C.red });
  const abBucketsTotal = abStocks + abTrading + abDryPowder;
  if (abBucketsTotal > abTarget + 1000) abnormalities.push({ type: "capital", msg: `AB sub-buckets total ₹${(abBucketsTotal/100000).toFixed(1)}L exceeds AB capital ₹${(abTarget/100000).toFixed(0)}L by ${dAmt(abBucketsTotal - abTarget, "₹", false)}`, color: C.amber });
  const stocksTotal = stocksPledged + stocksUnpledged;
  if (stocksTotal > abStocks + 1000) abnormalities.push({ type: "capital", msg: `Pledged + Unpledged stocks total ₹${(stocksTotal/100000).toFixed(1)}L exceeds stocks bucket ₹${(abStocks/100000).toFixed(0)}L`, color: C.amber });

  // Risk violations
  if (metrics.totalRiskPct > 2.5) abnormalities.push({ type: "risk", msg: `Total open risk ${metrics.totalRiskPct.toFixed(2)}% exceeds 2.5% max`, color: C.red });
  if (metrics.openWithRiskCount >= 5) abnormalities.push({ type: "risk", msg: `5 trades with active risk — at maximum`, color: C.amber });
  if (metrics.dayDD <= -(settings.dailyDDLimit || 3)) abnormalities.push({ type: "circuit", msg: `Daily circuit breached (${metrics.dayDD.toFixed(2)}%)`, color: C.red });
  if (metrics.weekDD <= -(settings.weeklyDDLimit || 6)) abnormalities.push({ type: "circuit", msg: `Weekly circuit breached (${metrics.weekDD.toFixed(2)}%)`, color: C.red });
  if (metrics.monthDD <= -(settings.monthlyDDLimit || 10)) abnormalities.push({ type: "circuit", msg: `Monthly circuit breached (${metrics.monthDD.toFixed(2)}%)`, color: C.red });
  if (annualDDPct > (settings.annualDDLimit || 30) * 0.7) abnormalities.push({ type: "circuit", msg: `Annual drawdown at ${annualDDPct.toFixed(1)}% — ${((settings.annualDDLimit || 30) - annualDDPct).toFixed(1)}% remaining`, color: annualDDPct > (settings.annualDDLimit || 30) ? C.red : C.amber });

  // Trade issues — open positions
  const openTrades = trades.filter(t => t.status === "Open");
  const paperTrades = trades.filter(t => t.status === "Paper");
  const noSL = openTrades.filter(t => !t.stopLoss);
  if (noSL.length > 0) abnormalities.push({ type: "trade", msg: `${noSL.length} open trade${noSL.length > 1 ? "s" : ""} without stop loss`, color: C.red });
  const lowConviction = openTrades.filter(t => t.conviction && +t.conviction < 6);
  if (lowConviction.length > 0) abnormalities.push({ type: "trade", msg: `${lowConviction.length} trade${lowConviction.length > 1 ? "s" : ""} entered with conviction below 6`, color: C.amber });
  const mentorTrades = openTrades.filter(t => t.setupTag === "Mentor Trade");
  const noStockName = trades.filter(t => t.market === "Stock Futures" && !t.stockName);
  if (noStockName.length > 0) abnormalities.push({ type: "trade", msg: `${noStockName.length} Stock Futures trade${noStockName.length > 1 ? "s" : ""} missing stock name`, color: C.textD });
  const badRR = openTrades.filter(t => { const m = allTradeMetrics[t.id] || calcMetrics(t); return m.rr > 0 && m.rr < 2.99; });
  if (badRR.length > 0) abnormalities.push({ type: "trade", msg: `${badRR.length} open trade${badRR.length > 1 ? "s" : ""} with R:R below 1:3`, color: C.amber });
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

      {/* ── ABNORMALITIES PANEL ── */}
      {abnormalities.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 2 }}>
          <div style={{ padding: "10px 16px", background: C.surface2, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: abnormalities.some(a => a.color === C.red) ? C.red : C.amber, letterSpacing: 1 }}>⚠ {abnormalities.length} ISSUE{abnormalities.length > 1 ? "S" : ""} DETECTED</span>
            <span style={{ fontSize: 10, color: C.textD }}>{["capital","risk","circuit","trade"].map(type => { const count = abnormalities.filter(a => a.type === type).length; return count > 0 ? `${count} ${type}` : null; }).filter(Boolean).join(" · ")}</span>
          </div>
          <div>
            {abnormalities.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: i < abnormalities.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 12, color: a.color === C.red ? C.text : C.textM }}>{a.msg}</div>
                  <div style={{ fontSize: 10, color: C.textD, marginTop: 1, textTransform: "capitalize" }}>{a.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          {(() => {
            const tradingOverflow = Math.max(0, tradingDeployed - abTrading);
            const effectiveDryUsed = dryPowderUsed + tradingOverflow;
            const buckets = [
              { label: "Stocks", target: abStocks, deployed: pledgeNet > 0 ? pledgeNet : 0, color: C.accent, sub: `Pledged ₹${(stocksPledged/100000).toFixed(0)}L · Unpledged ₹${(stocksUnpledged/100000).toFixed(0)}L`, overflow: 0 },
              { label: "Trading Capital", target: abTrading, deployed: Math.min(tradingDeployed, abTrading), color: C.green, sub: "Active futures / options", overflow: tradingOverflow },
              { label: "Dry Powder", target: abDryPowder, deployed: effectiveDryUsed, color: C.amber, sub: tradingOverflow > 0 ? `${dAmt(tradingOverflow, "₹", false)} absorbed from trading overflow` : "For new opportunities", overflow: 0 },
            ];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {buckets.map(b => {
                  const free = b.target - b.deployed - b.overflow;
                  const isOver = b.overflow > 0 || b.deployed + b.overflow > b.target;
                  const barPct = Math.min(120, b.target > 0 ? ((b.deployed + b.overflow) / b.target) * 100 : 0);
                  return (
                    <div key={b.label} style={{ background: C.surface2, borderRadius: 6, padding: "10px 12px", border: `1px solid ${isOver ? C.red + "50" : "transparent"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{b.label}</span>
                          <div style={{ fontSize: 10, color: isOver ? C.red : C.textD, marginTop: 1 }}>{b.sub}</div>
                          {b.overflow > 0 && <div style={{ fontSize: 10, color: C.red, marginTop: 2, fontWeight: 600 }}>⚠ {dAmt(b.overflow, "₹", hideCapital)} over limit — using dry powder</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, color: isOver ? C.red : b.color, fontFamily: F_MONO, fontWeight: 600 }}>{b.overflow > 0 ? dAmt(tradingDeployed, "₹", hideCapital) : dAmt(b.target, "₹", hideCapital)}</div>
                          <div style={{ fontSize: 9, fontFamily: F_MONO, color: isOver ? C.red : C.textD }}>
                            {b.overflow > 0 ? `${dAmt(b.overflow, "₹", hideCapital)} over` : free >= 0 ? `${dAmt(free, "₹", hideCapital)} free` : `${dAmt(Math.abs(free), "₹", hideCapital)} over`}
                          </div>
                        </div>
                      </div>
                      <Bar_ pct={Math.min(100, b.target > 0 ? (b.deployed / b.target) * 100 : 0)} color={b.color} height={4} />
                      {b.overflow > 0 && <Bar_ pct={Math.min(100, b.target > 0 ? (b.overflow / b.target) * 100 : 0)} color={C.red} height={3} style={{ marginTop: 2 }} />}
                    </div>
                  );
                })}
              </div>
            );
          })()}

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
            { label: "Weekly P&L", value: dAmt((metrics.weekInrPnl||0)+(metrics.weekUsdPnl||0)*(settings.fxRate||100),"₹",hideCapital), sub: `AB ${dAmt(metrics.weekInrPnl||0,"₹",hideCapital)} · Ex ${dAmt(metrics.weekUsdPnl||0,"$",hideCapital)}`, color: (metrics.weekInrPnl||0)+(metrics.weekUsdPnl||0)*(settings.fxRate||100) >= 0 ? C.green : C.red },
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

function AddToPositionModal({ trade, setAddToPosition, trades, saveTrades, settings }) {
  const [addType, setAddType] = useState(""); // "scale" | "pyramid"
  const [lots, setLots] = useState("");
  const [newEntry, setNewEntry] = useState(trade.cmp || "");
  const [newSL, setNewSL] = useState(trade.currentSL || trade.stopLoss || "");
  const [newTarget, setNewTarget] = useState(trade.target || "");
  const [conviction, setConviction] = useState(7);
  const m = calcMetrics(trade);
  const cur = trade.platform === "AB" ? "₹" : "$";
  const totalCap = settings.totalCapital || 12000000;
  const mult = +trade.multiplier || 1;

  // New trade risk
  const newStopDist = newEntry && newSL ? Math.abs(+newEntry - +newSL) : 0;
  const newRiskAmt = newStopDist > 0 && lots ? +lots * mult * newStopDist : 0;
  const newRiskPct = totalCap > 0 ? (newRiskAmt / totalCap) * 100 : 0;

  // Combined after add
  const totalLots = +trade.qty + (+lots || 0);
  const avgEntry = lots && newEntry ? ((+trade.qty * +trade.entry) + (+lots * +newEntry)) / totalLots : +trade.entry;

  const isPyramid = addType === "pyramid";
  const isScale = addType === "scale";

  const validPyramid = isPyramid && (trade.direction === "Long" ? +newEntry > +trade.entry : +newEntry < +trade.entry);
  const validScale = isScale && +newEntry !== 0;
  const canAdd = (validPyramid || validScale) && lots > 0 && newEntry && newSL;

  const doAdd = () => {
    if (!canAdd) return;
    // Create a new linked trade entry
    const addedTrade = {
      ...trade,
      id: "trade_" + Date.now(),
      qty: lots.toString(),
      entry: newEntry,
      stopLoss: newSL,
      currentSL: newSL,
      target: newTarget || trade.target,
      conviction,
      status: "Open",
      date: today(),
      setupTag: isPyramid ? "Pyramid Add" : "Scale In",
      parentId: trade.id,
      pnl: null, exitPrice: null, exitDate: null,
    };
    // If pyramid — update original trade's SL to new tighter SL
    const updatedTrades = isPyramid
      ? trades.map(t => t.id === trade.id ? { ...t, currentSL: newSL } : t)
      : trades;
    saveTrades([addedTrade, ...updatedTrades]);
    setAddToPosition(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 460, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Add to Position</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{trade.market} · {trade.direction}</div>
        <div style={{ fontSize: 12, color: C.textD, fontFamily: F_MONO, marginBottom: 20 }}>Current: {trade.qty} lots @ {trade.entry} · SL {trade.currentSL || trade.stopLoss}</div>

        {/* Type selector */}
        <div style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 10 }}>Why are you adding?</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div onClick={() => setAddType("scale")} style={{ padding: "12px 16px", background: isScale ? C.green + "12" : C.surface2, border: `1px solid ${isScale ? C.green + "50" : C.border}`, borderRadius: 6, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${isScale ? C.green : C.borderH}`, background: isScale ? C.green : "transparent" }} />
                <div>
                  <div style={{ fontSize: 13, color: isScale ? C.text : C.textM, fontWeight: 600 }}>Scale In</div>
                  <div style={{ fontSize: 11, color: C.textD, marginTop: 2 }}>Planned from start — adding the second half at your intended price</div>
                </div>
              </div>
            </div>
            <div onClick={() => setAddType("pyramid")} style={{ padding: "12px 16px", background: isPyramid ? C.amber + "12" : C.surface2, border: `1px solid ${isPyramid ? C.amber + "50" : C.border}`, borderRadius: 6, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${isPyramid ? C.amber : C.borderH}`, background: isPyramid ? C.amber : "transparent" }} />
                <div>
                  <div style={{ fontSize: 13, color: isPyramid ? C.text : C.textM, fontWeight: 600 }}>Pyramid</div>
                  <div style={{ fontSize: 11, color: C.textD, marginTop: 2 }}>Trade is working — adding at a better price with tighter SL</div>
                </div>
              </div>
            </div>
          </div>
          {isPyramid && !validPyramid && lots && newEntry && (
            <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>
              ⚠ Pyramid entry must be {trade.direction === "Long" ? "above" : "below"} your original entry ({trade.entry}). This looks like averaging down.
            </div>
          )}
        </div>

        {addType && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><Label style={{ marginBottom: 6 }}>Lots to Add</Label><Input type="number" value={lots} onChange={e => setLots(e.target.value)} placeholder="e.g. 2" /></div>
              <div><Label style={{ marginBottom: 6 }}>Entry Price</Label><Input type="number" value={newEntry} onChange={e => setNewEntry(e.target.value)} placeholder="0.00" /></div>
              <div>
                <Label style={{ marginBottom: 6 }}>New Stop Loss {isPyramid && <span style={{ fontSize: 9, color: C.amber }}>tighter for both</span>}</Label>
                <Input type="number" value={newSL} onChange={e => setNewSL(e.target.value)} placeholder="0.00" style={{ borderColor: isPyramid ? C.amber + "60" : undefined }} />
                {isPyramid && <div style={{ fontSize: 10, color: C.amber, marginTop: 4 }}>Will update original trade SL to this</div>}
              </div>
              <div><Label style={{ marginBottom: 6 }}>Target</Label><Input type="number" value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder={trade.target || "0.00"} /></div>
            </div>

            {/* Conviction */}
            <div style={{ marginBottom: 14 }}>
              <Label style={{ marginBottom: 8 }}>Conviction</Label>
              <div style={{ display: "flex", gap: 4 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => setConviction(n)} style={{ flex: 1, padding: "7px 0", background: conviction >= n ? (n >= 8 ? C.green + "30" : n >= 6 ? C.amber + "20" : C.red + "20") : C.surface2, color: conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) : C.textD, border: `1px solid ${conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) + "50" : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: "pointer" }}>{n}</button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {lots && newEntry && (
              <div style={{ background: C.surface2, borderRadius: 6, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textD, letterSpacing: 1, marginBottom: 8 }}>AFTER ADDING</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div><div style={{ fontSize: 9, color: C.textD }}>TOTAL LOTS</div><div style={{ fontSize: 14, color: C.text, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{totalLots}</div></div>
                  <div><div style={{ fontSize: 9, color: C.textD }}>AVG ENTRY</div><div style={{ fontSize: 14, color: C.text, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{avgEntry.toFixed(2)}</div></div>
                  <div><div style={{ fontSize: 9, color: C.textD }}>NEW RISK</div><div style={{ fontSize: 14, color: newRiskPct > 2 ? C.red : C.textM, fontFamily: F_MONO, fontWeight: 600, marginTop: 2 }}>{dAmt(newRiskAmt, cur, false)}</div></div>
                </div>
                {newRiskPct > 2 && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>⚠ This add puts {newRiskPct.toFixed(2)}% at risk — above 2% threshold</div>}
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn variant="ghost" onClick={() => setAddToPosition(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={doAdd} size="lg" style={{ flex: 2 }} disabled={!canAdd}>
            Add {lots || "?"} Lots
          </Btn>
        </div>
      </div>
    </div>
  );
}

function PreTradeChecklistPopup({ trade, onConfirm, onCancel, isPaper }) {
  const [preTrade, setPreTrade] = useState(PRE_TRADE_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}));
  const [tmplName, setTmplName] = useState("");
  const [showTmplInput, setShowTmplInput] = useState(false);
  const [conviction, setConviction] = useState(trade.conviction || 7);
  const count = Object.values(preTrade).filter(Boolean).length;
  const allChecked = count === PRE_TRADE_CHECKLIST.length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: isPaper ? C.textD : C.accent, textTransform: "uppercase", marginBottom: 4 }}>{isPaper ? "Paper Trade" : "Pre-Trade Check"}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{trade.stockName || trade.market} · {trade.direction}</div>
        <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginBottom: 20 }}>Entry {trade.entry} · SL {trade.stopLoss} · {trade.qty} lots</div>

        {!isPaper && (
          <>
            <Label style={{ marginBottom: 12 }}>Checklist <span style={{ color: count === PRE_TRADE_CHECKLIST.length ? C.green : C.textD, fontFamily: F_MONO, fontSize: 10 }}>{count}/{PRE_TRADE_CHECKLIST.length}</span></Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {PRE_TRADE_CHECKLIST.map(c => (
                <div key={c.key} onClick={() => setPreTrade({ ...preTrade, [c.key]: !preTrade[c.key] })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: preTrade[c.key] ? C.green + "10" : C.surface2, border: `1px solid ${preTrade[c.key] ? C.green + "40" : C.border}`, borderRadius: 6, cursor: "pointer" }}>
                  <div style={{ width: 16, height: 16, border: `2px solid ${preTrade[c.key] ? C.green : C.borderH}`, background: preTrade[c.key] ? C.green : "transparent", borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{preTrade[c.key] && <span style={{ color: C.bg, fontSize: 10, fontWeight: 700 }}>✓</span>}</div>
                  <span style={{ fontSize: 13, color: preTrade[c.key] ? C.text : C.textM }}>{c.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <Label style={{ marginBottom: 10 }}>Conviction</Label>
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} onClick={() => setConviction(n)} style={{ flex: 1, padding: "8px 0", background: conviction >= n ? (n >= 8 ? C.green + "30" : n >= 6 ? C.amber + "20" : C.red + "20") : C.surface2, color: conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) : C.textD, border: `1px solid ${conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) + "50" : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: "pointer", fontWeight: 600 }}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: conviction >= 8 ? C.green : conviction >= 6 ? C.amber : C.red, marginBottom: 20 }}>
          {conviction < 6 && !isPaper ? "⚠ Low conviction — consider skipping. Save as paper trade instead?" : conviction >= 8 ? "High conviction — go ahead" : "Medium conviction — double-check your setup"}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          {!isPaper && conviction < 6 && (
            <Btn onClick={() => onConfirm({ preTrade, conviction, asPaper: true })} size="lg" style={{ flex: 1, color: C.textM, borderColor: C.border }}>Save as Paper</Btn>
          )}
          <Btn variant="primary" onClick={() => onConfirm({ preTrade, conviction, asPaper: isPaper })} size="lg" style={{ flex: 2 }} disabled={!isPaper && !allChecked}>
            {isPaper ? "Save Paper Trade" : allChecked ? "Save Real Trade" : `${count}/${PRE_TRADE_CHECKLIST.length} checked`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const PARTIAL_REASONS = ["Hit partial target", "Protecting profit", "Reducing size before news", "Trailing stop hit", "Uncertain — just reducing"];

function PartialCloseModal({ trade, setPartialClose, trades, saveTrades, hideCapital }) {
  const [lots, setLots] = useState("");
  const [exitPrice, setExitPrice] = useState(trade.cmp || "");
  const [exitDate, setExitDate] = useState(today());
  const [reason, setReason] = useState("");
  const m = calcMetrics(trade);
  const cur = trade.platform === "AB" ? "₹" : "$";
  const maxLots = +trade.qty;
  const closingLots = Math.min(+lots || 0, maxLots - 1);
  const remainingLots = maxLots - closingLots;
  const isLong = trade.direction === "Long";
  const partialPnl = exitPrice && trade.entry && closingLots > 0
    ? (isLong ? +exitPrice - +trade.entry : +trade.entry - +exitPrice) * closingLots * (+trade.multiplier || 1)
    : null;
  const achievedR = partialPnl !== null && m.stopDist > 0
    ? (partialPnl / (closingLots * (+trade.multiplier || 1))) / m.stopDist
    : null;

  const doPartialClose = () => {
    if (!exitPrice || closingLots <= 0 || closingLots >= maxLots) return;
    const closedTrade = {
      ...trade, id: "trade_" + Date.now(), qty: closingLots.toString(),
      status: "Closed", exitPrice, exitDate, pnl: partialPnl,
      exitReason: reason || "Partial close", parentId: trade.id + "_partial",
    };
    const remainingTrade = { ...trade, qty: remainingLots.toString() };
    saveTrades([closedTrade, ...trades.map(t => t.id === trade.id ? remainingTrade : t)]);
    setPartialClose(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Partial Close</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{trade.market} · {trade.direction} · {maxLots} lots</div>
        <div style={{ marginBottom: 14 }}>
          <Label style={{ marginBottom: 6 }}>Lots to close (max {maxLots - 1})</Label>
          <Input type="number" value={lots} onChange={e => setLots(Math.min(+e.target.value, maxLots - 1).toString())} placeholder={`1 – ${maxLots - 1}`} />
          {closingLots > 0 && <div style={{ fontSize: 11, color: C.textD, marginTop: 5 }}>{closingLots} lots closed · {remainingLots} lots remain open</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label style={{ marginBottom: 6 }}>Exit Price</Label>
          <Input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="0.00" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label style={{ marginBottom: 6 }}>Exit Date</Label>
          <Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Label style={{ marginBottom: 8 }}>Why are you closing partial?</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PARTIAL_REASONS.map(r => (
              <div key={r} onClick={() => setReason(r)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: reason === r ? C.accent + "15" : C.surface2, border: `1px solid ${reason === r ? C.accent + "50" : C.border}`, borderRadius: 5, cursor: "pointer" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${reason === r ? C.accent : C.borderH}`, background: reason === r ? C.accent : "transparent", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: reason === r ? C.text : C.textM }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        {partialPnl !== null && (
          <div style={{ background: partialPnl >= 0 ? C.green + "15" : C.red + "15", border: `1px solid ${partialPnl >= 0 ? C.green : C.red}40`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: C.textD }}>Realized P&L · {closingLots} lots</div>
                <div style={{ fontSize: 22, color: partialPnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{dAmt(partialPnl, cur, false)}</div>
              </div>
              {achievedR !== null && <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: C.textD }}>Achieved</div>
                <div style={{ fontSize: 18, color: achievedR >= 1 ? C.green : achievedR >= 0 ? C.amber : C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{achievedR > 0 ? "+" : ""}{achievedR.toFixed(1)}R</div>
              </div>}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setPartialClose(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={doPartialClose} size="lg" style={{ flex: 2 }} disabled={!exitPrice || closingLots <= 0}>
            Close {closingLots > 0 ? closingLots : "?"} Lots
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Positions({ trades, saveTrades, setEditTrade, setCloseTrade, hideCapital, isMobile, metrics, settings }) {
  const [filter, setFilter] = useState("All");
  const [pf, setPf] = useState("All");
  const [mktCat, setMktCat] = useState("All"); // All / Stocks / Commodities / Nifty / Forex
  const [partialClose, setPartialClose] = useState(null);
  const [addToPosition, setAddToPosition] = useState(null);
  const [batchCMP, setBatchCMP] = useState({});
  const STOCK_MARKETS = ["Stocks", "Stock Futures"];
  const COMMODITY_MARKETS = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "XAU/USD (Gold)", "XAG/USD (Silver)", "Oil (WTI/USOIL)", "Natural Gas"];
  const NIFTY_MARKETS = ["Nifty 50", "BankNifty"];
  const FOREX_MARKETS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "NZD/USD", "USD/CHF", "USD/CAD", "GBP/JPY", "EUR/JPY", "EUR/GBP"];

  const filtered = trades.filter(t => {
    if (filter !== "All" && t.status !== filter) return false;
    if (pf !== "All" && t.platform !== pf) return false;
    if (mktCat === "Stocks" && !STOCK_MARKETS.includes(t.market)) return false;
    if (mktCat === "Commodities" && !COMMODITY_MARKETS.includes(t.market)) return false;
    if (mktCat === "Nifty" && !NIFTY_MARKETS.includes(t.market)) return false;
    if (mktCat === "Forex" && !FOREX_MARKETS.includes(t.market)) return false;
    return true;
  });
  const del = (id) => { if (confirm("Delete this trade?")) saveTrades(trades.filter(t => t.id !== id)); };
  const activate = (id) => saveTrades(trades.map(t => t.id === id ? { ...t, status: "Open" } : t));
  const updateCMP = (id, val) => saveTrades(trades.map(t => t.id === id ? { ...t, cmp: val } : t));
  const updateSL = (id, val) => saveTrades(trades.map(t => t.id === id ? { ...t, currentSL: val } : t));
  const totalCap = settings.totalCapital || 12000000;

  const FilterBar = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.textD, letterSpacing: 1 }}>STATUS</span>
        {["All", "Open", "Closed", "Pending", "Paper"].map(f => <Btn key={f} variant={filter === f ? "primary" : "ghost"} onClick={() => setFilter(f)} size="sm" style={f === "Paper" ? { color: filter === f ? C.bg : C.textD, borderColor: C.textD + "40" } : {}}>{f}</Btn>)}
        <div style={{ width: 1, background: C.border, margin: "0 4px", height: 20 }} />
        <span style={{ fontSize: 10, color: C.textD, letterSpacing: 1 }}>PLATFORM</span>
        {["All", "AB", "Exness"].map(p => <Btn key={p} variant={pf === p ? "primary" : "ghost"} onClick={() => setPf(p)} size="sm">{p}</Btn>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.textD, letterSpacing: 1 }}>MARKET</span>
        {["All", "Stocks", "Commodities", "Nifty", "Forex"].map(m => <Btn key={m} variant={mktCat === m ? "primary" : "ghost"} onClick={() => setMktCat(m)} size="sm">{m}</Btn>)}
      </div>
    </div>
  );

  const openTrades = trades.filter(t => t.status === "Open");
  const paperTrades = trades.filter(t => t.status === "Paper");
  const totalLivePnl = openTrades.reduce((a, t) => { const m = calcMetrics(t); return a + (m.livePnl !== null ? (t.platform === "AB" ? m.livePnl : m.livePnl * (settings.fxRate||100)) : 0); }, 0);
  const hasCMP = openTrades.some(t => t.cmp);

  const SummaryBar = () => openTrades.length > 0 ? (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>OPEN</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: F_MONO, marginTop: 4 }}>{openTrades.length}</div>
        <div style={{ fontSize: 9, color: C.textD }}>trades</div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>AT RISK</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: metrics.openWithRiskCount >= 5 ? C.red : metrics.openWithRiskCount >= 3 ? C.amber : C.text, fontFamily: F_MONO, marginTop: 4 }}>{metrics.openWithRiskCount}/5</div>
        <div style={{ fontSize: 9, color: C.textD }}>active risk</div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${hasCMP ? (totalLivePnl >= 0 ? C.green + "40" : C.red + "40") : C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>LIVE P&L</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: !hasCMP ? C.textD : totalLivePnl >= 0 ? C.green : C.red, fontFamily: F_MONO, marginTop: 4 }}>{hasCMP ? dAmt(totalLivePnl, "₹", false) : "—"}</div>
        <div style={{ fontSize: 9, color: C.textD }}>{hasCMP ? "combined ₹" : "enter CMP"}</div>
      </div>
      {!isMobile && <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>RISK ₹</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: F_MONO, marginTop: 4 }}>{dAmt(metrics.openInrRisk, "₹", false)}</div>
        <div style={{ fontSize: 9, color: C.textD }}>{metrics.totalRiskPct.toFixed(2)}% of cap</div>
      </div>}
    </div>
  ) : null;

  // CMP Batch Update
  const openTradesForCMP = trades.filter(t => t.status === "Open");
  const applyBatchCMP = () => {
    if (Object.keys(batchCMP).length === 0) return;
    saveTrades(trades.map(t => batchCMP[t.id] !== undefined ? { ...t, cmp: batchCMP[t.id] } : t));
    setBatchCMP({});
  };

  const CMPBatch = () => openTradesForCMP.length > 0 ? (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>UPDATE ALL CMP</div>
        <Btn variant="primary" onClick={applyBatchCMP} size="sm" disabled={Object.keys(batchCMP).length === 0}>Apply {Object.keys(batchCMP).length > 0 ? `(${Object.keys(batchCMP).length})` : ""}</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {openTradesForCMP.map(t => {
          const m = calcMetrics(t); const cur = t.platform === "AB" ? "₹" : "$";
          const val = batchCMP[t.id] !== undefined ? batchCMP[t.id] : (t.cmp || "");
          const liveR = val && t.entry && t.stopLoss ? +(((t.direction === "Long" ? +val - +t.entry : +t.entry - +val) / Math.abs(+t.entry - +t.stopLoss)).toFixed(1)) : null;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.stockName || t.market.replace("MCX ","")}</div>
                <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO }}>Entry {t.entry} · SL {t.currentSL || t.stopLoss}</div>
              </div>
              <Input type="number" value={val} onChange={e => setBatchCMP({ ...batchCMP, [t.id]: e.target.value })} placeholder={t.cmp || "CMP"} style={{ width: 110, fontSize: 13 }} />
              {liveR !== null && <span style={{ fontSize: 11, fontFamily: F_MONO, fontWeight: 700, color: liveR >= 0 ? C.green : C.red, width: 36, textAlign: "right", flexShrink: 0 }}>{liveR >= 0 ? "+" : ""}{liveR}R</span>}
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  if (filtered.length === 0) return <div><SummaryBar /><CMPBatch /><FilterBar /><div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No trades match these filters</div></div>;

  // MOBILE card layout
  if (isMobile) return (
    <div>
      {partialClose && <PartialCloseModal trade={partialClose} setPartialClose={setPartialClose} trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} />}
      {addToPosition && <AddToPositionModal trade={addToPosition} setAddToPosition={setAddToPosition} trades={trades} saveTrades={saveTrades} settings={settings} />}
      <SummaryBar />
      <CMPBatch />
      <FilterBar />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(t => {
          const m = calcMetrics(t);
          const cur = t.platform === "AB" ? "₹" : "$";
          const isOpen = t.status === "Open";
          const isPending = t.status === "Pending";
          const isClosed = t.status === "Closed";
          const isPaper = t.status === 'Paper';
          const sColor = isOpen ? C.green : isClosed ? C.textD : isPaper ? C.textD : C.amber;
          const displayPnl = isClosed ? m.pnl : m.livePnl;
          const pnlColor = (displayPnl || 0) > 0 ? C.green : (displayPnl || 0) < 0 ? C.red : C.textD;
          const capUsed = t.capitalUsed ? +t.capitalUsed : (+t.marginPerLot > 0 ? +t.qty * +t.marginPerLot : null);
          const oneRLevel = m.bePrice > 0 ? (t.direction === "Long" ? m.bePrice + m.stopDist : m.bePrice - m.stopDist) : null;
          const finalTargetAmt = m.rr > 0 ? m.riskAmt * m.rr : null;

          return (
            <div key={t.id} style={{ background: C.surface, border: `1px solid ${isOpen ? C.border : C.dim}`, borderRadius: 10, overflow: "hidden" }}>

              {/* ── HEADER: market + status + P&L ── */}
              <div style={{ padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{t.stockName ? `${t.stockName} Fut` : t.market}{t.parentId && <span style={{ color: C.amber, fontSize: 10, marginLeft: 6 }}>↗</span>}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction}</span>
                    <span style={{ fontSize: 10, color: C.textD }}>·</span>
                    <span style={{ fontSize: 11, color: C.textD }}>{t.platform === "AB" ? "AB" : "Exness"}</span>
                    <span style={{ fontSize: 10, color: C.textD }}>·</span>
                    <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>{t.date.slice(5)}{isOpen ? ` · ${timeSince(t.date)}` : ""}</span>
                    {isPaper && <span style={{ fontSize: 9, padding: "2px 7px", background: C.textD + "20", color: C.textD, borderRadius: 3, letterSpacing: 1, fontWeight: 600 }}>PAPER</span>}{t.setupTag && <span style={{ fontSize: 10, color: t.setupTag.includes("Mentor") ? C.amber : C.textD, padding: "1px 5px", background: t.setupTag.includes("Mentor") ? C.amber + "15" : C.surface2, borderRadius: 3 }}>{t.setupTag}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: sColor + "20", color: sColor, fontWeight: 600 }}>{t.status}</span>
                  {displayPnl !== null && displayPnl !== undefined && (
                    <div style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 700, color: pnlColor, marginTop: 4 }}>{dAmt(displayPnl, cur, false)}</div>
                  )}
                </div>
              </div>

              {/* ── KEY NUMBERS: Entry/SL/Target/CapUsed/1R/FinalAmt ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border }}>
                {[
                  { label: "ENTRY", val: t.entry, color: C.text },
                  { label: "STOP", val: `${t.currentSL || t.stopLoss}${m.slAtBE ? " ✓" : ""}`, color: m.slAtBE ? C.green : C.textM },
                  { label: "TARGET", val: t.target || "—", color: C.textM },
                  { label: "CAP USED", val: capUsed ? dAmt(capUsed, cur, hideCapital) : "—", color: capUsed ? C.amber : C.textD, sub: capUsed ? null : "enter margin/lot" },
                  { label: "RISK AMT", val: m.slAtBE ? "0 (BE)" : m.riskAmt > 0 ? dAmt(m.riskAmt, cur, hideCapital) : "—", color: m.slAtBE ? C.green : C.textM },
                  { label: "TARGET AMT", val: finalTargetAmt ? dAmt(finalTargetAmt, cur, hideCapital) : "—", color: C.accent },
                ].map(({ label, val, color, sub }) => (
                  <div key={label} style={{ background: C.surface2, padding: "9px 12px" }}>
                    <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, color, fontFamily: F_MONO, fontWeight: 600 }}>{val}</div>
                    {sub && <div style={{ fontSize: 9, color: C.textD, marginTop: 1 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* ── METADATA: R:R · Lots · Risk (small, below grid) ── */}
              <div style={{ padding: "7px 16px", background: C.dim, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>R:R <span style={{ color: m.rr >= 3 ? C.green : m.rr > 0 ? C.amber : C.textD }}>1:{m.rr || "—"}</span></span>
                <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>1R <span style={{ color: C.green }}>{oneRLevel ? oneRLevel.toFixed(1) : "—"}</span></span>
                <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>{t.market === "Stocks" ? "Shares" : "Lots"} <span style={{ color: C.text }}>{t.qty}</span></span>
                {t.conviction && <span style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>Conv <span style={{ color: +t.conviction >= 8 ? C.green : +t.conviction >= 6 ? C.amber : C.red }}>{t.conviction}/10</span></span>}
              </div>
              {(() => { const mtf = calcMTFInterest(t); return mtf ? (
                <div style={{ padding: "7px 16px", background: C.amber + "08", borderTop: `1px solid ${C.amber}25`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>MTF Interest</span>
                    <span style={{ fontSize: 10, color: C.textD, marginLeft: 8 }}>{mtf.days}d · ₹{mtf.daily.toFixed(2)}/day</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, color: C.amber, fontFamily: F_MONO, fontWeight: 700 }}>−₹{mtf.interest.toFixed(2)}</span>
                    {(m.livePnl !== null || m.pnl !== null) && <div style={{ fontSize: 9, color: C.textD }}>Net P&L: {dAmt((m.livePnl ?? m.pnl ?? 0) - mtf.interest, "₹", hideCapital)}</div>}
                  </div>
                </div>
              ) : null; })()}

              {/* ── LIVE TRACKING (open only) ── */}
              {isOpen && (
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textD, marginBottom: 5 }}>Current Price (CMP)</div>
                      <input type="number" value={t.cmp || ""} onChange={e => updateCMP(t.id, e.target.value)} placeholder="Enter for live P&L" style={{ ...INPUT_BASE, fontSize: 14 }} />
                      {m.liveR !== null && (
                        <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                          <span style={{ fontSize: 12, color: m.liveR >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 600 }}>{m.liveR >= 0 ? "+" : ""}{m.liveR}R</span>
                          <span style={{ fontSize: 12, color: pnlColor, fontFamily: F_MONO }}>{dAmt(displayPnl, cur, false)}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: C.textD }}>Current SL</span>
                        {!m.slAtBE && m.bePrice > 0 && (
                          <button onClick={() => updateSL(t.id, m.bePrice.toFixed(2))} style={{ fontSize: 10, padding: "3px 8px", background: C.amber + "25", border: `1px solid ${C.amber}50`, color: C.amber, borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>→ BE</button>
                        )}
                      </div>
                      <input type="number" value={t.currentSL || ""} onChange={e => updateSL(t.id, e.target.value)} placeholder={m.bePrice > 0 ? `Entry: ${m.bePrice.toFixed(2)}` : "Update SL"} style={{ ...INPUT_BASE, fontSize: 14, border: `1.5px solid ${m.slAtBE ? C.green : C.border}` }} />
                      {m.slAtBE && <div style={{ fontSize: 11, color: C.green, marginTop: 5, fontWeight: 600 }}>✓ Free trade — no loss possible</div>}
                      {!m.slAtBE && m.oneRLevel > 0 && t.cmp && +t.cmp >= m.oneRLevel && (
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 5 }}>Price at 1R — move SL to entry</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACTIONS ── */}
              <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {isPending && <Btn variant="success" onClick={() => activate(t.id)} size="md" style={{ flex: 1 }}>Activate</Btn>}
                {isPaper && <Btn onClick={() => saveTrades(trades.map(tr => tr.id === t.id ? { ...tr, status: "Pending", isPaper: false } : tr))} size="md" style={{ flex: 1, color: C.accent, borderColor: C.accent + "50" }}>→ Go Real</Btn>}
                {isOpen && <Btn variant="danger" onClick={() => setCloseTrade(t)} size="md" style={{ flex: 1, minWidth: 90 }}>Close All</Btn>}
                {isOpen && +t.qty > 1 && <Btn onClick={() => setPartialClose(t)} size="md" style={{ flex: 1, minWidth: 110, color: C.amber, borderColor: C.amber + "50" }}>Partial Close</Btn>}
                {isOpen && !t.parentId && <Btn onClick={() => setAddToPosition(t)} size="md" style={{ flex: 1, minWidth: 90, color: C.textM }}>+ Pyramid</Btn>}
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <Btn onClick={() => setEditTrade(t)} size="sm" style={{ padding: "5px 12px", fontSize: 11 }}>Edit</Btn>
                  <Btn variant="danger" onClick={() => del(t.id)} size="sm" style={{ padding: "5px 10px", fontSize: 11 }}>✕</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // DESKTOP table
  return (
    <div>
      {partialClose && <PartialCloseModal trade={partialClose} setPartialClose={setPartialClose} trades={trades} saveTrades={saveTrades} hideCapital={hideCapital} />}
      {addToPosition && <AddToPositionModal trade={addToPosition} setAddToPosition={setAddToPosition} trades={trades} saveTrades={saveTrades} settings={settings} />}
      <SummaryBar />
      <CMPBatch />
      <FilterBar />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No trades match these filters</div>
        ) : filtered.map((t, idx) => {
          const m = calcMetrics(t); const cur = t.platform === "AB" ? "₹" : "$";
          const isOpen = t.status === "Open"; const isClosed = t.status === "Closed"; const isPending = t.status === "Pending";
          const displayPnl = isClosed ? m.pnl : m.livePnl;
          const pnlColor = (displayPnl || 0) > 0 ? C.green : (displayPnl || 0) < 0 ? C.red : C.textD;
          const isPaper = t.status === 'Paper';
          const sColor = isOpen ? C.green : isClosed ? C.textD : isPaper ? C.textD : C.amber;
          return (
            <div key={t.id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : "none" }}>
              {/* ROW 1 — key info */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 90px 95px 95px 80px 80px 90px 1fr", alignItems: "center", padding: "10px 16px", background: idx % 2 === 1 ? C.surface2 + "30" : "transparent", gap: 4 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.stockName || t.market.replace("MCX ", "").replace("/USD (Gold)", " Gold").replace("/USD (Silver)", " Silver")}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction}</span>
                    <span style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO }}>{t.date.slice(5)}</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: sColor + "20", color: sColor, fontWeight: 600 }}>{t.status}</span>
                    {t.setupTag?.includes("Mentor") && <span style={{ fontSize: 9, color: C.amber, background: C.amber + "15", padding: "1px 5px", borderRadius: 3 }}>{t.setupTag}</span>}
                  </div>
                </div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>ENTRY</div><div style={{ fontSize: 13, fontFamily: F_MONO, fontWeight: 600 }}>{t.entry}</div></div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>SL{m.slAtBE ? " ✓BE" : ""}</div><div style={{ fontSize: 13, fontFamily: F_MONO, color: m.slAtBE ? C.green : C.textM }}>{t.currentSL || t.stopLoss}</div></div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>TARGET</div><div style={{ fontSize: 13, fontFamily: F_MONO, color: C.textM }}>{t.target || "—"}</div></div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>LOTS</div><div style={{ fontSize: 13, fontFamily: F_MONO }}>{t.qty}</div></div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>R:R</div><div style={{ fontSize: 13, fontFamily: F_MONO, color: m.rr >= 3 ? C.green : m.rr > 0 ? C.amber : C.textD }}>{m.rr ? `1:${m.rr}` : "—"}</div></div>
                <div><div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>RISK</div><div style={{ fontSize: 13, fontFamily: F_MONO, color: m.slAtBE ? C.green : C.textM }}>{m.slAtBE ? "BE ✓" : dAmt(m.riskAmt, cur, hideCapital)}</div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.textD, marginBottom: 2 }}>P&L{m.liveR !== null ? ` (${m.liveR >= 0 ? "+" : ""}${m.liveR}R)` : ""}</div>
                  <div style={{ fontSize: 15, fontFamily: F_MONO, fontWeight: 700, color: pnlColor }}>{displayPnl !== null && displayPnl !== undefined ? dAmt(displayPnl, cur, hideCapital) : "—"}</div>
                  {(() => { const mtf = calcMTFInterest(t); return mtf ? <div style={{ fontSize: 9, color: C.amber, marginTop: 1 }}>−₹{mtf.interest.toFixed(0)} MTF</div> : null; })()}
                </div>
              </div>
              {/* ROW 2 — inputs + actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 16px 10px", background: idx % 2 === 1 ? C.surface2 + "30" : "transparent" }}>
                {isOpen && <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 10, color: C.textD }}>CMP</span>
                    <input type="number" value={t.cmp || ""} onChange={e => updateCMP(t.id, e.target.value)} placeholder="—" style={{ ...INPUT_BASE, fontSize: 12, width: 100, padding: "5px 8px" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 10, color: C.textD }}>SL</span>
                    <input type="number" value={t.currentSL || ""} onChange={e => updateSL(t.id, e.target.value)} placeholder="update" style={{ ...INPUT_BASE, fontSize: 12, width: 90, padding: "5px 8px", border: `1.5px solid ${m.slAtBE ? C.green : C.border}` }} />
                    {!m.slAtBE && m.bePrice > 0 && <button onClick={() => updateSL(t.id, m.bePrice.toFixed(2))} style={{ fontSize: 10, padding: "3px 8px", background: C.amber + "20", border: `1px solid ${C.amber}40`, color: C.amber, borderRadius: 3, cursor: "pointer", fontWeight: 700 }}>→ BE</button>}
                  </div>
                </>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {isPending && <Btn variant="success" onClick={() => activate(t.id)} size="sm">Activate</Btn>}
                  {isOpen && <Btn variant="danger" onClick={() => setCloseTrade(t)} size="sm">Close</Btn>}
                  {isOpen && +t.qty > 1 && <Btn onClick={() => setPartialClose(t)} size="sm" style={{ color: C.amber, borderColor: C.amber + "50" }}>Partial</Btn>}
                  {isOpen && <Btn onClick={() => setAddToPosition(t)} size="sm" style={{ color: C.green, borderColor: C.green + "50" }}>+Add</Btn>}
                  <Btn onClick={() => setEditTrade(t)} size="sm">Edit</Btn>
                  <Btn variant="danger" onClick={() => del(t.id)} size="sm">✕</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddTrade({ trades, saveTrades, settings, setPage, hideCapital, isMobile, recommendedRisk, templates = [], saveTemplates }) {
  const [platform, setPlatform] = useState("AB");
  const [tradeType, setTradeType] = useState("futures"); // "futures" | "options" | "stocks"
  const [t, setT] = useState({
    date: today(), market: "MCX Gold Mini", platform: "AB", direction: "Long",
    entry: "", stopLoss: "", target: "", qty: "", marginPerLot: "", conviction: 7,
    status: "Pending", setupTag: SETUP_TAGS[0], multiplier: CONTRACT_MULTIPLIERS["MCX Gold Mini"],
    stockName: "", customSetup: "", capitalUsed: "",
    // Options fields
    optionSubmarket: "Nifty Options", strike: "", optionSide: "CE",
    expiry: "", isWriter: false, marginBlocked: "", maxLossLevel: "",
  });
  const [preTrade, setPreTrade] = useState(PRE_TRADE_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}));
  const [tmplName, setTmplName] = useState("");
  const [showTmplInput, setShowTmplInput] = useState(false);

  const isAB = platform === "AB";
  const isExness = platform === "Exness";
  const isOptions = isAB && tradeType === "options";
  const isFutures = isAB && tradeType === "futures" || isExness;
  const isStocksType = isAB && tradeType === "stocks";
  const isStocks = t.market === "Stocks";
  const isStockFut = t.market === "Stock Futures";

  const onPlatformChange = (p) => {
    setPlatform(p);
    if (p === "Exness") {
      const mkt = MARKETS_USD[0];
      setT({ ...t, platform: "Exness", market: mkt, multiplier: EXNESS_MULTIPLIERS[mkt] || 1 });
    } else {
      const mkt = tradeType === "options" ? "Nifty Options" : tradeType === "stocks" ? "Stocks" : MARKETS_INR[0];
      const mult = tradeType === "options" ? (OPTIONS_MULTIPLIERS[mkt] || 0) : (CONTRACT_MULTIPLIERS[mkt] || 1);
      setT({ ...t, platform: "AB", market: mkt, multiplier: mult });
    }
  };

  const onTradeTypeChange = (type) => {
    setTradeType(type);
    if (type === "options") {
      setT({ ...t, market: "Nifty Options", multiplier: OPTIONS_MULTIPLIERS["Nifty Options"], optionSubmarket: "Nifty Options" });
    } else if (type === "stocks") {
      setT({ ...t, market: "Stocks", multiplier: 1 });
    } else {
      const mkt = MARKETS_INR[0];
      setT({ ...t, market: mkt, multiplier: CONTRACT_MULTIPLIERS[mkt] || 1 });
    }
  };

  const onMarketChange = (mkt) => {
    let mult;
    if (isOptions) mult = OPTIONS_MULTIPLIERS[mkt] || 0;
    else if (isExness) mult = EXNESS_MULTIPLIERS[mkt] !== undefined ? EXNESS_MULTIPLIERS[mkt] : 1;
    else mult = mkt === "Stocks" ? 1 : (CONTRACT_MULTIPLIERS[mkt] !== undefined ? CONTRACT_MULTIPLIERS[mkt] : 1);
    setT({ ...t, market: mkt, multiplier: mult, stockName: "", optionSubmarket: isOptions ? mkt : t.optionSubmarket });
  };

  const m = calcMetrics({ ...t, stopLoss: isOptions && !t.isWriter ? t.entry : t.stopLoss }); // options buyer: full premium at risk
  const cur = platform === "AB" ? "₹" : "$";
  const totalCap = settings.totalCapital || 12000000;

  // For options buyers — risk = premium × lots × mult
  // For options writers — risk = undefined (margin-based)
  const optionPremiumRisk = isOptions && !t.isWriter && t.entry && t.qty
    ? +t.entry * +t.qty * (+t.multiplier || 1) : 0;
  const riskInr = isOptions
    ? (t.isWriter ? (+t.marginBlocked || 0) : optionPremiumRisk)
    : (platform === "AB" ? (calcMetrics(t).riskAmt || 0) : (calcMetrics(t).riskAmt || 0) * settings.fxRate);
  const actualRiskPct = totalCap > 0 ? (riskInr / totalCap) * 100 : 0;

  const warnRR = !isOptions && (calcMetrics(t).rr > 0 && calcMetrics(t).rr < 2.99);
  const warnRisk = actualRiskPct > 2.5;
  const multLocked = ["MCX Gold Mini","MCX Silver Mini","MCX Crude Oil","MCX Natural Gas","MCX Copper","MCX Aluminium","Nifty 50","BankNifty"].includes(t.market);
  const capRequired = +t.marginPerLot > 0 ? +t.qty * +t.marginPerLot : null;
  const finalTargetAmt = calcMetrics(t).rr > 0 && calcMetrics(t).riskAmt > 0 ? calcMetrics(t).riskAmt * calcMetrics(t).rr : null;
  const checklistCount = Object.values(preTrade).filter(Boolean).length;
  const g2 = isMobile ? "1fr" : "1fr 1fr";

  // Effective market name for options trades
  const optionsMarketName = isOptions && t.strike && t.optionSide
    ? `${t.optionSubmarket.replace(" Options","")} ${t.strike} ${t.optionSide}`
    : (t.optionSubmarket || "Nifty Options");

  const submit = () => {
    if (!t.entry || !t.stopLoss && !isOptions || !t.qty) { alert("Fill required fields"); return; }
    if (isOptions && !t.strike) { alert("Strike price required for options"); return; }
    const finalTag = t.setupTag === "Other" && t.customSetup ? t.customSetup : t.setupTag;
    const finalCapitalUsed = isStocks ? (t.capitalUsed || (t.qty && t.entry ? +t.qty * +t.entry : "")) : "";
    const finalMarket = isOptions ? optionsMarketName : t.market;
    saveTrades([{
      ...t, id: "trade_" + Date.now(), market: finalMarket,
      setupTag: finalTag, capitalUsed: finalCapitalUsed,
      isOption: isOptions, optionSubmarket: isOptions ? t.optionSubmarket : undefined,
      checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}),
      pnl: null, exitPrice: null, exitDate: null, preTrade, mistakeTag: null, exitReason: null,
    }, ...trades]);
    setPage("positions");
  };

  const applyTemplate = (tmpl) => {
    setPlatform(tmpl.platform);
    setTradeType(tmpl.tradeType || "futures");
    setT(prev => ({ ...prev, ...tmpl.fields, entry: "", stopLoss: "", target: "", qty: "", capitalUsed: "" }));
  };
  const saveAsTemplate = () => {
    if (!tmplName.trim()) return;
    const tmpl = {
      id: "tmpl_" + Date.now(), name: tmplName.trim(), platform, tradeType,
      fields: { market: t.market, multiplier: t.multiplier, direction: t.direction, setupTag: t.setupTag, optionSubmarket: t.optionSubmarket, optionSide: t.optionSide, conviction: t.conviction }
    };
    saveTemplates([tmpl, ...templates]);
    setTmplName(""); setShowTmplInput(false);
  };
  const deleteTemplate = (id) => saveTemplates(templates.filter(t => t.id !== id));

  return (
    <div style={{ maxWidth: 720 }}>
      {/* ── TEMPLATES ── */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 8 }}>TEMPLATES</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {templates.map(tmpl => (
              <div key={tmpl.id} style={{ display: "flex", alignItems: "center", gap: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                <button onClick={() => applyTemplate(tmpl)} style={{ padding: "7px 12px", background: "transparent", border: "none", color: C.text, fontSize: 12, fontFamily: F_UI, cursor: "pointer", fontWeight: 500 }}>{tmpl.name}</button>
                <button onClick={() => deleteTemplate(tmpl.id)} style={{ padding: "7px 8px", background: "transparent", border: "none", color: C.textD, fontSize: 11, cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── STEP 1: PLATFORM ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
        <Label style={{ marginBottom: 10 }}>Platform</Label>
        <div style={{ display: "flex", gap: 8 }}>
          {[["AB", "Aditya Birla"], ["Exness", "Exness"]].map(([val, label]) => (
            <button key={val} onClick={() => onPlatformChange(val)} style={{ flex: 1, padding: "12px 0", background: platform === val ? C.accent : C.surface2, color: platform === val ? C.bg : C.textM, border: `1px solid ${platform === val ? C.accent : C.border}`, borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: F_UI, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── STEP 2: TRADE TYPE (AB only) ── */}
      {isAB && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>Trade Type</Label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["futures", "Futures"], ["options", "Options"], ["stocks", "Stocks"]].map(([val, label]) => (
              <button key={val} onClick={() => onTradeTypeChange(val)} style={{ flex: 1, padding: "10px 0", background: tradeType === val ? C.accent + "20" : C.surface2, color: tradeType === val ? C.accent : C.textM, border: `1.5px solid ${tradeType === val ? C.accent : C.border}`, borderRadius: 6, fontSize: 13, fontWeight: tradeType === val ? 700 : 400, fontFamily: F_UI, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 3: TRADE DETAILS ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 14 }}>
        <Label style={{ marginBottom: 16 }}>Trade Details</Label>
        <div style={{ display: "grid", gridTemplateColumns: g2, gap: 14 }}>

          {/* MARKET */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Market</Label>
            <Select value={t.market} onChange={e => onMarketChange(e.target.value)} options={
              isExness ? MARKETS_USD :
              isOptions ? [...OPTIONS_NSE, ...OPTIONS_MCX] :
              isStocksType ? ["Stocks"] :
              MARKETS_INR
            } />
          </div>

          {/* OPTIONS-SPECIFIC FIELDS */}
          {isOptions && <>
            {(t.market === "Stock Options" || t.market === "MCX Gold Options" || t.market === "MCX Silver Options" || t.market === "MCX Crude Options") && (
              <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
                <Label style={{ marginBottom: 6 }}>Underlying Name</Label>
                <Input value={t.stockName || ""} onChange={e => setT({ ...t, stockName: e.target.value })} placeholder="e.g. Reliance, HDFC Bank" />
              </div>
            )}
            <div>
              <Label style={{ marginBottom: 6 }}>Strike Price</Label>
              <Input type="number" value={t.strike || ""} onChange={e => setT({ ...t, strike: e.target.value })} placeholder="e.g. 24000" />
            </div>
            <div>
              <Label style={{ marginBottom: 6 }}>Option Type</Label>
              <div style={{ display: "flex", gap: 8 }}>
                {["CE", "PE"].map(side => (
                  <button key={side} onClick={() => setT({ ...t, optionSide: side })} style={{ flex: 1, padding: "10px 0", background: t.optionSide === side ? (side === "CE" ? C.green + "20" : C.red + "20") : C.surface2, color: t.optionSide === side ? (side === "CE" ? C.green : C.red) : C.textD, border: `1.5px solid ${t.optionSide === side ? (side === "CE" ? C.green : C.red) : C.border}`, borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: F_MONO, cursor: "pointer" }}>{side}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>CE = Call (buy right to buy) · PE = Put (buy right to sell)</div>
            </div>
            <div>
              <Label style={{ marginBottom: 6 }}>Expiry Date</Label>
              <Input type="date" value={t.expiry || ""} onChange={e => setT({ ...t, expiry: e.target.value })} />
            </div>
            <div>
              <Label style={{ marginBottom: 6 }}>Action</Label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["false", "Buy (Long)"], ["true", "Write (Sell)"]].map(([val, label]) => (
                  <button key={val} onClick={() => setT({ ...t, isWriter: val === "true", direction: val === "true" ? "Short" : "Long" })} style={{ flex: 1, padding: "9px 0", background: String(t.isWriter) === val ? C.amber + "20" : C.surface2, color: String(t.isWriter) === val ? C.amber : C.textD, border: `1.5px solid ${String(t.isWriter) === val ? C.amber : C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: F_UI, cursor: "pointer" }}>{label}</button>
                ))}
              </div>
            </div>
            {t.isWriter && (
              <div style={{ gridColumn: isMobile ? "auto" : "span 2", background: C.amber + "10", border: `1px solid ${C.amber}30`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 8 }}>⚠ Option Writing — Undefined Risk</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label style={{ marginBottom: 5 }}>Margin Blocked (₹)</Label>
                    <Input type="number" value={t.marginBlocked || ""} onChange={e => setT({ ...t, marginBlocked: e.target.value })} placeholder="Broker margin" />
                  </div>
                  <div>
                    <Label style={{ marginBottom: 5 }}>Max Loss Level (premium)</Label>
                    <Input type="number" value={t.maxLossLevel || ""} onChange={e => setT({ ...t, maxLossLevel: e.target.value })} placeholder="Buyback at?" />
                    <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>Premium at which you'd close</div>
                  </div>
                </div>
              </div>
            )}
            {t.multiplier === 0 && (
              <div>
                <Label style={{ marginBottom: 6 }}>Lot Size <span style={{ color: C.red, fontSize: 9 }}>required</span></Label>
                <Input type="number" value={t.multiplier || ""} onChange={e => setT({ ...t, multiplier: +e.target.value || 0 })} placeholder="Check NSE/MCX" />
              </div>
            )}
          </>}

          {/* STOCKS-SPECIFIC */}
          {isStocksType && <>
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Stock Name</Label>
              <Input value={t.stockName || ""} onChange={e => setT({ ...t, stockName: e.target.value })} placeholder="e.g. Reliance, HDFC Bank, TCS" />
            </div>
          </>}

          {/* STOCK FUTURES name */}
          {isStockFut && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Stock Name</Label>
              <Input value={t.stockName || ""} onChange={e => setT({ ...t, stockName: e.target.value })} placeholder="e.g. Reliance, HDFC Bank" />
            </div>
          )}

          {/* COMMON FIELDS */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Status</Label>
            <Select value={t.status} onChange={e => setT({ ...t, status: e.target.value })} options={["Pending", "Open"]} />
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textD }}>Date: {t.date}</span>
              <button onClick={() => setT({ ...t, _showDate: !t._showDate })} style={{ fontSize: 10, color: C.accent, background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>{t._showDate ? "hide" : "change date"}</button>
            </div>
            {t._showDate && <Input type="date" value={t.date} onChange={e => setT({ ...t, date: e.target.value })} style={{ marginTop: 6 }} />}
          </div>
          <div>
            <Label style={{ marginBottom: 6 }}>{isOptions ? "Premium (per unit)" : isStocksType ? "Entry Price" : "Entry Price"}</Label>
            <Input type="number" value={t.entry} onChange={e => {
              const entry = e.target.value;
              const autoCapital = isStocksType && entry && t.qty ? (+t.qty * +entry).toFixed(2) : t.capitalUsed;
              setT({ ...t, entry, capitalUsed: autoCapital });
            }} placeholder="0.00" />
            {isOptions && !t.isWriter && <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>Max loss = premium × lots × {t.multiplier || "lot size"}</div>}
          </div>
          {(!isOptions || !t.isWriter) && (
            <div>
              <Label style={{ marginBottom: 6 }}>{isOptions ? "Exit Premium (target)" : "Stop Loss"}</Label>
              <Input type="number" value={t.stopLoss} onChange={e => setT({ ...t, stopLoss: e.target.value })} placeholder="0.00" />
            </div>
          )}
          <div><Label style={{ marginBottom: 6 }}>Target {isOptions ? "Premium" : "Price"}</Label><Input type="number" value={t.target || ""} onChange={e => setT({ ...t, target: e.target.value })} placeholder="0.00" /></div>
          <div>
            <Label style={{ marginBottom: 6 }}>{isStocksType ? "Number of Shares" : isOptions ? "Number of Lots" : "Number of Lots"}</Label>
            <Input type="number" value={t.qty} onChange={e => {
              const qty = e.target.value;
              const autoCapital = isStocksType && qty && t.entry ? (+qty * +t.entry).toFixed(2) : t.capitalUsed;
              setT({ ...t, qty, capitalUsed: autoCapital });
            }} placeholder={isStocksType ? "e.g. 100" : "e.g. 4"} />
          </div>

          {/* STOCKS: Capital Used */}
          {isStocksType && (
            <div>
              <Label style={{ marginBottom: 6 }}>Capital Used (₹) <span style={{ color: C.textD, fontSize: 9 }}>edit for MTF</span></Label>
              <Input type="number" value={t.capitalUsed || ""} onChange={e => setT({ ...t, capitalUsed: e.target.value })} placeholder={t.qty && t.entry ? (+t.qty * +t.entry).toFixed(0) : "Auto: shares × price"} />
              {t.qty && t.entry && (
                <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>
                  Full value: ₹{(+t.qty * +t.entry).toLocaleString("en-IN")}
                  {t.capitalUsed && +t.capitalUsed < +t.qty * +t.entry && <span style={{ color: C.amber, marginLeft: 6 }}>MTF — {(+t.capitalUsed / (+t.qty * +t.entry) * 100).toFixed(0)}% margin</span>}
                </div>
              )}
            </div>
          )}

          {/* FUTURES: Margin per lot */}
          {isFutures && !isExness && !isStocksType && (
            <div>
              <Label style={{ marginBottom: 6 }}>Margin per Lot <span style={{ color: C.textD, fontSize: 9 }}>optional</span></Label>
              <Input type="number" value={t.marginPerLot || ""} onChange={e => setT({ ...t, marginPerLot: e.target.value })} placeholder="e.g. 55000" />
            </div>
          )}

          {/* CONTRACT MULTIPLIER (AB futures + options with 0 multiplier) */}
          {isAB && !isStocksType && !isOptions && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Contract Multiplier {multLocked && <span style={{ color: C.textD, fontSize: 9 }}>auto-set</span>}{isStockFut && <span style={{ color: C.red, fontSize: 9 }}>required</span>}</Label>
              <Input type="number" value={t.multiplier} onChange={e => setT({ ...t, multiplier: +e.target.value || 1 })} style={{ opacity: multLocked ? 0.7 : 1 }} />
            </div>
          )}

          {/* CONVICTION */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Conviction (1–10)</Label>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setT({ ...t, conviction: n })} style={{ flex: 1, padding: "8px 0", background: t.conviction >= n ? (n >= 8 ? C.green + "30" : n >= 6 ? C.amber + "20" : C.red + "20") : C.surface2, color: t.conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) : C.textD, border: `1px solid ${t.conviction >= n ? (n >= 8 ? C.green : n >= 6 ? C.amber : C.red) + "50" : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: "pointer", fontWeight: 600 }}>{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, marginTop: 5, color: t.conviction >= 8 ? C.green : t.conviction >= 6 ? C.amber : C.red }}>{t.conviction >= 8 ? "High conviction — go ahead" : t.conviction >= 6 ? "Medium — double-check setup" : "Low — consider skipping"}</div>
          </div>

          {/* SETUP TYPE */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label style={{ marginBottom: 6 }}>Setup Type</Label>
            <Select value={t.setupTag} onChange={e => setT({ ...t, setupTag: e.target.value, customSetup: "" })} options={SETUP_TAGS} />
            {t.setupTag === "Other" && <Input value={t.customSetup || ""} onChange={e => setT({ ...t, customSetup: e.target.value })} placeholder="Describe your setup..." style={{ marginTop: 8 }} />}
          </div>
        </div>
      </div>

      {/* PRE-TRADE CHECKLIST */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Label>Pre-Trade Checklist</Label>
          <span style={{ fontSize: 10, color: checklistCount === PRE_TRADE_CHECKLIST.length ? C.green : C.textD, fontFamily: F_MONO }}>{checklistCount}/{PRE_TRADE_CHECKLIST.length}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,1fr)", gap: 8 }}>
          {PRE_TRADE_CHECKLIST.map(c => (
            <div key={c.key} onClick={() => setPreTrade({ ...preTrade, [c.key]: !preTrade[c.key] })} style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: preTrade[c.key] ? C.green + "10" : C.surface2, border: `1px solid ${preTrade[c.key] ? C.green + "40" : C.border}`, borderRadius: 4, cursor: "pointer" }}>
              <div style={{ width: 12, height: 12, border: `1.5px solid ${preTrade[c.key] ? C.green : C.borderH}`, background: preTrade[c.key] ? C.green : "transparent", borderRadius: 2, marginRight: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{preTrade[c.key] && <span style={{ color: C.bg, fontSize: 8, fontWeight: 700 }}>✓</span>}</div>
              <span style={{ fontSize: 11, color: preTrade[c.key] ? C.text : C.textM }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${warnRisk ? C.red + "60" : C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>RISK</div>
          <div style={{ fontSize: 20, color: warnRisk ? C.red : riskInr > 0 ? C.text : C.textD, fontFamily: F_MONO, fontWeight: 700 }}>{riskInr > 0 ? dAmt(riskInr, cur, hideCapital) : "—"}</div>
          <div style={{ fontSize: 10, color: C.textD, marginTop: 3, fontFamily: F_MONO }}>{actualRiskPct.toFixed(3)}%{isOptions && !t.isWriter ? " · full premium" : isOptions && t.isWriter ? " · margin blocked" : ""}</div>
          {!isOptions && <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textD }}>R:R</span>
            <span style={{ fontSize: 14, color: warnRR ? C.red : calcMetrics(t).rr >= 3 ? C.green : C.textD, fontFamily: F_MONO, fontWeight: 600 }}>{calcMetrics(t).rr ? `1:${calcMetrics(t).rr}` : "—"}</span>
            {warnRR && <span style={{ fontSize: 10, color: C.red }}>below min</span>}
          </div>}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>CAPITAL</div>
          {isOptions ? (
            <>
              <div style={{ fontSize: 20, color: C.amber, fontFamily: F_MONO, fontWeight: 700 }}>{t.entry && t.qty ? dAmt(+t.entry * +t.qty * (+t.multiplier||1), cur, hideCapital) : "—"}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{t.isWriter ? "margin blocked" : "premium paid"}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, color: capRequired ? C.amber : C.textD, fontFamily: F_MONO, fontWeight: 700 }}>{capRequired ? dAmt(capRequired, cur, hideCapital) : "—"}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 3 }}>{capRequired ? `${+t.qty} lots × margin` : "enter margin above"}</div>
              {finalTargetAmt && <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.textD }}>Target</span>
                <span style={{ fontSize: 14, color: C.accent, fontFamily: F_MONO, fontWeight: 600 }}>{dAmt(finalTargetAmt, cur, hideCapital)}</span>
              </div>}
            </>
          )}
        </div>
      </div>

      {(warnRR || warnRisk) && (
        <div style={{ background: C.red + "15", border: `1px solid ${C.red}40`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
          {warnRisk && <div style={{ fontSize: 12, color: C.red, marginBottom: 2 }}>⚠ Risk exceeds 2.5%</div>}
          {warnRR && <div style={{ fontSize: 12, color: C.red }}>⚠ R:R below 1:3</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={() => setPage("dashboard")} size="lg">Cancel</Btn>
        {showTmplInput ? (
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <Input value={tmplName} onChange={e => setTmplName(e.target.value)} placeholder="Template name..." style={{ fontSize: 12 }} />
            <Btn variant="primary" onClick={saveAsTemplate} size="lg" disabled={!tmplName.trim()}>Save</Btn>
            <Btn variant="ghost" onClick={() => { setShowTmplInput(false); setTmplName(""); }} size="lg">✕</Btn>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => setShowTmplInput(true)} size="lg" style={{ color: C.textD }}>+ Template</Btn>
        )}
        <Btn variant="primary" onClick={submit} size="lg" style={{ flex: 1 }}>Save Trade</Btn>
      </div>
    </div>
  );
}

function EditTradeModal({ trade, setEditTrade, trades, saveTrades }) {
  const [t, setT] = useState({ ...trade });
  const m = calcMetrics(t);
  const cur = t.platform === "AB" ? "₹" : "$";
  const isStockFut = t.market === "Stock Futures" || t.market === "Stocks";
  const isStocks = t.market === "Stocks"; // pure equity — shares, no multiplier, no margin
  const save = () => {
    const updated = { ...t };
    if (updated.status === "Closed" && !updated.exitDate) updated.exitDate = today();
    if (updated.status === "Closed" && updated.exitPrice) {
      const isLong = updated.direction === "Long";
      const mult = +updated.multiplier || 1;
      const diff = isLong ? +updated.exitPrice - +updated.entry : +updated.entry - +updated.exitPrice;
      updated.pnl = diff * +updated.qty * mult;
    }
    saveTrades(trades.map(tr => tr.id === t.id ? updated : tr));
    setEditTrade(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 620, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 4 }}>Edit Trade</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.stockName || t.market} · {t.platform}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><Label style={{ marginBottom: 6 }}>Status</Label><Select value={t.status} onChange={e => setT({ ...t, status: e.target.value })} options={["Pending", "Open", "Closed"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Direction</Label><Select value={t.direction} onChange={e => setT({ ...t, direction: e.target.value })} options={["Long", "Short"]} /></div>
          <div><Label style={{ marginBottom: 6 }}>Date</Label><Input type="date" value={t.date} onChange={e => setT({ ...t, date: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Lots / Qty</Label><Input type="number" value={t.qty} onChange={e => setT({ ...t, qty: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Entry</Label><Input type="number" value={t.entry} onChange={e => setT({ ...t, entry: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Stop Loss</Label><Input type="number" value={t.stopLoss} onChange={e => setT({ ...t, stopLoss: e.target.value })} /></div>
          <div><Label style={{ marginBottom: 6 }}>Target</Label><Input type="number" value={t.target || ""} onChange={e => setT({ ...t, target: e.target.value })} /></div>
          {t.platform === "AB" && <div><Label style={{ marginBottom: 6 }}>Multiplier</Label><Input type="number" value={t.multiplier ?? CONTRACT_MULTIPLIERS[t.market] ?? 1} onChange={e => setT({ ...t, multiplier: +e.target.value || 1 })} /></div>}
          {isStockFut && <div style={{ gridColumn: "span 2" }}><Label style={{ marginBottom: 6 }}>Stock Name</Label><Input value={t.stockName || ""} onChange={e => setT({ ...t, stockName: e.target.value })} placeholder="e.g. HDFC Bank" /></div>}
          <div><Label style={{ marginBottom: 6 }}>Setup Type</Label><Select value={t.setupTag || SETUP_TAGS[0]} onChange={e => setT({ ...t, setupTag: e.target.value })} options={SETUP_TAGS} /></div>
          <div>
            <Label style={{ marginBottom: 6 }}>Conviction</Label>
            <div style={{ display: "flex", gap: 3 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setT({ ...t, conviction: n })} style={{ flex: 1, padding: "6px 0", background: (t.conviction || 7) >= n ? C.accent + "30" : C.surface2, color: (t.conviction || 7) >= n ? C.accent : C.textD, border: `1px solid ${(t.conviction || 7) >= n ? C.accent + "50" : C.border}`, borderRadius: 3, fontSize: 10, fontFamily: F_MONO, cursor: "pointer" }}>{n}</button>
              ))}
            </div>
          </div>
          {t.status === "Closed" && <>
            <div><Label style={{ marginBottom: 6 }}>Exit Price</Label><Input type="number" value={t.exitPrice ?? ""} onChange={e => setT({ ...t, exitPrice: e.target.value })} /></div>
            <div><Label style={{ marginBottom: 6 }}>Exit Date</Label><Input type="date" value={t.exitDate ?? today()} onChange={e => setT({ ...t, exitDate: e.target.value })} /></div>
          </>}
        </div>
        {t.status === "Closed" && m.pnl !== null && (
          <div style={{ background: m.pnl >= 0 ? C.green + "15" : C.red + "15", border: `1px solid ${m.pnl >= 0 ? C.green : C.red}40`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
            <Label>Realized P&L</Label>
            <div style={{ fontSize: 22, color: m.pnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{fmt(m.pnl, cur)}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setEditTrade(null)} size="lg" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="primary" onClick={save} size="lg" style={{ flex: 2 }}>Save Changes</Btn>
        </div>
      </div>
    </div>
  );
}

function Journal({ trades, saveTrades, hideCapital, isMobile }) {
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [filterSetup, setFilterSetup] = useState("All");
  const [filterResult, setFilterResult] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const list = trades.filter(t => {
    if (t.status === "Pending") return false;
    if (search && !`${t.market} ${t.stockName || ""} ${t.setupTag || ""} ${t.date}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterSetup !== "All" && t.setupTag !== filterSetup) return false;
    if (filterResult === "Win" && (calcMetrics(t).pnl || 0) <= 0) return false;
    if (filterResult === "Loss" && (calcMetrics(t).pnl || 0) >= 0) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const update = (id, patch) => saveTrades(trades.map(t => t.id === id ? { ...t, ...patch } : t));

  const JOURNAL_QUESTIONS = [
    { key: "whyEntered", label: "Why did you enter this trade?", placeholder: "What was the setup? What did the chart show?" },
    { key: "learning", label: "One learning from this trade", placeholder: "Win or loss — what does it teach you?" },
    { key: "freeNotes", label: "Any other notes", placeholder: "Anything else worth capturing" },
  ];

  // Mistake tag summary
  const allWithMistakes = trades.filter(t => t.mistakeTag && t.status === "Closed");
  const mistakeCounts = {};
  allWithMistakes.forEach(t => {
    const tags = Array.isArray(t.mistakeTag) ? t.mistakeTag : [t.mistakeTag];
    tags.forEach(tag => { if (tag) mistakeCounts[tag] = (mistakeCounts[tag] || 0) + 1; });
  });
  const topMistakes = Object.entries(mistakeCounts).sort((a,b) => b[1]-a[1]).slice(0, 5);

  return (
    <div>
      {/* Mistake tag summary */}
      {topMistakes.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 8 }}>PATTERN ANALYSIS · {allWithMistakes.length} tagged trades</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {topMistakes.map(([tag, count]) => (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, borderRadius: 5, padding: "5px 10px" }}>
                <span style={{ fontSize: 12, color: C.textM }}>{tag}</span>
                <span style={{ fontSize: 13, fontFamily: F_MONO, fontWeight: 700, color: count >= 5 ? C.red : count >= 3 ? C.amber : C.textD }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Search + filters */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search market, setup, date..." style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "9px 14px", fontSize: 13, fontFamily: F_UI, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={filterSetup} onChange={e => setFilterSetup(e.target.value)} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "5px 10px", fontSize: 11, fontFamily: F_UI, cursor: "pointer" }}>
            <option value="All">All Setups</option>
            {SETUP_TAGS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "5px 10px", fontSize: 11, fontFamily: F_UI, cursor: "pointer" }}>
            <option value="All">All Results</option>
            <option value="Win">Wins Only</option>
            <option value="Loss">Losses Only</option>
          </select>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12 }} />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12 }} />
          {(search || filterSetup !== "All" || filterResult !== "All" || dateFrom || dateTo) && (
            <Btn variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterSetup("All"); setFilterResult("All"); setDateFrom(""); setDateTo(""); }}>Clear</Btn>
          )}
          <span style={{ fontSize: 11, color: C.textD }}>{list.length} trade{list.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      {list.length === 0 ? <Card><div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>{search || filterSetup !== "All" || filterResult !== "All" || dateFrom || dateTo ? "No trades match your filters" : "No trades to journal yet"}</div></Card> : (
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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showChargesFor, setShowChargesFor] = useState(null); // trade id for breakdown popup

  const closed = trades.filter(t => t.status === "Closed" && !t.isPaper); // real trades only

  const reportTrades = closed.filter(t => {
    const d = t.exitDate || t.date;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });

  const data = useMemo(() => {
    const src = showReport ? reportTrades : closed;
    const groups = {};
    src.forEach(t => {
      const m = calcMetrics(t);
      const ch = calcCharges(t);
      const pnlInr = t.platform === "AB" ? (m.pnl || 0) : (m.pnl || 0) * (settings.fxRate || 100);
      const charges = ch ? (ch.totalInr || ch.total) : 0;
      const k = view === "market" ? (t.stockName || t.market)
              : view === "platform" ? (t.platform === "AB" ? "Aditya Birla" : "Exness")
              : view === "setup" ? (t.setupTag || "Unknown")
              : (t.exitDate || t.date || "").slice(0, 7);
      if (!groups[k]) groups[k] = { name: k, pnl: 0, netPnl: 0, charges: 0, trades: 0, wins: 0, totalR: 0 };
      groups[k].pnl += pnlInr;
      groups[k].charges += charges;
      groups[k].netPnl += pnlInr - charges;
      groups[k].trades += 1;
      if ((m.pnl || 0) > 0) groups[k].wins += 1;
      groups[k].totalR += m.rr || 0;
    });
    return Object.values(groups).sort((a, b) => view === "month" ? a.name.localeCompare(b.name) : b.pnl - a.pnl);
  }, [view, closed, settings, showReport, fromDate, toDate]);

  const totalCap = settings.totalCapital || 12000000;
  const rPnl = reportTrades.reduce((a, t) => { const m = calcMetrics(t); return a + (t.platform === "AB" ? (m.pnl || 0) : (m.pnl || 0) * (settings.fxRate || 100)); }, 0);
  const rCharges = reportTrades.reduce((a, t) => { const ch = calcCharges(t); return a + (ch ? ch.total : 0); }, 0);
  const rNetPnl = rPnl - rCharges;
  const rWins = reportTrades.filter(t => (calcMetrics(t).pnl || 0) > 0).length;
  const rWinRate = reportTrades.length > 0 ? (rWins / reportTrades.length * 100).toFixed(0) : 0;
  const rReturnPct = totalCap > 0 ? (rNetPnl / totalCap * 100).toFixed(2) : "0";
  const rAvgRR = reportTrades.length > 0 ? (reportTrades.reduce((a, t) => a + (calcMetrics(t).rr || 0), 0) / reportTrades.length).toFixed(1) : "—";
  const bestTrade = reportTrades.reduce((best, t) => { const p = calcMetrics(t).pnl || 0; return !best || p > (calcMetrics(best).pnl || 0) ? t : best; }, null);
  const worstTrade = reportTrades.reduce((worst, t) => { const p = calcMetrics(t).pnl || 0; return !worst || p < (calcMetrics(worst).pnl || 0) ? t : worst; }, null);

  // All-time total charges
  const totalChargesAllTime = closed.reduce((a, t) => { const ch = calcCharges(t); return a + (ch ? (ch.totalInr || ch.total) : 0); }, 0);

  const ChargesPopup = ({ tradeId }) => {
    const t = trades.find(x => x.id === tradeId);
    if (!t) return null;
    const ch = calcCharges(t);
    if (!ch) return null;
    const isEx = ch.platform === "Exness";
    const grossPnl = calcMetrics(t).pnl || 0;
    const grossPnlInr = t.platform === "Exness" ? grossPnl * (settings.fxRate || 100) : grossPnl;
    const netPnlInr = grossPnlInr - ch.totalInr;

    const abRows = !isEx ? [
      { label: "Brokerage", val: ch.brokerage, hide: ch.brokerage === 0, note: ch.brokerage === 0 ? "Free (delivery)" : "₹20 × 2" },
      { label: "STT", val: ch.stt },
      { label: "CTT (Commodity)", val: ch.ctt, hide: ch.ctt === 0 },
      { label: "Exchange charges", val: ch.exchange },
      { label: "SEBI charges", val: ch.sebi },
      { label: "GST (18%)", val: ch.gst },
      { label: "Stamp duty", val: ch.stamp },
      { label: "MTF Interest (8.5% p.a.)", val: ch.mtfInterest, hide: ch.mtfInterest === 0 },
    ].filter(r => !r.hide) : [];

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 400, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>CHARGES BREAKDOWN</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{t.stockName || t.market}</div>
          <div style={{ fontSize: 11, color: C.textD, marginBottom: 16 }}>{t.platform} · {t.qty} lots · {t.direction}</div>

          {isEx ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
              <div style={{ background: C.surface2, borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>EXNESS PRO ACCOUNT · SWAP-FREE</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textM }}>Commission rate</span>
                  <span style={{ fontSize: 12, fontFamily: F_MONO }}>${_exnessComm}/lot round trip</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textM }}>Lots</span>
                  <span style={{ fontSize: 12, fontFamily: F_MONO }}>{t.qty}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textM }}>Overnight swap</span>
                  <span style={{ fontSize: 12, fontFamily: F_MONO, color: C.green }}>$0 (swap-free)</span>
                </div>
                <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Total Commission</span>
                  <span style={{ fontSize: 15, fontFamily: F_MONO, color: C.red, fontWeight: 700 }}>${ch.commission.toFixed(2)} (₹{ch.totalInr.toFixed(0)})</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: C.textD, fontFamily: F_MONO, marginBottom: 12 }}>
                Buy: ₹{ch.buyTurnover.toLocaleString("en-IN")} · Sell: ₹{ch.sellTurnover.toLocaleString("en-IN")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
                {abRows.map((r, i) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <span style={{ fontSize: 12, color: C.textM }}>{r.label}</span>
                      {r.note && <span style={{ fontSize: 10, color: C.textD, marginLeft: 8 }}>{r.note}</span>}
                    </div>
                    <span style={{ fontSize: 12, fontFamily: F_MONO, color: C.text }}>₹{r.val.toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Total Charges</span>
                  <span style={{ fontSize: 15, fontFamily: F_MONO, color: C.red, fontWeight: 700 }}>₹{ch.total.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}

          <div style={{ background: C.surface2, borderRadius: 6, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: C.textD }}>Gross P&L</span>
              <span style={{ fontSize: 13, fontFamily: F_MONO, color: grossPnlInr >= 0 ? C.green : C.red }}>{dAmt(grossPnlInr, "₹", false)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Net P&L (after charges)</span>
              <span style={{ fontSize: 16, fontFamily: F_MONO, fontWeight: 700, color: netPnlInr >= 0 ? C.green : C.red }}>{dAmt(netPnlInr, "₹", false)}</span>
            </div>
          </div>
          <Btn variant="primary" onClick={() => setShowChargesFor(null)} size="lg" style={{ width: "100%" }}>Close</Btn>
        </div>
      </div>
    );
  };

  return (
    <div>
      {showChargesFor && <ChargesPopup tradeId={showChargesFor} />}

      {/* Total charges banner */}
      {totalChargesAllTime > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>TOTAL CHARGES (ALL TIME)</div>
            <div style={{ fontSize: 18, color: C.red, fontFamily: F_MONO, fontWeight: 700, marginTop: 3 }}>₹{totalChargesAllTime.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>{closed.length} CLOSED TRADES</div>
            <div style={{ fontSize: 11, color: C.textD, marginTop: 3 }}>avg ₹{(totalChargesAllTime / Math.max(closed.length, 1)).toFixed(0)}/trade</div>
          </div>
        </div>
      )}

      {/* View toggles */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["market","By Market"],["platform","By Platform"],["setup","By Setup"],["month","By Month"]].map(([v,l]) => (
          <Btn key={v} variant={view === v ? "primary" : "ghost"} onClick={() => setView(v)} size="md">{l}</Btn>
        ))}
      </div>

      {/* Date range report */}
      <div style={{ background: C.surface, border: `1px solid ${showReport ? C.accent + "50" : C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Label>Date Range Report</Label>
          {showReport && <Btn variant="ghost" size="sm" onClick={() => { setShowReport(false); setFromDate(""); setToDate(""); }}>Clear</Btn>}
        </div>
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <Label style={{ marginBottom: 6, fontSize: 10 }}>FROM</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label style={{ marginBottom: 6, fontSize: 10 }}>TO</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>
          <Btn variant="primary" onClick={() => setShowReport(true)} size="lg" disabled={!fromDate && !toDate} style={{ width: "100%" }}>Generate Report</Btn>
        </div>

        {showReport && reportTrades.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: C.textD, marginBottom: 10 }}>{fromDate || "Start"} → {toDate || "Today"} · {reportTrades.length} trades</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
              {[
                { label: "Gross P&L", value: dAmt(rPnl, "₹", hideCapital), color: rPnl >= 0 ? C.green : C.red },
                { label: "Total Charges", value: `−₹${rCharges.toFixed(0)}`, color: C.red },
                { label: "Net P&L", value: dAmt(rNetPnl, "₹", hideCapital), color: rNetPnl >= 0 ? C.green : C.red },
                { label: "Return %", value: `${rReturnPct >= 0 ? "+" : ""}${rReturnPct}%`, color: +rReturnPct >= 0 ? C.green : C.red },
              ].map(s => (
                <div key={s.label} style={{ background: C.surface2, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 16, color: s.color, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
              {[
                { label: "Win Rate", value: `${rWinRate}%`, color: +rWinRate >= 50 ? C.green : C.amber },
                { label: "Avg R:R", value: `1:${rAvgRR}`, color: +rAvgRR >= 3 ? C.green : C.amber },
              ].map(s => (
                <div key={s.label} style={{ background: C.surface2, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 16, color: s.color, fontFamily: F_MONO, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
              {bestTrade && <div style={{ background: C.green + "10", border: `1px solid ${C.green}30`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: C.textD }}>BEST TRADE</div>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginTop: 2 }}>{bestTrade.stockName || bestTrade.market}</div>
                <div style={{ fontSize: 13, color: C.green, fontFamily: F_MONO, fontWeight: 700 }}>{dAmt(calcMetrics(bestTrade).pnl, "₹", hideCapital)}</div>
              </div>}
              {worstTrade && <div style={{ background: C.red + "10", border: `1px solid ${C.red}30`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: C.textD }}>WORST TRADE</div>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginTop: 2 }}>{worstTrade.stockName || worstTrade.market}</div>
                <div style={{ fontSize: 13, color: C.red, fontFamily: F_MONO, fontWeight: 700 }}>{dAmt(calcMetrics(worstTrade).pnl, "₹", hideCapital)}</div>
              </div>}
            </div>
          </div>
        )}
        {showReport && reportTrades.length === 0 && (
          <div style={{ fontSize: 12, color: C.textD, marginTop: 12, textAlign: "center" }}>No closed trades in this date range</div>
        )}
      </div>

      {/* Chart */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <Label style={{ marginBottom: 14 }}>Net P&L (after charges) {showReport && <span style={{ fontSize: 10, color: C.accent }}>· filtered</span>}</Label>
        {data.length > 0 ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer><BarChart data={data} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 2" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} />
              <YAxis tick={{ fill: C.textD, fontSize: 10, fontFamily: F_MONO }} stroke={C.border} tickFormatter={v => hideCapital ? "•" : fmt(v)} />
              <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: F_MONO }} formatter={(v, name) => [dAmt(v, "₹", hideCapital), name]} cursor={{ fill: C.surface3 }} />
              <Bar dataKey="netPnl" name="Net P&L" radius={[3,3,0,0]}>{data.map((d,i) => <Cell key={i} fill={d.netPnl >= 0 ? C.green : C.red} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        ) : <div style={{ padding: 40, textAlign: "center", color: C.textD, fontSize: 13 }}>No closed trades yet</div>}
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {isMobile ? (
          <div>
            {data.map((d, i) => (
              <div key={d.name} style={{ padding: "12px 16px", borderBottom: i < data.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO, marginTop: 2 }}>{d.trades} trades · {((d.wins/d.trades)*100).toFixed(0)}% win · 1:{d.trades > 0 ? (d.totalR/d.trades).toFixed(1) : "—"}</div>
                    <div style={{ fontSize: 10, color: C.red, fontFamily: F_MONO, marginTop: 2 }}>Charges: ₹{d.charges.toFixed(0)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.textD, fontFamily: F_MONO }}>Gross: {dAmt(d.pnl, "₹", hideCapital)}</div>
                    <div style={{ fontSize: 16, color: d.netPnl >= 0 ? C.green : C.red, fontFamily: F_MONO, fontWeight: 700 }}>{dAmt(d.netPnl, "₹", hideCapital)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
              {["Category", "Trades", "Win Rate", "Avg R:R", "Gross P&L", "Charges", "Net P&L", ""].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: C.textM, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.map(d => (
                <tr key={d.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "11px 14px", color: C.text, fontWeight: 600 }}>{d.name}</td>
                  <td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>{d.trades}</td>
                  <td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>{((d.wins/d.trades)*100).toFixed(0)}%</td>
                  <td style={{ padding: "11px 14px", color: C.textM, fontFamily: F_MONO }}>1:{d.trades > 0 ? (d.totalR/d.trades).toFixed(1) : "—"}</td>
                  <td style={{ padding: "11px 14px", fontFamily: F_MONO, color: d.pnl >= 0 ? C.green : C.red }}>{dAmt(d.pnl, "₹", hideCapital)}</td>
                  <td style={{ padding: "11px 14px", fontFamily: F_MONO, color: C.red }}>−₹{d.charges.toFixed(0)}</td>
                  <td style={{ padding: "11px 14px", fontFamily: F_MONO, fontWeight: 700, color: d.netPnl >= 0 ? C.green : C.red }}>{dAmt(d.netPnl, "₹", hideCapital)}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button onClick={() => {
                      const tradesToShow = (showReport ? reportTrades : closed).filter(t => (view === "market" ? (t.stockName || t.market) : view === "platform" ? (t.platform === "AB" ? "Aditya Birla" : "Exness") : view === "setup" ? (t.setupTag || "Unknown") : (t.exitDate || t.date || "").slice(0,7)) === d.name);
                      if (tradesToShow.length === 1) setShowChargesFor(tradesToShow[0].id);
                    }} style={{ fontSize: 10, color: C.accent, background: "transparent", border: `1px solid ${C.accent}40`, borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Rules({ metrics, settings }) {
  const dLimit = settings?.dailyDDLimit || 3;
  const wLimit = settings?.weeklyDDLimit || 6;
  const mLimit = settings?.monthlyDDLimit || 10;
  const checks = [
    { label: "Risk per trade ≤ 2.5%", ok: !metrics.breaches.find(b => b.msg.includes("2.5%")), val: `${metrics.totalRiskPct.toFixed(2)}% open` },
    { label: "Losses today < 3", ok: metrics.todayLosses < 3, val: `${metrics.todayLosses} today` },
    { label: `Daily DD > -${dLimit}%`, ok: metrics.dayDD > -dLimit, val: `${metrics.dayDD.toFixed(2)}%` },
    { label: `Weekly DD > -${wLimit}%`, ok: metrics.weekDD > -wLimit, val: `${metrics.weekDD.toFixed(2)}%` },
    { label: `Monthly DD > -${mLimit}%`, ok: metrics.monthDD > -mLimit, val: `${metrics.monthDD.toFixed(2)}%` },
    { label: "Active risk trades < 5", ok: metrics.openWithRiskCount < 5, val: `${metrics.openWithRiskCount}/5` },
    { label: "Weekly HWM clear", ok: !metrics.weekLockdownActive, val: metrics.weekLockdownActive ? "LOCKED" : "clear" },
    { label: "Monthly HWM clear", ok: !metrics.monthLockdownActive, val: metrics.monthLockdownActive ? "LOCKED" : "clear" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <Label>Live Rule Status</Label>
        <div style={{ marginTop: 14 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: i < checks.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <Dot ok={c.ok} /><span style={{ fontSize: 12, color: c.ok ? C.text : C.red, flex: 1 }}>{c.label}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontFamily: F_MONO, color: c.ok ? C.textD : C.red }}>{c.val}</div>
                <div style={{ fontSize: 9, color: c.ok ? C.green : C.red, letterSpacing: 1, marginTop: 1 }}>{c.ok ? "OK" : "BREACH"}</div>
              </div>
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
    platform: "AB", entry: "", sl: "", target: "", riskPct: recommendedRisk, rr: 3,
    market: "MCX Gold Mini", direction: "Long",
    multiplier: CONTRACT_MULTIPLIERS["MCX Gold Mini"], marginPerLot: "",
    manualLots: "", stockName: "", customMarket: "",
    exnessCustomMult: 1,
  });
  const [mode, setMode] = useState("auto"); // "auto" = risk%→lots | "manual" = lots→risk%
  const [showPreTradePopup, setShowPreTradePopup] = useState(false);
  const [pendingTradeObj, setPendingTradeObj] = useState(null);

  const onMarketChange = (m) => {
    const exMult = EXNESS_MULTIPLIERS[m];
    const abMult = CONTRACT_MULTIPLIERS[m];
    const mult = m === "Stocks" ? 1
      : c.platform === "Exness" ? (exMult !== undefined ? exMult : 1) : (abMult !== undefined ? abMult : 1);
    setC({ ...c, market: m, multiplier: mult, stockName: "", customMarket: "" });
  };
  const onPlatformChange = (p) => {
    const m = p === "AB" ? MARKETS_INR[0] : MARKETS_USD[0];
    const mult = m === "Stocks" ? 1
      : p === "Exness" ? (EXNESS_MULTIPLIERS[m] !== undefined ? EXNESS_MULTIPLIERS[m] : 1)
      : (CONTRACT_MULTIPLIERS[m] !== undefined ? CONTRACT_MULTIPLIERS[m] : 1);
    setC({ ...c, platform: p, market: m, multiplier: mult, stockName: "", customMarket: "" });
  };

  const totalCapInr = settings.inrCapital + settings.usdCapital * settings.fxRate;
  const cur = c.platform === "AB" ? "₹" : "$";
  const riskAmtInr = (totalCapInr * c.riskPct) / 100;
  const riskAmt = c.platform === "AB" ? riskAmtInr : riskAmtInr / settings.fxRate;

  // Multiplier: AB uses CONTRACT_MULTIPLIERS, Exness uses EXNESS_MULTIPLIERS
  const isExness = c.platform === "Exness";
  const isForex = FOREX_PAIRS.includes(c.market);
  const isCustom = c.market === "Custom";
  const mult = isExness
    ? (isCustom ? (+c.exnessCustomMult || 1) : (EXNESS_MULTIPLIERS[c.market] || +c.multiplier || 1))
    : (+c.multiplier || 1);

  const diff = c.entry && c.sl ? Math.abs(+c.entry - +c.sl) : 0;

  // For forex: diff is in price units (e.g. 0.0050 for 50 pips)
  // Risk = diff × mult × lots. mult=100000, so 0.005 × 100000 = $500/lot ✓
  const wholeLotMarkets = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "Nifty 50", "BankNifty", "Stock Futures"];
  const needsWholeLot = wholeLotMarkets.includes(c.market);
  const roundLot = (n) => (n - Math.floor(n)) >= 0.75 ? Math.ceil(n) : Math.floor(n);

  // AUTO mode: risk% → calculate lots
  const rawQtyAuto = diff > 0 && mult > 0 ? (riskAmt / (diff * mult)) : 0;
  const qtyAuto = needsWholeLot ? roundLot(rawQtyAuto) : +rawQtyAuto.toFixed(2);

  // MANUAL mode: lots entered → calculate risk
  const qtyManual = +c.manualLots || 0;
  const qty = mode === "auto" ? qtyAuto : qtyManual;
  const actualRisk = qty * mult * diff;
  const actualRiskPct = totalCapInr > 0 ? (actualRisk * (isExness ? settings.fxRate : 1)) / totalCapInr * 100 : 0;

  const marginPerLot = +c.marginPerLot || 0;
  const posVal = marginPerLot > 0 ? qty * marginPerLot : qty * mult * (+c.entry || 0);
  const notionalVal = qty * mult * (+c.entry || 0);
  const effectiveLeverage = marginPerLot > 0 && qty > 0 ? (notionalVal / (qty * marginPerLot)).toFixed(1) : "—";

  // R:R: if target price entered → auto calculate RR. Else use preset rr.
  const targetPrice = c.target ? +c.target : 0;
  const targetDiffFromEntry = targetPrice && c.entry ? Math.abs(targetPrice - +c.entry) : 0;
  const rrFromTarget = diff > 0 && targetDiffFromEntry > 0 ? Math.floor(targetDiffFromEntry / diff) : 0;
  const effectiveRR = targetPrice ? rrFromTarget : c.rr;

  const calcTarget = targetPrice || (diff > 0 && c.entry ? (c.direction === "Long" ? +c.entry + diff * effectiveRR : +c.entry - diff * effectiveRR) : 0); // alias
  const target = calcTarget; // keep old refs working
  const oneRLevel = diff > 0 && c.entry ? (c.direction === "Long" ? +c.entry + diff : +c.entry - diff) : 0;
  const partialTarget = calcTarget ? (c.direction === "Long" ? +c.entry + (calcTarget - +c.entry) * 0.6 : +c.entry - (+c.entry - calcTarget) * 0.6) : 0;

  const showMultiplier = true; // show for both platforms

  // ── Open risk check ──
  const openTrades = trades.filter(t => t.status === "Open");
  const openRiskInr = openTrades.reduce((a, t) => {
    const m = calcMetrics(t);
    return a + (t.platform === "AB" ? m.riskAmt : m.riskAmt * (settings.fxRate || 100));
  }, 0);
  const openRiskPct = totalCapInr > 0 ? (openRiskInr / totalCapInr) * 100 : 0;
  const newTotalRiskPct = openRiskPct + actualRiskPct;
  const maxRiskPct = settings.maxRiskPct || 2.5;
  const openTradeCount = openTrades.length;

  // ── Today's performance ──
  const todayStr = today();
  const todayClosedTrades = trades.filter(t => t.status === "Closed" && (t.exitDate === todayStr || t.date === todayStr));
  const todayPnlInr = todayClosedTrades.reduce((a, t) => {
    const m = calcMetrics(t);
    return a + (t.platform === "AB" ? (m.pnl || 0) : (m.pnl || 0) * (settings.fxRate || 100));
  }, 0);
  const todayPnlPct = totalCapInr > 0 ? (todayPnlInr / totalCapInr) * 100 : 0;
  const dailyLimit = settings.dailyDDLimit || 3;
  const dailyHeadroom = totalCapInr * (dailyLimit / 100) + Math.min(0, todayPnlInr); // remaining before circuit
  const sameMarketOpen = openTrades.filter(t => t.market === c.market);
  const multLocked = ["MCX Gold Mini", "MCX Silver Mini", "MCX Crude Oil", "MCX Natural Gas", "MCX Copper", "MCX Aluminium", "Nifty 50", "BankNifty"].includes(c.market);
  const isStockFutCalc = c.market === "Stock Futures" || c.market === "Stocks";
  const isStocksCalc = c.market === "Stocks";
  const grid2 = isMobile ? "1fr" : "1fr 1fr";

  const saveAsPending = () => {
    if (!c.entry || !c.sl) { alert("Need entry and stop loss"); return; }
    if (qty <= 0) { alert("Quantity is 0 — check entry, SL, and risk settings"); return; }
    const tradeObj = {
      id: "trade_" + Date.now(), date: today(), market: c.market, platform: c.platform,
      direction: c.direction, entry: c.entry, stopLoss: c.sl,
      target: calcTarget > 0 ? calcTarget.toFixed(2) : "",
      qty: needsWholeLot ? qty.toString() : qty.toFixed(2),
      marginPerLot: c.marginPerLot || "",
      stockName: c.stockName || (isCustom ? c.customMarket : "") || "",
      riskPct: c.riskPct, status: "Pending", setupTag: SETUP_TAGS[0],
      multiplier: mult, conviction: 7,
      checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}),
      pnl: null, exitPrice: null, exitDate: null, mistakeTag: null, exitReason: null,
    };
    setPendingTradeObj(tradeObj);
    setShowPreTradePopup(true);
  };

  const saveAsPaper = () => {
    if (!c.entry || !c.sl) { alert("Need entry and stop loss"); return; }
    const tradeObj = {
      id: "trade_" + Date.now(), date: today(), market: c.market, platform: c.platform,
      direction: c.direction, entry: c.entry, stopLoss: c.sl,
      target: calcTarget > 0 ? calcTarget.toFixed(2) : "",
      qty: needsWholeLot ? qty.toString() : qty.toFixed(2),
      riskPct: c.riskPct, status: "Paper", setupTag: SETUP_TAGS[0],
      multiplier: mult, conviction: 7, marginPerLot: c.marginPerLot || "",
      stockName: c.stockName || (isCustom ? c.customMarket : "") || "",
      checklist: RULES_CHECKLIST.reduce((a, c) => ({ ...a, [c.key]: false }), {}),
      pnl: null, exitPrice: null, exitDate: null, mistakeTag: null, exitReason: null, isPaper: true,
    };
    setPendingTradeObj({ ...tradeObj, isPaper: true });
    setShowPreTradePopup(true);
  };

  const handlePreTradeConfirm = ({ preTrade, conviction, asPaper }) => {
    const finalTrade = { ...pendingTradeObj, preTrade, conviction, status: asPaper ? "Paper" : "Pending", isPaper: asPaper };
    saveTrades([finalTrade, ...trades]);
    setShowPreTradePopup(false);
    setPendingTradeObj(null);
    setPage("positions");
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {recommendedRisk < 1 && (
        <div style={{ background: C.amber + "15", border: `1px solid ${C.amber}40`, borderRadius: 6, padding: 12, marginBottom: 14, fontSize: 12, color: C.amber }}>
          ⚠ Drawdown active — recommended risk {recommendedRisk}%
        </div>
      )}

      {/* ── OPEN RISK + TODAY STRIP ── */}
      {(c.entry && c.sl) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={{ background: C.surface, border: `1px solid ${newTotalRiskPct > maxRiskPct ? C.red + "60" : C.border}`, borderRadius: 7, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 4 }}>OPEN RISK</div>
            <div style={{ fontSize: 15, fontFamily: F_MONO, fontWeight: 700, color: newTotalRiskPct > maxRiskPct ? C.red : newTotalRiskPct > maxRiskPct * 0.7 ? C.amber : C.green }}>
              {openRiskPct.toFixed(2)}% + <span style={{ color: actualRiskPct > 0 ? C.accent : C.textD }}>{actualRiskPct.toFixed(2)}%</span>
            </div>
            <div style={{ fontSize: 9, color: newTotalRiskPct > maxRiskPct ? C.red : C.textD, marginTop: 2 }}>
              {newTotalRiskPct > maxRiskPct ? `⚠ ${newTotalRiskPct.toFixed(2)}% — over ${maxRiskPct}% limit` : `= ${newTotalRiskPct.toFixed(2)}% total · limit ${maxRiskPct}%`}
            </div>
            {sameMarketOpen.length > 0 && <div style={{ fontSize: 9, color: C.amber, marginTop: 3 }}>⚠ {sameMarketOpen.length} {c.market.replace("MCX ","")} already open</div>}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${todayPnlPct < -(dailyLimit * 0.6) ? C.red + "60" : C.border}`, borderRadius: 7, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 4 }}>TODAY</div>
            <div style={{ fontSize: 15, fontFamily: F_MONO, fontWeight: 700, color: todayPnlInr > 0 ? C.green : todayPnlInr < 0 ? C.red : C.textD }}>
              {todayPnlInr === 0 ? "—" : dAmt(todayPnlInr, "₹", hideCapital)}
            </div>
            <div style={{ fontSize: 9, color: C.textD, marginTop: 2 }}>
              {todayPnlPct !== 0 ? `${todayPnlPct > 0 ? "+" : ""}${todayPnlPct.toFixed(2)}% · ` : ""}{dAmt(Math.max(0, dailyHeadroom), "₹", hideCapital)} left
            </div>
          </div>
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
          {isStockFutCalc && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Stock Name <span style={{ color: C.red, fontSize: 9 }}>required</span></Label>
              <Input value={c.stockName || ""} onChange={e => setC({ ...c, stockName: e.target.value })} placeholder="e.g. HDFC Bank, Reliance" />
            </div>
          )}
          <div><Label style={{ marginBottom: 6 }}>Direction</Label><Select value={c.direction} onChange={e => setC({ ...c, direction: e.target.value })} options={["Long", "Short"]} /></div>
          {isCustom && isExness && (
            <div>
              <Label style={{ marginBottom: 6 }}>Instrument Name</Label>
              <Input value={c.customMarket || ""} onChange={e => setC({ ...c, customMarket: e.target.value })} placeholder="e.g. XNGUSD, US30, DE40" />
            </div>
          )}
          {isCustom && isExness && (
            <div>
              <Label style={{ marginBottom: 6 }}>Contract Size (per lot)</Label>
              <Input type="number" value={c.exnessCustomMult || ""} onChange={e => setC({ ...c, exnessCustomMult: +e.target.value || 1 })} placeholder="e.g. 100 for indices" />
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Check Exness instrument specs for lot size</div>
            </div>
          )}
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
          <div>
            <Label style={{ marginBottom: 6 }}>Target Price <span style={{ color: C.textD, fontSize: 9 }}>optional — auto-calculates R:R</span></Label>
            <Input type="number" value={c.target || ""} onChange={e => setC({ ...c, target: e.target.value })} placeholder="Enter target to auto R:R" />
            {targetPrice > 0 && diff > 0 && <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontFamily: F_MONO }}>R:R = 1:{rrFromTarget} (from your target)</div>}
          </div>

          {/* MODE TOGGLE + MANUAL LOTS */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Label>{isStocksCalc ? "Shares" : "Lots"}</Label>
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
          {c.platform === "AB" && needsWholeLot && !isStocksCalc && (
            <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
              <Label style={{ marginBottom: 6 }}>Margin per Lot (₹) <span style={{ color: C.textD, fontSize: 9 }}>optional</span></Label>
              <Input type="number" value={c.marginPerLot || ""} onChange={e => setC({ ...c, marginPerLot: e.target.value })} placeholder="e.g. 55000 — ask your broker" />
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Real capital blocked per lot. Without this, position value shows notional (misleading for futures).</div>
            </div>
          )}

          {/* CONTRACT MULTIPLIER */}
          {showMultiplier && !isStocksCalc && (
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
                {c.market === "Stocks" && "Equity shares — multiplier is 1"}
              </div>
            </div>
          )}

          {/* TARGET R:R */}
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Label>Target R:R</Label>
              {targetPrice > 0 ? <span style={{ fontSize: 11, color: C.accent, fontFamily: F_MONO }}>Auto: 1:{rrFromTarget}</span> : <span style={{ fontSize: 10, color: C.textD }}>or enter target price above</span>}
            </div>
            <div style={{ display: "flex", gap: 3, opacity: targetPrice > 0 ? 0.4 : 1 }}>
              {[3, 4, 5, 7, 10, 15].map(r => (
                <button key={r} onClick={() => { if (!targetPrice) setC({ ...c, rr: r }); }} style={{ flex: 1, padding: "9px 0", background: effectiveRR === r ? C.accent : C.surface2, color: effectiveRR === r ? C.bg : C.textM, border: `1px solid ${effectiveRR === r ? C.accent : C.border}`, borderRadius: 4, fontSize: 11, fontFamily: F_MONO, cursor: targetPrice > 0 ? "default" : "pointer", fontWeight: 600 }}>1:{r}</button>
              ))}
            </div>
            {targetPrice > 0 && <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>Clear target price to use preset R:R</div>}
          </div>
        </div>
      </div>

      {/* ── RESULT CARDS ── */}
      {qty > 0 && diff > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
          {/* Row 1: Capital | Risk */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.surface, border: `1px solid ${marginPerLot > 0 ? C.amber + "50" : C.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>CAPITAL REQUIRED</div>
              <div style={{ fontSize: 22, fontFamily: F_MONO, fontWeight: 700, color: marginPerLot > 0 ? C.amber : C.textM }}>{dAmt(posVal, cur, hideCapital)}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>{marginPerLot > 0 ? `${effectiveLeverage}× leverage · ${qty} lots` : "enter margin/lot above"}</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${actualRiskPct > 2 ? C.red + "60" : C.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>RISK</div>
              <div style={{ fontSize: 22, fontFamily: F_MONO, fontWeight: 700, color: actualRiskPct > 2 ? C.red : actualRiskPct > 1 ? C.amber : C.green }}>{dAmt(actualRisk, cur, hideCapital)}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>{actualRiskPct.toFixed(3)}% · budget {dAmt(riskAmt, cur, hideCapital)}</div>
            </div>
          </div>

          {/* Row 2: R:R | Target Profit */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.surface, border: `1px solid ${effectiveRR >= 3 ? C.green + "30" : effectiveRR > 0 ? C.red + "30" : C.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>R:R</div>
              <div style={{ fontSize: 22, fontFamily: F_MONO, fontWeight: 700, color: effectiveRR >= 3 ? C.green : effectiveRR > 0 ? C.amber : C.textD }}>1:{effectiveRR || "—"}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>{targetPrice > 0 ? "from target" : "preset"} · 1R @ {oneRLevel > 0 ? oneRLevel.toFixed(2) : "—"}</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${target > 0 ? C.green + "30" : C.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: C.textD, letterSpacing: 1, marginBottom: 6 }}>TARGET PROFIT</div>
              <div style={{ fontSize: 22, fontFamily: F_MONO, fontWeight: 700, color: C.green }}>{target > 0 ? dAmt(actualRisk * effectiveRR, cur, hideCapital) : "—"}</div>
              <div style={{ fontSize: 10, color: C.textD, marginTop: 4 }}>
                {target > 0 ? `@ ${target.toFixed(2)}` : "enter target"}
                {partialTarget > 0 && ` · 60%: ${dAmt(actualRisk * effectiveRR * 0.6, cur, hideCapital)}`}
              </div>
            </div>
          </div>

          {/* Price strip: Entry | 1R | Partial */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div style={{ background: C.surface2, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: C.textD, marginBottom: 3 }}>ENTRY</div>
              <div style={{ fontSize: 14, fontFamily: F_MONO, fontWeight: 600 }}>{c.entry || "—"}</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: C.green, marginBottom: 3 }}>1R LEVEL</div>
              <div style={{ fontSize: 14, fontFamily: F_MONO, fontWeight: 600, color: C.green }}>{oneRLevel > 0 ? oneRLevel.toFixed(2) : "—"}</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: C.amber, marginBottom: 3 }}>PARTIAL 60%</div>
              <div style={{ fontSize: 14, fontFamily: F_MONO, fontWeight: 600, color: C.amber }}>{partialTarget > 0 ? partialTarget.toFixed(2) : "—"}</div>
            </div>
          </div>
        </div>
      )}

      {showPreTradePopup && pendingTradeObj && (
        <PreTradeChecklistPopup
          trade={pendingTradeObj}
          isPaper={pendingTradeObj.isPaper || false}
          onConfirm={handlePreTradeConfirm}
          onCancel={() => { setShowPreTradePopup(false); setPendingTradeObj(null); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn onClick={saveAsPaper} size="lg" style={{ flex: 1, color: C.textD, borderColor: C.border }} disabled={qty <= 0}>
          📋 Paper
        </Btn>
        <Btn variant="primary" onClick={saveAsPending} size="lg" style={{ flex: 3 }} disabled={qty <= 0}>
          {qty <= 0 && diff > 0 ? "Stop too small" : qty <= 0 ? "Fill entry + SL" : `Save ${needsWholeLot ? qty : qty.toFixed(2)} lots`}
        </Btn>
      </div>
    </div>
  );
}


// Memoized page components — only re-render when their own props change
const DashboardM = memo(Dashboard);
const PositionsM = memo(Positions);
const JournalM = memo(Journal);
const ReturnsM = memo(Returns);
const RulesM = memo(Rules);
const CalculatorM = memo(Calculator);
const HoldingsM = memo(Holdings);
const AddTradeM = memo(AddTrade);
