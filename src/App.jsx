import { useState, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function sb(table, method = "GET", body = null, params = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "resolution=merge-duplicates" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (method === "GET") return res.json();
  return res.ok;
}

const DEFAULT_CATEGORIES = [
  { id:"alquiler",      name:"Hogar",         icon:"🏡", color:"#6366f1" },
  { id:"expensas",      name:"Expensas",       icon:"🏢", color:"#8b5cf6" },
  { id:"supermercado",  name:"Supermercado",   icon:"🛒", color:"#10b981" },
  { id:"transporte",    name:"Transporte",     icon:"🚌", color:"#3b82f6" },
  { id:"salidas",       name:"Salidas",        icon:"🍕", color:"#f59e0b" },
  { id:"gym",           name:"Gym",            icon:"💪", color:"#ef4444" },
  { id:"suscripciones", name:"Suscripciones",  icon:"📱", color:"#ec4899" },
  { id:"farmacia",      name:"Farmacia",       icon:"💊", color:"#14b8a6" },
  { id:"indumentaria",  name:"Indumentaria",   icon:"👕", color:"#f97316" },
  { id:"otros",         name:"Otros",          icon:"📦", color:"#94a3b8" },
];

const DEFAULT_CARDS = [
  { id:"efectivo", name:"Efectivo", color:"#10b981", closing_day: null },
  { id:"debito",   name:"Débito",   color:"#3b82f6", closing_day: null },
  { id:"credito",  name:"Crédito",  color:"#f59e0b", closing_day: null },
];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatARS(n) {
  return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
}
function today() { return new Date().toISOString().slice(0,10); }

function closingPeriodKey(date, closingDay) {
  const d = new Date(date + "T12:00:00");
  if (d.getDate() > closingDay) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function closingPeriodLabel(periodKey, closingDay) {
  const [y, m] = periodKey.split("-").map(Number);
  const closeDate = new Date(y, m - 1, closingDay);
  const openDate  = new Date(y, m - 2, closingDay + 1);
  const fmt = d => d.toLocaleDateString("es-AR", { day:"numeric", month:"short" });
  return `${fmt(openDate)} – ${fmt(closeDate)}`;
}
function prevPeriodKey(key) {
  const [y,m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function nextPeriodKey(key) {
  const [y,m] = key.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function groupByDate(expenses) {
  const groups = {};
  expenses.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
  return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a));
}
function dateLabel(dateStr) {
  const now = today();
  const yest = new Date(); yest.setDate(yest.getDate()-1);
  const yestStr = yest.toISOString().slice(0,10);
  if (dateStr === now) return "Hoy";
  if (dateStr === yestStr) return "Ayer";
  return new Date(dateStr+"T12:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
}

const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  *{-webkit-tap-highlight-color:transparent}
  :root{
    --bg:#080c14;
    --card:#0f1524;
    --card2:#162032;
    --border:rgba(59,130,246,.16);
    --accent:#3b82f6;
    --accent2:#93c5fd;
    --grad:linear-gradient(135deg,#3b82f6,#6366f1);
    --grad-soft:linear-gradient(135deg,rgba(59,130,246,.12),rgba(99,102,241,.12));
    --text:#eef2ff;
    --muted:#6b7aa0;
    --danger:#f43f5e;
    --success:#34d399;
    --warn:#fbbf24;
    --r:20px;--r-sm:14px;--r-xs:9px;
  }
  html,body{height:100dvh;overflow:hidden;overscroll-behavior:none}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;font-size:15px;line-height:1.5}
  button{cursor:pointer;border:none;background:none;color:inherit;font:inherit}
  input,select,textarea{font:inherit;color:inherit;background:none;border:none;outline:none}

  .app{display:flex;flex-direction:column;height:100dvh;max-width:480px;margin:0 auto}

  /* Topbar */
  .topbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px}
  .topbar-brand{display:flex;align-items:center;gap:10px}
  .topbar-logo{width:32px;height:32px;border-radius:10px;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
  .topbar-name{font-size:18px;font-weight:700;letter-spacing:-.4px}
  .sync-dot{width:6px;height:6px;border-radius:50%;background:var(--success);display:inline-block;margin-left:6px;vertical-align:middle}
  .sync-dot.syncing{background:var(--warn);animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
  .icon-btn{width:38px;height:38px;border-radius:50%;background:var(--card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:17px}
  .icon-btn:active{opacity:.6}

  /* Content */
  .content{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 16px 20px}

  /* Nav */
  .nav-wrap{flex-shrink:0;padding:8px 16px calc(env(safe-area-inset-bottom,0px) + 8px)}
  .nav{background:var(--card);border:1px solid var(--border);border-radius:22px;display:flex;overflow:hidden}
  .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.2px;transition:color .15s;border-radius:18px;margin:4px 3px}
  .nav-item.active{color:var(--accent2);background:rgba(59,130,246,.14)}
  .nav-icon{font-size:19px;line-height:1}
  .nav-item:active{opacity:.6}

  /* Period nav */
  .period-wrap{margin-bottom:14px}
  .period-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
  .period-label{font-size:22px;font-weight:700;letter-spacing:-.6px;text-transform:capitalize}
  .period-sub{font-size:12px;color:var(--muted);margin-top:1px}
  .period-arrows{display:flex;gap:6px}
  .period-btn{width:34px;height:34px;border-radius:50%;background:var(--card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px}
  .period-btn:active{background:var(--card2)}
  .mode-row{display:flex;gap:8px;align-items:center}
  .mode-toggle{display:flex;background:var(--card);border:1px solid var(--border);border-radius:99px;padding:3px;gap:2px;flex:1}
  .mode-btn{flex:1;padding:6px 10px;border-radius:99px;font-size:12px;font-weight:600;color:var(--muted);transition:all .2s;white-space:nowrap;text-align:center}
  .mode-btn.active{background:var(--grad);color:#fff}
  .cierre-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-top:2px}
  .cierre-row::-webkit-scrollbar{display:none}
  .cierre-chip{padding:6px 14px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid var(--border);white-space:nowrap;transition:all .15s;flex-shrink:0;background:var(--card);color:var(--muted)}
  .cierre-chip:active{opacity:.6}

  /* Hero */
  .hero{background:var(--grad-soft);border:1px solid rgba(59,130,246,.25);border-radius:var(--r);padding:24px 20px 20px;margin-bottom:12px;position:relative;overflow:hidden}
  .hero::before{content:'';position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(99,102,241,.2),transparent 70%);pointer-events:none}
  .hero-label{font-size:12px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}
  .hero-amount{font-size:42px;font-weight:800;letter-spacing:-2px;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1}
  .hero-divider{height:1px;background:rgba(59,130,246,.2);margin:14px 0}
  .hero-stats{display:flex;gap:0}
  .hero-stat{flex:1;text-align:center}
  .hero-stat+.hero-stat{border-left:1px solid rgba(59,130,246,.2)}
  .hero-stat-label{font-size:11px;color:var(--muted);font-weight:500;margin-bottom:3px}
  .hero-stat-val{font-size:16px;font-weight:700;letter-spacing:-.4px}

  /* Budget */
  .budget-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:16px;margin-bottom:12px}
  .budget-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .budget-title{font-size:13px;font-weight:600;color:var(--muted)}
  .budget-pct{font-size:13px;font-weight:700;color:var(--accent2)}
  .budget-track{height:6px;background:var(--card2);border-radius:99px;overflow:hidden}
  .budget-fill{height:100%;border-radius:99px;transition:width .5s ease}
  .budget-foot{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:8px}

  /* Section */
  .section-head{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin:16px 0 8px}

  /* Category list */
  .cat-list{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-bottom:8px}
  .cat-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(59,130,246,.08)}
  .cat-row:last-child{border-bottom:none}
  .cat-icon-wrap{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
  .cat-info{flex:1;min-width:0}
  .cat-name-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-size:14px}
  .cat-name{font-weight:500}
  .cat-amount{font-weight:700}
  .cat-bar-track{height:3px;background:var(--card2);border-radius:99px;overflow:hidden}
  .cat-bar-fill{height:100%;border-radius:99px}

  /* Filters */
  .filters{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:10px}
  .filters::-webkit-scrollbar{display:none}
  .filter-btn{white-space:nowrap;padding:7px 14px;border-radius:99px;font-size:12px;font-weight:600;background:var(--card);border:1px solid var(--border);color:var(--muted);flex-shrink:0;transition:all .15s}
  .filter-btn.active{background:rgba(59,130,246,.2);border-color:var(--accent);color:var(--accent2)}
  .filter-btn:active{opacity:.6}

  /* Date header */
  .date-head{font-size:12px;font-weight:700;color:var(--muted);text-transform:capitalize;padding:14px 2px 6px;letter-spacing:.2px}

  /* Expense items */
  .exp-list{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-bottom:4px}
  .expense-item{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(59,130,246,.08);cursor:pointer}
  .expense-item:last-child{border-bottom:none}
  .expense-item:active{background:var(--card2)}
  .exp-icon{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .exp-info{flex:1;min-width:0}
  .exp-name{font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
  .exp-meta{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px}
  .exp-card-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}
  .exp-amount{font-weight:700;font-size:15px;letter-spacing:-.3px;flex-shrink:0}
  .chip-fixed{font-size:9px;padding:2px 6px;border-radius:99px;font-weight:700;background:rgba(59,130,246,.2);color:var(--accent2);letter-spacing:.3px}

  /* Fixed items */
  .fixed-list{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-bottom:12px}
  .fixed-item{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(59,130,246,.08);cursor:pointer}
  .fixed-item:last-child{border-bottom:none}
  .fixed-item:active{background:var(--card2)}

  /* Card items (tarjetas tab) */
  .pay-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:10px;cursor:pointer;position:relative;overflow:hidden}
  .pay-card:active{opacity:.8}
  .pay-card-glow{position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;opacity:.25;filter:blur(40px)}
  .pay-card-top{display:flex;justify-content:space-between;align-items:flex-start}
  .pay-card-name{font-size:18px;font-weight:700;letter-spacing:-.3px}
  .pay-card-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;letter-spacing:.3px}
  .pay-card-amount{font-size:28px;font-weight:800;letter-spacing:-1px;margin-top:12px}
  .pay-card-foot{display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--muted)}

  /* Info box */
  .info-box{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:13px 16px;font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:12px}
  .warn-box{background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:var(--r-sm);padding:12px 16px;font-size:13px;color:var(--warn);line-height:1.6;margin-bottom:12px}

  /* FAB */
  .fab{position:fixed;bottom:calc(90px + env(safe-area-inset-bottom,0px));right:calc(50% - 224px);width:56px;height:56px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;box-shadow:0 4px 28px rgba(59,130,246,.5);z-index:9;line-height:1}
  .fab:active{transform:scale(.9)}
  @media(max-width:480px){.fab{right:20px}}

  /* Empty */
  .empty{text-align:center;padding:56px 20px;color:var(--muted)}
  .empty-icon{font-size:48px;margin-bottom:14px;opacity:.6}
  .empty-title{font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px}
  .empty-sub{font-size:13px}

  /* Add button */
  .add-btn{width:100%;padding:15px;border-radius:var(--r-sm);font-weight:700;font-size:15px;background:var(--grad);color:#fff;letter-spacing:-.2px}
  .add-btn:active{opacity:.85}

  /* Modal */
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px)}
  .sheet{background:var(--card);border-radius:24px 24px 0 0;border-top:1px solid var(--border);width:100%;max-width:480px;padding:0 20px calc(24px + env(safe-area-inset-bottom,0px));max-height:92vh;overflow-y:auto}
  .sheet-handle{width:36px;height:4px;background:var(--border);border-radius:99px;margin:14px auto 20px}
  .sheet-title{font-size:19px;font-weight:700;letter-spacing:-.4px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
  .sheet-close{width:30px;height:30px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--muted)}
  .sheet-close:active{opacity:.6}
  .field{margin-bottom:16px}
  .field label{display:block;font-size:11px;color:var(--muted);margin-bottom:7px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
  .field input,.field select{width:100%;background:var(--card2);border:1px solid var(--border);border-radius:var(--r-sm);padding:13px 14px;font-size:15px;transition:border-color .15s;color:var(--text)}
  .field input:focus,.field select:focus{border-color:var(--accent)}
  .field select option{background:var(--card)}
  .amount-input{font-size:28px!important;font-weight:800!important;letter-spacing:-1px!important;padding:14px!important}
  .btn{width:100%;padding:15px;border-radius:var(--r-sm);font-weight:700;font-size:15px;transition:all .15s}
  .btn-primary{background:var(--grad);color:#fff}
  .btn-primary:active{opacity:.85}
  .btn-secondary{background:var(--card2);border:1px solid var(--border);color:var(--muted);margin-top:8px}
  .btn-secondary:active{opacity:.7}
  .btn-danger{background:rgba(244,63,94,.1);color:var(--danger);border:1px solid rgba(244,63,94,.2);margin-top:8px}
  .btn-danger:active{opacity:.7}

  /* Category picker */
  .cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .cat-pick-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:12px;transition:all .15s;cursor:pointer;border:2px solid transparent}
  .cat-pick-btn:active{opacity:.7}
  .cat-pick-icon{font-size:22px;line-height:1}
  .cat-pick-label{font-size:9px;font-weight:600;text-align:center;line-height:1.2;letter-spacing:.1px}

  /* Card chips */
  .card-chips{display:flex;gap:8px;flex-wrap:wrap}
  .card-chip-btn{padding:9px 18px;border-radius:99px;font-size:13px;font-weight:600;transition:all .15s;cursor:pointer;border:2px solid var(--border)}
  .card-chip-btn:active{opacity:.7}
`;

export default function App() {
  const [tab,           setTab]           = useState("dashboard");
  const [viewMode,      setViewMode]      = useState("mes");
  const [viewPeriod,    setViewPeriod]    = useState(monthKey(new Date()));
  const [cierreCardId,  setCierreCardId]  = useState(null);
  const [filterCat,     setFilterCat]     = useState("all");
  const [filterCard,    setFilterCard]    = useState("all");
  const [modal,         setModal]         = useState(null);
  const [editing,       setEditing]       = useState(null);
  const [expenses,      setExpenses]      = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [cards,         setCards]         = useState(DEFAULT_CARDS);
  const [settings,      setSettings]      = useState({ budget:0, income:0 });
  const [loading,       setLoading]       = useState(true);
  const [syncing,       setSyncing]       = useState(false);

  const categories = DEFAULT_CATEGORIES;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [exp, fixed, cds, stg] = await Promise.all([
          sb("expenses", "GET", null, "?order=date.desc"),
          sb("fixed_expenses", "GET", null, "?order=created_at.asc"),
          sb("cards", "GET", null, "?order=created_at.asc"),
          sb("settings", "GET", null, "?id=eq.default"),
        ]);
        if (Array.isArray(exp))   setExpenses(exp.map(e => ({ ...e, isFixed: e.is_fixed, fixedRef: e.fixed_ref })));
        if (Array.isArray(fixed)) setFixedExpenses(fixed);
        if (Array.isArray(cds) && cds.length > 0) {
          const missing = DEFAULT_CARDS.filter(d => !cds.some(c => c.id === d.id));
          if (missing.length > 0) await sb("cards", "POST", missing.map(c => ({ ...c, closing_day: c.closing_day })));
          setCards([...cds, ...missing].map(c => ({ ...c, closingDay: c.closing_day })));
        } else {
          await sb("cards", "POST", DEFAULT_CARDS.map(c => ({ ...c, closing_day: c.closing_day })));
          setCards(DEFAULT_CARDS.map(c => ({ ...c, closingDay: c.closing_day })));
        }
        if (Array.isArray(stg) && stg.length > 0) setSettings(stg[0]);
        else await sb("settings", "POST", [{ id:"default", budget:0, income:0 }]);
      } catch(e) { console.error("Load error", e); }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (loading || fixedExpenses.length === 0) return;
    const mk = monthKey(new Date());
    const already = expenses.some(e => e.fixedRef && monthKey(e.date) === mk);
    if (!already) {
      const toAdd = fixedExpenses.map(f => ({
        id: genId(), description: f.description, amount: f.amount,
        category: f.category, card: f.card, date: today(),
        is_fixed: true, fixed_ref: f.id,
      }));
      Promise.all(toAdd.map(e => sb("expenses", "POST", [e]))).then(() => {
        setExpenses(prev => [...prev, ...toAdd.map(e => ({ ...e, isFixed: true, fixedRef: e.fixed_ref }))]);
      });
    }
  }, [loading, fixedExpenses]);

  useEffect(() => {
    if (!cierreCardId && cards.length > 0) {
      const first = cards.find(c => c.closingDay || c.closing_day);
      setCierreCardId(first?.id || cards[0]?.id);
    }
  }, [cards]);

  const cierreCard = cards.find(c => c.id === cierreCardId) || cards[0];
  const closingDay = cierreCard?.closingDay || cierreCard?.closing_day || null;
  const isCurrentPeriod = viewPeriod === monthKey(new Date());

  const periodExpenses = expenses.filter(e => {
    if (viewMode === "mes") return monthKey(e.date) === viewPeriod;
    if (!closingDay) return monthKey(e.date) === viewPeriod;
    return closingPeriodKey(e.date, closingDay) === viewPeriod;
  });

  const activeExpenses = periodExpenses
    .filter(e => filterCat  === "all" || e.category === filterCat)
    .filter(e => filterCard === "all" || e.card     === filterCard)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const totalPeriod = periodExpenses.reduce((s,e) => s + Number(e.amount), 0);
  const budgetPct   = settings.budget > 0 ? Math.min(100,(totalPeriod/settings.budget)*100) : 0;
  const remaining   = (settings.income || 0) - totalPeriod;

  const catTotals = DEFAULT_CATEGORIES.map(c => ({
    ...c, total: periodExpenses.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount),0)
  })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const periodLabel = (() => {
    if (viewMode === "mes") {
      const [y,m] = viewPeriod.split("-").map(Number);
      return new Date(y,m-1,1).toLocaleDateString("es-AR",{month:"long",year:"numeric"});
    }
    if (closingDay) return closingPeriodLabel(viewPeriod, closingDay);
    const [y,m] = viewPeriod.split("-").map(Number);
    return new Date(y,m-1,1).toLocaleDateString("es-AR",{month:"long",year:"numeric"});
  })();

  async function saveExpense(data) {
    setSyncing(true);
    const row = { id: editing?.id || genId(), description: data.description, amount: data.amount, category: data.category, card: data.card, date: data.date, is_fixed: false, fixed_ref: null };
    await sb("expenses", "POST", [row]);
    if (editing) setExpenses(prev => prev.map(e => e.id===row.id ? {...e,...row,isFixed:false} : e));
    else         setExpenses(prev => [...prev, {...row, isFixed:false}]);
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function deleteExpense(id) {
    setSyncing(true);
    await sb("expenses", "DELETE", null, `?id=eq.${id}`);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function saveFixed(data) {
    setSyncing(true);
    const row = { id: editing?.id || genId(), description: data.description, amount: data.amount, category: data.category, card: data.card, is_fixed: true };
    await sb("fixed_expenses", "POST", [row]);
    if (editing) setFixedExpenses(prev => prev.map(e => e.id===row.id ? {...e,...row} : e));
    else         setFixedExpenses(prev => [...prev, row]);
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function deleteFixed(id) {
    setSyncing(true);
    await sb("fixed_expenses", "DELETE", null, `?id=eq.${id}`);
    setFixedExpenses(prev => prev.filter(e => e.id !== id));
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function saveCard(data) {
    setSyncing(true);
    const row = { id: editing?.id || genId(), name: data.name, color: data.color, closing_day: data.closingDay || null };
    await sb("cards", "POST", [row]);
    const mapped = { ...row, closingDay: row.closing_day };
    if (editing) setCards(prev => prev.map(c => c.id===row.id ? mapped : c));
    else         setCards(prev => [...prev, mapped]);
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function deleteCard(id) {
    setSyncing(true);
    await sb("cards", "DELETE", null, `?id=eq.${id}`);
    setCards(prev => prev.filter(c => c.id !== id));
    setSyncing(false); setModal(null); setEditing(null);
  }
  async function saveSettings(data) {
    setSyncing(true);
    await sb("settings", "POST", [{ id:"default", budget: data.budget||0, income: data.income||0 }]);
    setSettings(data);
    setSyncing(false); setModal(null);
  }

  const getCat  = id => categories.find(c=>c.id===id) || categories.find(c=>c.id==="otros");
  const getCard = id => cards.find(c=>c.id===id);
  const noClosingDaySet = viewMode === "cierre" && !closingDay;

  if (loading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#080c14",color:"#eef2ff",gap:14}}>
      <div style={{width:52,height:52,borderRadius:16,background:"linear-gradient(135deg,#3b82f6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>💸</div>
      <div style={{fontWeight:700,fontSize:20,letterSpacing:"-.4px"}}>Mis Gastos</div>
      <div style={{fontSize:13,color:"#6b6b8e"}}>Cargando...</div>
    </div>
  );

  const NAV_ITEMS = [
    {id:"dashboard", icon:"◈",  label:"Resumen"},
    {id:"gastos",    icon:"≡",  label:"Gastos"},
    {id:"fijos",     icon:"↻",  label:"Fijos"},
    {id:"tarjetas",  icon:"▣",  label:"Tarjetas"},
    {id:"analisis",  icon:"✦",  label:"IA"},
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-brand">
            <div className="topbar-logo">💸</div>
            <span className="topbar-name">Mis Gastos</span>
            <span className={`sync-dot${syncing?" syncing":""}`} title={syncing?"Guardando...":"Sincronizado"}/>
          </div>
          <button className="icon-btn" onClick={()=>setModal("settings")}>⚙️</button>
        </div>

        {/* Main content */}
        <div className="content">

          {/* Period nav */}
          {tab !== "analisis" && (
            <div className="period-wrap">
              <div className="period-row">
                <div>
                  <div className="period-label">{periodLabel}</div>
                  {viewMode==="cierre"&&closingDay&&<div className="period-sub">cierra día {closingDay}</div>}
                </div>
                <div className="period-arrows">
                  <button className="period-btn" onClick={()=>setViewPeriod(prevPeriodKey(viewPeriod))}>‹</button>
                  <button className="period-btn" onClick={()=>{if(!isCurrentPeriod)setViewPeriod(nextPeriodKey(viewPeriod))}} style={{opacity:isCurrentPeriod?.3:1}}>›</button>
                </div>
              </div>
              <div className="mode-row">
                <div className="mode-toggle">
                  <button className={`mode-btn${viewMode==="mes"?" active":""}`} onClick={()=>{setViewMode("mes");setViewPeriod(monthKey(new Date()));}}>Por mes</button>
                  <button className={`mode-btn${viewMode==="cierre"?" active":""}`} onClick={()=>{setViewMode("cierre");setViewPeriod(monthKey(new Date()));}}>Por cierre</button>
                </div>
              </div>
              {viewMode==="cierre"&&(
                <div className="cierre-row" style={{marginTop:8}}>
                  {cards.map(c=>(
                    <button key={c.id} className="cierre-chip"
                      style={cierreCardId===c.id?{background:c.color,borderColor:c.color,color:"#fff"}:{}}
                      onClick={()=>{setCierreCardId(c.id);setViewPeriod(monthKey(new Date()));}}>
                      {c.name}{(c.closingDay||c.closing_day)?` · día ${c.closingDay||c.closing_day}`:" ⚠️"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {noClosingDaySet && <div className="warn-box">⚠️ Esta tarjeta no tiene día de cierre. Editala en Tarjetas.</div>}

          {/* ── DASHBOARD ── */}
          {tab==="dashboard" && (
            <>
              <div className="hero">
                <div className="hero-label">Gasté este período</div>
                <div className="hero-amount">{formatARS(totalPeriod)}</div>
                <div className="hero-divider"/>
                <div className="hero-stats">
                  <div className="hero-stat">
                    <div className="hero-stat-label">{remaining>=0?"Disponible":"Me pasé"}</div>
                    <div className="hero-stat-val" style={{color:remaining>=0?"var(--success)":"var(--danger)"}}>{formatARS(Math.abs(remaining))}</div>
                  </div>
                  {settings.income>0&&(
                    <div className="hero-stat">
                      <div className="hero-stat-label">Ingreso</div>
                      <div className="hero-stat-val">{formatARS(settings.income)}</div>
                    </div>
                  )}
                  <div className="hero-stat">
                    <div className="hero-stat-label">Movimientos</div>
                    <div className="hero-stat-val">{periodExpenses.length}</div>
                  </div>
                </div>
              </div>

              {settings.budget>0&&(
                <div className="budget-card">
                  <div className="budget-header">
                    <span className="budget-title">Presupuesto</span>
                    <span className="budget-pct" style={{color:budgetPct>90?"var(--danger)":budgetPct>70?"var(--warn)":"var(--accent2)"}}>{Math.round(budgetPct)}%</span>
                  </div>
                  <div className="budget-track">
                    <div className="budget-fill" style={{width:`${budgetPct}%`,background:budgetPct>90?"var(--danger)":budgetPct>70?"var(--warn)":"var(--grad)"}}/>
                  </div>
                  <div className="budget-foot">
                    <span>{formatARS(totalPeriod)} gastado</span>
                    <span>{formatARS(settings.budget)} total</span>
                  </div>
                </div>
              )}

              {catTotals.length>0 ? (
                <>
                  <div className="section-head">Por categoría</div>
                  <div className="cat-list">
                    {catTotals.map(c=>(
                      <div className="cat-row" key={c.id}>
                        <div className="cat-icon-wrap" style={{background:c.color+"1a"}}>{c.icon}</div>
                        <div className="cat-info">
                          <div className="cat-name-row">
                            <span className="cat-name">{c.name}</span>
                            <span className="cat-amount">{formatARS(c.total)}</span>
                          </div>
                          <div className="cat-bar-track">
                            <div className="cat-bar-fill" style={{width:`${(c.total/totalPeriod*100).toFixed(0)}%`,background:c.color}}/>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty">
                  <div className="empty-icon">📊</div>
                  <div className="empty-title">Sin gastos</div>
                  <div className="empty-sub">Tocá + para agregar tu primer gasto</div>
                </div>
              )}
            </>
          )}

          {/* ── GASTOS ── */}
          {tab==="gastos" && (
            <>
              <div className="filters">
                <button className={`filter-btn${filterCat==="all"?" active":""}`} onClick={()=>setFilterCat("all")}>Todos</button>
                {categories.filter(c=>periodExpenses.some(e=>e.category===c.id)).map(c=>(
                  <button key={c.id} className={`filter-btn${filterCat===c.id?" active":""}`} onClick={()=>setFilterCat(c.id)}>{c.icon} {c.name}</button>
                ))}
              </div>
              <div className="filters">
                <button className={`filter-btn${filterCard==="all"?" active":""}`} onClick={()=>setFilterCard("all")}>Todos</button>
                {cards.map(c=>(
                  <button key={c.id} className={`filter-btn${filterCard===c.id?" active":""}`} onClick={()=>setFilterCard(c.id)}>
                    <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:c.color,marginRight:4,verticalAlign:"middle"}}/>
                    {c.name}
                  </button>
                ))}
              </div>

              {activeExpenses.length===0 ? (
                <div className="empty">
                  <div className="empty-icon">🧾</div>
                  <div className="empty-title">Sin gastos</div>
                  <div className="empty-sub">No hay gastos en este período</div>
                </div>
              ) : (
                groupByDate(activeExpenses).map(([date, exps]) => (
                  <div key={date}>
                    <div className="date-head">{dateLabel(date)}</div>
                    <div className="exp-list">
                      {exps.map(e => {
                        const cat=getCat(e.category); const card=getCard(e.card);
                        return (
                          <div key={e.id} className="expense-item" onClick={()=>{setEditing(e);setModal("expense")}}>
                            <div className="exp-icon" style={{background:(cat?.color||"#94a3b8")+"1a"}}>{cat?.icon||"📦"}</div>
                            <div className="exp-info">
                              <div className="exp-name">{e.description||cat?.name}</div>
                              <div className="exp-meta">
                                {card&&<><span className="exp-card-dot" style={{background:card.color}}/>{card.name}</>}
                                {e.isFixed&&<span className="chip-fixed">FIJO</span>}
                              </div>
                            </div>
                            <div className="exp-amount" style={{color:cat?.color||"var(--text)"}}>−{formatARS(e.amount)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── FIJOS ── */}
          {tab==="fijos" && (
            <>
              <div className="info-box">Los gastos fijos se aplican automáticamente al inicio de cada mes.</div>
              {fixedExpenses.length===0 ? (
                <div className="empty">
                  <div className="empty-icon">🔁</div>
                  <div className="empty-title">Sin gastos fijos</div>
                  <div className="empty-sub">Agregá expensas, suscripciones, gym...</div>
                </div>
              ) : (
                <div className="fixed-list">
                  {fixedExpenses.map(e => {
                    const cat=getCat(e.category); const card=getCard(e.card);
                    return (
                      <div key={e.id} className="fixed-item" onClick={()=>{setEditing(e);setModal("fixed")}}>
                        <div className="exp-icon" style={{background:(cat?.color||"#94a3b8")+"1a"}}>{cat?.icon||"📦"}</div>
                        <div className="exp-info">
                          <div className="exp-name">{e.description||cat?.name}</div>
                          <div className="exp-meta">
                            {card&&<><span className="exp-card-dot" style={{background:card.color}}/>{card.name}</>}
                          </div>
                        </div>
                        <div className="exp-amount">{formatARS(e.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="add-btn" onClick={()=>{setEditing(null);setModal("fixed")}}>+ Agregar gasto fijo</button>
            </>
          )}

          {/* ── TARJETAS ── */}
          {tab==="tarjetas" && (
            <>
              {cards.map(c => {
                const cardTotal = periodExpenses.filter(e=>e.card===c.id).reduce((s,e)=>s+Number(e.amount),0);
                const count = periodExpenses.filter(e=>e.card===c.id).length;
                return (
                  <div key={c.id} className="pay-card" onClick={()=>{setEditing(c);setModal("card")}}>
                    <div className="pay-card-glow" style={{background:c.color}}/>
                    <div className="pay-card-top">
                      <div className="pay-card-name">{c.name}</div>
                      {(c.closingDay||c.closing_day)
                        ? <span className="pay-card-badge" style={{background:c.color+"22",color:c.color}}>Cierra día {c.closingDay||c.closing_day}</span>
                        : <span className="pay-card-badge" style={{background:"rgba(251,191,36,.12)",color:"var(--warn)"}}>Sin cierre</span>}
                    </div>
                    <div className="pay-card-amount" style={{background:`linear-gradient(135deg,${c.color},${c.color}99)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>{formatARS(cardTotal)}</div>
                    <div className="pay-card-foot">
                      <span>{count} {count===1?"gasto":"gastos"} este período</span>
                    </div>
                  </div>
                );
              })}
              <button className="add-btn" onClick={()=>{setEditing(null);setModal("card")}}>+ Agregar tarjeta</button>
            </>
          )}

          {tab==="analisis" && <AnalisisTab cards={cards}/>}
        </div>

        {/* FAB */}
        {(tab==="gastos"||tab==="dashboard")&&(
          <button className="fab" onClick={()=>{setEditing(null);setModal("expense")}}>+</button>
        )}

        {/* Nav */}
        <div className="nav-wrap">
          <nav className="nav">
            {NAV_ITEMS.map(n=>(
              <button key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {modal==="expense"&&<ExpenseModal expense={editing} categories={categories} cards={cards} onSave={saveExpense} onDelete={editing?()=>deleteExpense(editing.id):null} onClose={()=>{setModal(null);setEditing(null)}}/>}
      {modal==="fixed"&&<FixedModal expense={editing} categories={categories} cards={cards} onSave={saveFixed} onDelete={editing?()=>deleteFixed(editing.id):null} onClose={()=>{setModal(null);setEditing(null)}}/>}
      {modal==="card"&&<CardModal card={editing} onSave={saveCard} onDelete={editing?()=>deleteCard(editing.id):null} onClose={()=>{setModal(null);setEditing(null)}}/>}
      {modal==="settings"&&<SettingsModal settings={settings} onSave={saveSettings} onClose={()=>setModal(null)}/>}
    </>
  );
}

function ExpenseModal({expense,categories,cards,onSave,onDelete,onClose}) {
  const [form,setForm]=useState({description:expense?.description||"",amount:expense?.amount?String(expense.amount):"",category:expense?.category||categories[0]?.id||"",card:expense?.card||cards[0]?.id||"",date:expense?.date||today()});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleAmount=v=>{set("amount",v.replace(/[^\d]/g,""));};
  const displayAmount=form.amount?new Intl.NumberFormat("es-AR").format(Number(form.amount)):"";
  return(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          {expense?"Editar gasto":"Nuevo gasto"}
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="field"><label>Monto</label><input className="amount-input" type="text" inputMode="decimal" placeholder="$ 0" value={displayAmount?`$ ${displayAmount}`:""} onChange={e=>handleAmount(e.target.value.replace(/\$/g,"").trim())}/></div>
        <div className="field"><label>Descripción</label><input type="text" placeholder="Ej: Almuerzo, nafta..." value={form.description} onChange={e=>set("description",e.target.value)}/></div>
        <div className="field"><label>Categoría</label><CategoryPicker categories={categories} value={form.category} onChange={v=>set("category",v)}/></div>
        <div className="field"><label>Medio de pago</label><CardChips cards={cards} value={form.card} onChange={v=>set("card",v)}/></div>
        <div className="field"><label>Fecha</label><input type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
        <button className="btn btn-primary" onClick={()=>{if(form.amount)onSave({...form,amount:Number(form.amount)})}}>{expense?"Guardar cambios":"Agregar gasto"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar gasto</button>}
      </div>
    </div>
  );
}

function FixedModal({expense,categories,cards,onSave,onDelete,onClose}) {
  const [form,setForm]=useState({description:expense?.description||"",amount:expense?.amount?String(expense.amount):"",category:expense?.category||categories[0]?.id||"",card:expense?.card||cards[0]?.id||""});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleAmount=v=>{set("amount",v.replace(/[^\d]/g,""));};
  const displayAmount=form.amount?new Intl.NumberFormat("es-AR").format(Number(form.amount)):"";
  return(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          {expense?"Editar gasto fijo":"Nuevo gasto fijo"}
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="field"><label>Monto</label><input className="amount-input" type="text" inputMode="decimal" placeholder="$ 0" value={displayAmount?`$ ${displayAmount}`:""} onChange={e=>handleAmount(e.target.value.replace(/\$/g,"").trim())}/></div>
        <div className="field"><label>Descripción</label><input type="text" placeholder="Ej: Expensas, Netflix..." value={form.description} onChange={e=>set("description",e.target.value)}/></div>
        <div className="field"><label>Categoría</label><CategoryPicker categories={categories} value={form.category} onChange={v=>set("category",v)}/></div>
        <div className="field"><label>Medio de pago</label><CardChips cards={cards} value={form.card} onChange={v=>set("card",v)}/></div>
        <button className="btn btn-primary" onClick={()=>{if(form.amount)onSave({...form,amount:Number(form.amount),isFixed:true})}}>{expense?"Guardar cambios":"Agregar gasto fijo"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar</button>}
      </div>
    </div>
  );
}

function CategoryPicker({categories,value,onChange}) {
  return(
    <div className="cat-grid">
      {categories.map(c=>(
        <button key={c.id} className="cat-pick-btn" onClick={()=>onChange(c.id)}
          style={{background:value===c.id?c.color+"22":"var(--card2)",borderColor:value===c.id?c.color:"transparent"}}>
          <span className="cat-pick-icon">{c.icon}</span>
          <span className="cat-pick-label" style={{color:value===c.id?c.color:"var(--muted)",fontWeight:value===c.id?700:500}}>{c.name}</span>
        </button>
      ))}
    </div>
  );
}

function CardChips({cards,value,onChange}) {
  return(
    <div className="card-chips">
      {cards.map(c=>(
        <button key={c.id} className="card-chip-btn" onClick={()=>onChange(c.id)}
          style={{background:value===c.id?c.color:"var(--card2)",borderColor:value===c.id?c.color:"var(--border)",color:value===c.id?"#fff":"var(--muted)"}}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

function CardModal({card,onSave,onDelete,onClose}) {
  const COLORS=["#3b82f6","#10b981","#3b82f6","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6","#f97316","#6366f1"];
  const [form,setForm]=useState({name:card?.name||"",color:card?.color||COLORS[0],closingDay:card?.closingDay||card?.closing_day||""});
  return(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          {card?"Editar tarjeta":"Nueva tarjeta"}
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="field"><label>Nombre</label><input type="text" placeholder="Ej: Visa, Naranja, Débito" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div className="field">
          <label>Día de cierre</label>
          <input type="number" min="1" max="31" placeholder="Ej: 15 (dejá vacío si no aplica)" value={form.closingDay} onChange={e=>setForm(f=>({...f,closingDay:e.target.value?Number(e.target.value):null}))}/>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>Los gastos posteriores al cierre van al próximo período.</div>
        </div>
        <div className="field"><label>Color</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
            {COLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{width:30,height:30,borderRadius:"50%",background:c,border:form.color===c?"3px solid white":"3px solid transparent",transition:"border .15s"}}/>)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>{if(form.name)onSave(form)}}>{card?"Guardar":"Agregar tarjeta"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar tarjeta</button>}
      </div>
    </div>
  );
}

function SettingsModal({settings,onSave,onClose}) {
  const [form,setForm]=useState({budget:settings.budget||"",income:settings.income||""});
  return(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle"/>
        <div className="sheet-title">
          Ajustes
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="field"><label>Ingreso mensual</label><input type="number" placeholder="$ 0" value={form.income} onChange={e=>setForm(f=>({...f,income:Number(e.target.value)}))}/></div>
        <div className="field"><label>Presupuesto mensual</label><input type="number" placeholder="$ 0 = sin límite" value={form.budget} onChange={e=>setForm(f=>({...f,budget:Number(e.target.value)}))}/></div>
        <button className="btn btn-primary" onClick={()=>onSave(form)}>Guardar</button>
      </div>
    </div>
  );
}

function AnalisisTab({cards}) {
  const [selectedCard,setSelectedCard]=useState(cards[0]?.id||"");
  const [closingDate,setClosingDate]=useState("");
  const [pdfFile,setPdfFile]=useState(null);
  const [pdfName,setPdfName]=useState("");
  const [analysis,setAnalysis]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function analyze() {
    if(!pdfFile){setError("Primero subí el PDF.");return;}
    setLoading(true);setError("");setAnalysis(null);
    try {
      const cardName=cards.find(c=>c.id===selectedCard)?.name||"tarjeta";
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(pdfFile);});
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          system:`Analizá resúmenes de tarjetas argentinas. Respondé SOLO JSON sin texto extra:
{"periodo":"string","total":number,"categorias":[{"nombre":"string","icono":"emoji","total":number,"porcentaje":number,"items":["string"]}],"insights":["string"],"recomendaciones":["string"],"alertas":["string"]}`,
          messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:`Resumen de mi ${cardName}${closingDate?` cierre ${closingDate}`:""}.`}]}]})});
      const data=await resp.json();
      const text=data.content?.map(b=>b.text||"").join("").trim();
      setAnalysis(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch(e){setError("No se pudo analizar el PDF.");}
    finally{setLoading(false);}
  }

  const maxCat=analysis?Math.max(...analysis.categorias.map(c=>c.total)):1;
  const S={card:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"16px"},muted:{fontSize:13,color:"var(--muted)",lineHeight:1.6}};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{...S.muted,...S.card}}>Subí el PDF del resumen y Claude analiza en qué gastás y dónde podés ahorrar.</div>
      <div style={S.card}>
        <div className="field"><label>Tarjeta</label>
          <select value={selectedCard} onChange={e=>setSelectedCard(e.target.value)} style={{width:"100%",background:"var(--card2)",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"12px 14px",fontSize:15,color:"var(--text)"}}>
            {cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Fecha de cierre (opcional)</label>
          <input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)} style={{width:"100%",background:"var(--card2)",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"12px 14px",fontSize:15,color:"var(--text)"}}/>
        </div>
        <div className="field"><label>PDF del resumen</label>
          <label style={{display:"flex",alignItems:"center",gap:12,background:"var(--card2)",border:`1px dashed ${pdfFile?"var(--accent)":"var(--border)"}`,borderRadius:"var(--r-sm)",padding:"14px 16px",cursor:"pointer"}}>
            <span style={{fontSize:24}}>{pdfFile?"📄":"⬆️"}</span>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{pdfName||"Elegir archivo PDF"}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{pdfFile?"Toca para cambiar":"Resumen en PDF"}</div>
            </div>
            <input type="file" accept="application/pdf" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setPdfFile(f);setPdfName(f.name);setAnalysis(null);setError("");}}}/>
          </label>
        </div>
        {error&&<div style={{background:"rgba(244,63,94,.1)",color:"var(--danger)",borderRadius:"var(--r-sm)",padding:"10px 14px",fontSize:13,marginBottom:12}}>{error}</div>}
        <button className="btn btn-primary" onClick={analyze} disabled={loading||!pdfFile} style={{opacity:(!pdfFile||loading)?.5:1}}>{loading?"Analizando...":"✦ Analizar resumen"}</button>
      </div>

      {loading&&(
        <div style={{...S.card,display:"flex",flexDirection:"column",gap:12,alignItems:"center",padding:"32px 20px"}}>
          <div style={{fontSize:36}}>✦</div>
          <div style={{fontWeight:600}}>Leyendo tu resumen...</div>
          <div style={{width:"100%",height:4,background:"var(--card2)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",background:"var(--grad)",borderRadius:99,animation:"ldbar 1.5s ease-in-out infinite"}}/>
          </div>
          <style>{`@keyframes ldbar{0%{width:0%}50%{width:70%}100%{width:100%}}`}</style>
        </div>
      )}

      {analysis&&!loading&&(
        <>
          <div style={{...S.card,borderLeft:"3px solid var(--accent)"}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:".6px",fontWeight:600}}>{analysis.periodo}</div>
            <div style={{fontSize:30,fontWeight:800,letterSpacing:"-1px",background:"var(--grad)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>{new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(analysis.total)}</div>
            <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>total · {analysis.categorias.length} categorías</div>
          </div>
          <div style={S.card}>
            <div className="section-head" style={{marginTop:0}}>Breakdown</div>
            {analysis.categorias.sort((a,b)=>b.total-a.total).map((cat,i)=>(
              <div key={i} style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>{cat.icono}</span>
                    <span style={{fontWeight:600,fontSize:14}}>{cat.nombre}</span>
                    <span style={{fontSize:11,padding:"2px 7px",background:"var(--card2)",borderRadius:99,color:"var(--muted)"}}>{cat.porcentaje}%</span>
                  </div>
                  <span style={{fontWeight:700,fontSize:14}}>{new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(cat.total)}</span>
                </div>
                <div style={{height:5,background:"var(--card2)",borderRadius:99,overflow:"hidden",marginBottom:cat.items?.length?8:0}}>
                  <div style={{height:"100%",background:"var(--grad)",borderRadius:99,width:`${(cat.total/maxCat*100).toFixed(0)}%`}}/>
                </div>
                {cat.items?.slice(0,4).map((item,j)=><div key={j} style={{fontSize:12,color:"var(--muted)",paddingLeft:28}}>· {item}</div>)}
              </div>
            ))}
          </div>
          {analysis.alertas?.length>0&&<div style={{background:"rgba(251,191,36,.07)",border:"1px solid rgba(251,191,36,.2)",borderRadius:"var(--r-sm)",padding:"14px 16px"}}><div style={{fontWeight:700,fontSize:13,color:"var(--warn)",marginBottom:10}}>⚠️ Alertas</div>{analysis.alertas.map((a,i)=><div key={i} style={{fontSize:13,lineHeight:1.6,marginBottom:6}}>{a}</div>)}</div>}
          {analysis.insights?.length>0&&<div style={S.card}><div className="section-head" style={{marginTop:0}}>Lo que veo</div>{analysis.insights.map((ins,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{width:5,height:5,borderRadius:"50%",background:"var(--accent)",marginTop:8,flexShrink:0}}/><div style={{fontSize:14,lineHeight:1.6}}>{ins}</div></div>)}</div>}
          {analysis.recomendaciones?.length>0&&<div style={{...S.card,borderLeft:"3px solid var(--success)"}}><div className="section-head" style={{marginTop:0,color:"var(--success)"}}>Dónde podés ahorrar</div>{analysis.recomendaciones.map((rec,i)=><div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<analysis.recomendaciones.length-1?"1px solid var(--border)":"none"}}><span style={{fontSize:18,flexShrink:0}}>✂️</span><div style={{fontSize:14,lineHeight:1.6}}>{rec}</div></div>)}</div>}
          <button className="btn btn-secondary" onClick={()=>{setAnalysis(null);setPdfFile(null);setPdfName("");}}>Analizar otro resumen</button>
        </>
      )}
    </div>
  );
}
