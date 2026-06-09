import { useState, useEffect, useCallback } from "react";

// ─── storage hook ─────────────────────────────────────────────────────────────
function useStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  const set = useCallback((v) => {
    setValue(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [value, set];
}

// ─── defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id:"alquiler",      name:"Alquiler",      icon:"🏠", color:"#6366f1" },
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
  { id:"efectivo", name:"Efectivo", color:"#10b981", closingDay: null },
  { id:"debito",   name:"Débito",   color:"#3b82f6", closingDay: null },
];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatARS(n) {
  return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
}
function today() { return new Date().toISOString().slice(0,10); }

// ─── Period helpers ───────────────────────────────────────────────────────────
// closingPeriodKey: "YYYY-MM" where MM is the month the period CLOSES
// e.g. closing day = 15: period "2025-06" = May 16 → Jun 15
function closingPeriodKey(date, closingDay) {
  const d = new Date(date + "T12:00:00");
  // If day > closingDay, this expense belongs to the NEXT period
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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,           setTab]           = useState("dashboard");
  const [viewMode,      setViewMode]      = useStorage("gst_viewmode", "mes"); // "mes" | "cierre"
  const [expenses,      setExpenses]      = useStorage("gst_expenses",  []);
  const [fixedExpenses, setFixedExpenses] = useStorage("gst_fixed",     []);
  const [cards,         setCards]         = useStorage("gst_cards",     DEFAULT_CARDS);
  const [categories]                      = useStorage("gst_categories", DEFAULT_CATEGORIES);
  const [settings,      setSettings]      = useStorage("gst_settings",  { budget:0, income:0 });
  const [modal,         setModal]         = useState(null);
  const [editing,       setEditing]       = useState(null);
  const [filterCat,     setFilterCat]     = useState("all");
  const [filterCard,    setFilterCard]    = useState("all");
  const [viewPeriod,    setViewPeriod]    = useState(monthKey(new Date()));
  // In cierre mode, which card's closing day to use
  const [cierreCardId,  setCierreCardId]  = useState(null);

  // apply fixed expenses once per calendar month
  useEffect(() => {
    const mk = monthKey(new Date());
    const already = expenses.some(e => e.fixedRef && monthKey(e.date) === mk);
    if (!already && fixedExpenses.length > 0) {
      setExpenses(prev => [...prev, ...fixedExpenses.map(f => ({
        ...f, id:genId(), date:today(), fixedRef:f.id, isFixed:true,
      }))]);
    }
  }, [fixedExpenses]);

  // init cierreCardId to first card with a closingDay
  useEffect(() => {
    if (!cierreCardId) {
      const first = cards.find(c => c.closingDay);
      if (first) setCierreCardId(first.id);
      else setCierreCardId(cards[0]?.id || null);
    }
  }, [cards]);

  // active card for cierre mode
  const cierreCard = cards.find(c => c.id === cierreCardId) || cards[0];
  const closingDay = cierreCard?.closingDay || null;

  // ── filtered expenses for current period ──
  const periodExpenses = expenses.filter(e => {
    if (viewMode === "mes") return monthKey(e.date) === viewPeriod;
    if (!closingDay) return monthKey(e.date) === viewPeriod;
    // cierre mode: only expenses for this card, in this closing period
    if (filterCard !== "all" && e.card !== filterCard && filterCard === cierreCardId) return false;
    return closingPeriodKey(e.date, closingDay) === viewPeriod;
  });

  const activeExpenses = periodExpenses
    .filter(e => filterCat  === "all" || e.category === filterCat)
    .filter(e => filterCard === "all" || e.card     === filterCard)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const totalPeriod = periodExpenses.reduce((s,e) => s + Number(e.amount), 0);
  const budgetPct   = settings.budget > 0 ? Math.min(100,(totalPeriod/settings.budget)*100) : 0;
  const remaining   = settings.income - totalPeriod;

  const catTotals = DEFAULT_CATEGORIES.map(c => ({
    ...c, total: periodExpenses.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount),0)
  })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  // ── period nav ──
  const isCurrentPeriod = viewPeriod === monthKey(new Date());
  function prev() { setViewPeriod(prevPeriodKey(viewPeriod)); }
  function next() { if (!isCurrentPeriod) setViewPeriod(nextPeriodKey(viewPeriod)); }

  const periodLabel = (() => {
    if (viewMode === "mes") {
      const [y,m] = viewPeriod.split("-").map(Number);
      return new Date(y,m-1,1).toLocaleDateString("es-AR",{month:"long",year:"numeric"});
    }
    if (closingDay) return closingPeriodLabel(viewPeriod, closingDay);
    const [y,m] = viewPeriod.split("-").map(Number);
    return new Date(y,m-1,1).toLocaleDateString("es-AR",{month:"long",year:"numeric"});
  })();

  // ── CRUD ──
  function saveExpense(data) {
    if (editing) setExpenses(prev => prev.map(e => e.id===editing.id ? {...e,...data} : e));
    else         setExpenses(prev => [...prev, {id:genId(),...data}]);
    setModal(null); setEditing(null);
  }
  function deleteExpense(id) { setExpenses(prev=>prev.filter(e=>e.id!==id)); }

  function saveFixed(data) {
    if (editing) setFixedExpenses(prev => prev.map(e => e.id===editing.id ? {...e,...data} : e));
    else         setFixedExpenses(prev => [...prev, {id:genId(),...data}]);
    setModal(null); setEditing(null);
  }
  function deleteFixed(id) { setFixedExpenses(prev=>prev.filter(e=>e.id!==id)); }

  function saveCard(data) {
    if (editing) setCards(prev => prev.map(c => c.id===editing.id ? {...c,...data} : c));
    else         setCards(prev => [...prev, {id:genId(),...data}]);
    setModal(null); setEditing(null);
  }
  function deleteCard(id) { setCards(prev=>prev.filter(c=>c.id!==id)); }

  function exportData() {
    const blob = new Blob([JSON.stringify({expenses,fixedExpenses,cards,settings},null,2)],{type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`gastos-backup-${today()}.json`; a.click();
  }
  function importData(e) {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{ try {
      const d=JSON.parse(ev.target.result);
      if(d.expenses)      setExpenses(d.expenses);
      if(d.fixedExpenses) setFixedExpenses(d.fixedExpenses);
      if(d.cards)         setCards(d.cards);
      if(d.settings)      setSettings(d.settings);
      alert("Datos importados correctamente");
    } catch { alert("Archivo no válido"); }};
    r.readAsText(file);
  }

  const getCat  = id => categories.find(c=>c.id===id) || categories.find(c=>c.id==="otros");
  const getCard = id => cards.find(c=>c.id===id);

  const cardsWithClosing = cards.filter(c => c.closingDay);
  const noClosingDaySet  = viewMode === "cierre" && !closingDay;

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#0f0f13;--surface:#1a1a24;--surface2:#22222f;--border:#2e2e3e;
          --accent:#6366f1;--accent2:#818cf8;
          --text:#f1f1f5;--muted:#8888a0;--danger:#ef4444;--success:#10b981;--warn:#f59e0b;
          --radius:14px;--radius-sm:8px;
        }
        body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;min-height:100vh}
        button{cursor:pointer;border:none;background:none;color:inherit;font:inherit}
        input,select,textarea{font:inherit;color:inherit;background:none;border:none;outline:none}
        .app{display:flex;flex-direction:column;min-height:100vh;max-width:480px;margin:0 auto}
        .topbar{position:sticky;top:0;z-index:10;background:var(--bg);padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
        .topbar-title{font-size:18px;font-weight:600;letter-spacing:-.3px}
        .topbar-actions{display:flex;gap:8px}
        .icon-btn{width:36px;height:36px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:16px;transition:background .15s}
        .icon-btn:hover{background:var(--surface2)}
        .content{flex:1;padding:20px;padding-bottom:100px;display:flex;flex-direction:column;gap:16px}
        .nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--surface);border-top:1px solid var(--border);display:flex;padding:8px 0 calc(8px + env(safe-area-inset-bottom))}
        .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;font-size:11px;color:var(--muted);transition:color .15s}
        .nav-item.active{color:var(--accent2)}
        .nav-icon{font-size:20px}
        .card{background:var(--surface);border-radius:var(--radius);padding:18px}
        .card-sm{background:var(--surface);border-radius:var(--radius-sm);padding:14px}
        /* period nav */
        .period-nav{display:flex;flex-direction:column;gap:8px;background:var(--surface);border-radius:var(--radius-sm);padding:12px 14px}
        .period-nav-row{display:flex;align-items:center;justify-content:space-between}
        .period-nav-label{font-weight:500;text-transform:capitalize;font-size:15px}
        .period-nav-sub{font-size:11px;color:var(--muted);text-transform:capitalize}
        .period-btn{width:30px;height:30px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:16px}
        .period-btn:hover{background:var(--border)}
        /* mode toggle */
        .mode-toggle{display:flex;background:var(--surface2);border-radius:99px;padding:3px;gap:2px}
        .mode-btn{flex:1;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:500;color:var(--muted);transition:all .2s;white-space:nowrap}
        .mode-btn.active{background:var(--accent);color:#fff}
        /* cierre card selector */
        .cierre-cards{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
        .cierre-cards::-webkit-scrollbar{display:none}
        .cierre-card-btn{padding:5px 12px;border-radius:99px;font-size:12px;font-weight:500;border:1px solid var(--border);white-space:nowrap;transition:all .2s;flex-shrink:0}
        .cierre-card-btn.active{color:#fff}
        /* stats */
        .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .stat{background:var(--surface);border-radius:var(--radius-sm);padding:14px}
        .stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
        .stat-val{font-size:20px;font-weight:700;letter-spacing:-.5px}
        .stat-val.danger{color:var(--danger)}
        .stat-val.success{color:var(--success)}
        .budget-bar-wrap{background:var(--surface);border-radius:var(--radius-sm);padding:14px}
        .budget-bar-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:8px}
        .budget-bar-track{height:8px;background:var(--border);border-radius:99px;overflow:hidden}
        .budget-bar-fill{height:100%;border-radius:99px;transition:width .4s ease}
        .cat-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}
        .cat-row:last-child{border-bottom:none}
        .cat-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
        .cat-bar{flex:1;height:4px;background:var(--border);border-radius:99px;overflow:hidden}
        .cat-bar-fill{height:100%;border-radius:99px}
        .expense-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
        .expense-item:last-child{border-bottom:none}
        .exp-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .exp-info{flex:1;min-width:0}
        .exp-name{font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .exp-meta{font-size:12px;color:var(--muted);margin-top:1px}
        .exp-amount{font-weight:600;font-size:15px;text-align:right;flex-shrink:0}
        .chip{display:inline-block;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:500}
        .filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
        .filters::-webkit-scrollbar{display:none}
        .filter-btn{white-space:nowrap;padding:6px 12px;border-radius:99px;font-size:12px;font-weight:500;background:var(--surface);border:1px solid var(--border);transition:all .15s;flex-shrink:0}
        .filter-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
        .fab{position:fixed;bottom:calc(72px + env(safe-area-inset-bottom));right:calc(50% - 240px + 20px);width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;box-shadow:0 4px 20px rgba(99,102,241,.4);transition:transform .15s;z-index:9}
        .fab:hover{transform:scale(1.05)}
        @media(max-width:480px){.fab{right:20px}}
        .section-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:flex;align-items:flex-end;justify-content:center}
        .sheet{background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:24px 20px calc(24px + env(safe-area-inset-bottom));max-height:90vh;overflow-y:auto}
        .sheet-title{font-size:17px;font-weight:600;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
        .field{margin-bottom:14px}
        .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px}
        .field input,.field select{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px 13px;font-size:15px;transition:border-color .15s}
        .field input:focus,.field select:focus{border-color:var(--accent)}
        .field select option{background:var(--surface)}
        .btn{width:100%;padding:13px;border-radius:var(--radius-sm);font-weight:600;font-size:15px;transition:all .15s}
        .btn-primary{background:var(--accent);color:#fff}
        .btn-primary:hover{background:var(--accent2)}
        .btn-danger{background:rgba(239,68,68,.15);color:var(--danger);margin-top:8px}
        .btn-danger:hover{background:rgba(239,68,68,.25)}
        .fixed-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
        .fixed-item:last-child{border-bottom:none}
        .empty{text-align:center;padding:40px 20px;color:var(--muted)}
        .empty-icon{font-size:40px;margin-bottom:12px}
        .warning-box{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:var(--radius-sm);padding:14px 16px;font-size:13px;line-height:1.6}
      `}</style>

      <div className="app">
        {/* topbar */}
        <div className="topbar">
          <span className="topbar-title">💸 Mis Gastos</span>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={()=>setModal("settings")}>⚙️</button>
            <button className="icon-btn" onClick={()=>setModal("backup")}>💾</button>
          </div>
        </div>

        <div className="content">

          {/* ── period nav (hidden on análisis) ── */}
          {tab !== "analisis" && (
            <div className="period-nav">
              {/* mode toggle + period arrows */}
              <div className="period-nav-row">
                <button className="period-btn" onClick={prev}>‹</button>
                <div style={{textAlign:"center"}}>
                  <div className="period-nav-label">{periodLabel}</div>
                  {viewMode === "cierre" && closingDay && (
                    <div className="period-nav-sub">cierre día {closingDay}</div>
                  )}
                </div>
                <button className="period-btn" onClick={next} style={{opacity:isCurrentPeriod?.3:1}}>›</button>
              </div>

              {/* Mes / Cierre toggle */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div className="mode-toggle" style={{flex:1}}>
                  <button className={`mode-btn ${viewMode==="mes"?"active":""}`}
                    onClick={()=>{ setViewMode("mes"); setViewPeriod(monthKey(new Date())); }}>
                    📅 Por mes
                  </button>
                  <button className={`mode-btn ${viewMode==="cierre"?"active":""}`}
                    onClick={()=>{ setViewMode("cierre"); setViewPeriod(monthKey(new Date())); }}>
                    💳 Por cierre
                  </button>
                </div>
              </div>

              {/* cierre: card selector */}
              {viewMode === "cierre" && (
                <div className="cierre-cards">
                  {cards.map(c => (
                    <button key={c.id}
                      className={`cierre-card-btn ${cierreCardId===c.id?"active":""}`}
                      style={cierreCardId===c.id ? {background:c.color, borderColor:c.color} : {}}
                      onClick={()=>{ setCierreCardId(c.id); setViewPeriod(monthKey(new Date())); }}>
                      {c.name} {c.closingDay ? `(día ${c.closingDay})` : "⚠️"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* warning if cierre mode but no closing day configured */}
          {tab !== "analisis" && noClosingDaySet && (
            <div className="warning-box">
              ⚠️ Esta tarjeta no tiene día de cierre configurado. Editala en <strong>Tarjetas</strong> para activar el modo cierre.
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <div className="stat-label">Gasté</div>
                  <div className={`stat-val ${settings.budget>0&&totalPeriod>settings.budget?"danger":""}`}>
                    {formatARS(totalPeriod)}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">{remaining>=0?"Me queda":"Me pasé"}</div>
                  <div className={`stat-val ${remaining>=0?"success":"danger"}`}>
                    {formatARS(Math.abs(remaining))}
                  </div>
                </div>
              </div>

              {settings.budget > 0 && (
                <div className="budget-bar-wrap">
                  <div className="budget-bar-labels">
                    <span>Presupuesto</span>
                    <span>{Math.round(budgetPct)}%</span>
                  </div>
                  <div className="budget-bar-track">
                    <div className="budget-bar-fill" style={{
                      width:`${budgetPct}%`,
                      background: budgetPct>90?"var(--danger)":budgetPct>70?"var(--warn)":"var(--accent)"
                    }}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",marginTop:6}}>
                    <span>{formatARS(totalPeriod)}</span><span>{formatARS(settings.budget)}</span>
                  </div>
                </div>
              )}

              {catTotals.length > 0 ? (
                <div className="card">
                  <div className="section-title" style={{marginBottom:12}}>Por categoría</div>
                  {catTotals.map(c => (
                    <div className="cat-row" key={c.id}>
                      <div className="cat-icon" style={{background:c.color+"22"}}>{c.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}>
                          <span>{c.name}</span>
                          <span style={{fontWeight:600}}>{formatARS(c.total)}</span>
                        </div>
                        <div className="cat-bar">
                          <div className="cat-bar-fill" style={{width:`${(c.total/totalPeriod*100).toFixed(0)}%`,background:c.color}}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <div className="empty-icon">📊</div>
                  <div>No hay gastos en este período</div>
                  <div style={{fontSize:13,marginTop:4}}>Agregá uno con el botón +</div>
                </div>
              )}
            </>
          )}

          {/* ── GASTOS ── */}
          {tab === "gastos" && (
            <>
              <div className="filters">
                <button className={`filter-btn ${filterCat==="all"?"active":""}`} onClick={()=>setFilterCat("all")}>Todos</button>
                {categories.filter(c=>periodExpenses.some(e=>e.category===c.id)).map(c=>(
                  <button key={c.id} className={`filter-btn ${filterCat===c.id?"active":""}`} onClick={()=>setFilterCat(c.id)}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
              <div className="filters">
                <button className={`filter-btn ${filterCard==="all"?"active":""}`} onClick={()=>setFilterCard("all")}>Todas</button>
                {cards.map(c=>(
                  <button key={c.id} className={`filter-btn ${filterCard===c.id?"active":""}`} onClick={()=>setFilterCard(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>

              {activeExpenses.length === 0 ? (
                <div className="empty"><div className="empty-icon">🧾</div><div>No hay gastos</div></div>
              ) : (
                <div className="card">
                  {activeExpenses.map(e => {
                    const cat  = getCat(e.category);
                    const card = getCard(e.card);
                    return (
                      <div key={e.id} className="expense-item" onClick={()=>{setEditing(e);setModal("expense")}}>
                        <div className="exp-icon" style={{background:(cat?.color||"#94a3b8")+"22"}}>{cat?.icon||"📦"}</div>
                        <div className="exp-info">
                          <div className="exp-name">{e.description||cat?.name}</div>
                          <div className="exp-meta">
                            {new Date(e.date+"T12:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"})}
                            {card && <span> · {card.name}</span>}
                            {e.isFixed && <span className="chip" style={{background:"var(--accent)22",color:"var(--accent2)",marginLeft:4}}>fijo</span>}
                          </div>
                        </div>
                        <div className="exp-amount">-{formatARS(e.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── FIJOS ── */}
          {tab === "fijos" && (
            <>
              <div className="card-sm" style={{fontSize:13,color:"var(--muted)",lineHeight:1.5}}>
                Los gastos fijos se cargan automáticamente al inicio de cada mes.
              </div>
              {fixedExpenses.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔁</div>
                  <div>No tenés gastos fijos</div>
                  <div style={{fontSize:13,marginTop:4}}>Agregá alquiler, suscripciones, gym...</div>
                </div>
              ) : (
                <div className="card">
                  {fixedExpenses.map(e => {
                    const cat = getCat(e.category);
                    return (
                      <div key={e.id} className="fixed-item" onClick={()=>{setEditing(e);setModal("fixed")}}>
                        <div className="exp-icon" style={{background:(cat?.color||"#94a3b8")+"22"}}>{cat?.icon||"📦"}</div>
                        <div className="exp-info">
                          <div className="exp-name">{e.description||cat?.name}</div>
                          <div className="exp-meta">{cat?.name}</div>
                        </div>
                        <div className="exp-amount">{formatARS(e.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="btn btn-primary" onClick={()=>{setEditing(null);setModal("fixed")}}>+ Agregar gasto fijo</button>
            </>
          )}

          {/* ── TARJETAS ── */}
          {tab === "tarjetas" && (
            <>
              {cards.map(c => {
                const cardTotal = periodExpenses.filter(e=>e.card===c.id).reduce((s,e)=>s+Number(e.amount),0);
                return (
                  <div key={c.id} className="card" style={{borderLeft:`3px solid ${c.color}`}}
                    onClick={()=>{setEditing(c);setModal("card")}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:16}}>{c.name}</div>
                        <div style={{fontSize:12,color:"var(--muted)",marginTop:2,display:"flex",gap:8,alignItems:"center"}}>
                          <span>{periodExpenses.filter(e=>e.card===c.id).length} gastos</span>
                          {c.closingDay
                            ? <span className="chip" style={{background:"var(--accent)22",color:"var(--accent2)"}}>cierra día {c.closingDay}</span>
                            : <span className="chip" style={{background:"var(--warn)22",color:"var(--warn)"}}>sin día de cierre</span>
                          }
                        </div>
                      </div>
                      <div style={{fontWeight:700,fontSize:18}}>{formatARS(cardTotal)}</div>
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-primary" onClick={()=>{setEditing(null);setModal("card")}}>+ Agregar tarjeta</button>
            </>
          )}

          {/* ── ANÁLISIS IA ── */}
          {tab === "analisis" && <AnalisisTab cards={cards} />}

        </div>

        {tab === "gastos" && (
          <button className="fab" onClick={()=>{setEditing(null);setModal("expense")}}>+</button>
        )}

        <nav className="nav">
          {[
            {id:"dashboard",icon:"📊",label:"Resumen"},
            {id:"gastos",   icon:"🧾",label:"Gastos"},
            {id:"fijos",    icon:"🔁",label:"Fijos"},
            {id:"tarjetas", icon:"💳",label:"Tarjetas"},
            {id:"analisis", icon:"🤖",label:"IA"},
          ].map(n=>(
            <button key={n.id} className={`nav-item ${tab===n.id?"active":""}`} onClick={()=>setTab(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── MODALS ── */}
      {modal==="expense" && (
        <ExpenseModal expense={editing} categories={categories} cards={cards}
          onSave={saveExpense}
          onDelete={editing?()=>{deleteExpense(editing.id);setModal(null);setEditing(null);}:null}
          onClose={()=>{setModal(null);setEditing(null)}} />
      )}
      {modal==="fixed" && (
        <FixedModal expense={editing} categories={categories} cards={cards}
          onSave={saveFixed}
          onDelete={editing?()=>{deleteFixed(editing.id);setModal(null);setEditing(null);}:null}
          onClose={()=>{setModal(null);setEditing(null)}} />
      )}
      {modal==="card" && (
        <CardModal card={editing}
          onSave={saveCard}
          onDelete={editing?()=>{deleteCard(editing.id);setModal(null);setEditing(null);}:null}
          onClose={()=>{setModal(null);setEditing(null)}} />
      )}
      {modal==="settings" && (
        <SettingsModal settings={settings} onSave={s=>{setSettings(s);setModal(null)}} onClose={()=>setModal(null)} />
      )}
      {modal==="backup" && (
        <BackupModal onExport={exportData} onImport={importData} onClose={()=>setModal(null)} />
      )}
    </>
  );
}

// ── ExpenseModal ──────────────────────────────────────────────────────────────
function ExpenseModal({expense,categories,cards,onSave,onDelete,onClose}) {
  const [form,setForm]=useState({
    description:expense?.description||"",amount:expense?.amount||"",
    category:expense?.category||categories[0]?.id||"",
    card:expense?.card||cards[0]?.id||"",date:expense?.date||today(),
  });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">{expense?"Editar gasto":"Nuevo gasto"}
          <button onClick={onClose} style={{fontSize:20,color:"var(--muted)"}}>✕</button></div>
        <div className="field"><label>Monto ($)</label>
          <input type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)} autoFocus/></div>
        <div className="field"><label>Descripción</label>
          <input type="text" placeholder="Ej: Almuerzo" value={form.description} onChange={e=>set("description",e.target.value)}/></div>
        <div className="field"><label>Categoría</label>
          <select value={form.category} onChange={e=>set("category",e.target.value)}>
            {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
        <div className="field"><label>Medio de pago</label>
          <select value={form.card} onChange={e=>set("card",e.target.value)}>
            {cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Fecha</label>
          <input type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
        <button className="btn btn-primary" onClick={()=>{if(form.amount)onSave(form)}}>
          {expense?"Guardar cambios":"Agregar gasto"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar gasto</button>}
      </div>
    </div>
  );
}

// ── FixedModal ────────────────────────────────────────────────────────────────
function FixedModal({expense,categories,cards,onSave,onDelete,onClose}) {
  const [form,setForm]=useState({
    description:expense?.description||"",amount:expense?.amount||"",
    category:expense?.category||categories[0]?.id||"",card:expense?.card||cards[0]?.id||"",
  });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">{expense?"Editar gasto fijo":"Nuevo gasto fijo"}
          <button onClick={onClose} style={{fontSize:20,color:"var(--muted)"}}>✕</button></div>
        <div className="field"><label>Monto ($)</label>
          <input type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)} autoFocus/></div>
        <div className="field"><label>Descripción</label>
          <input type="text" placeholder="Ej: Alquiler" value={form.description} onChange={e=>set("description",e.target.value)}/></div>
        <div className="field"><label>Categoría</label>
          <select value={form.category} onChange={e=>set("category",e.target.value)}>
            {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
        <div className="field"><label>Medio de pago</label>
          <select value={form.card} onChange={e=>set("card",e.target.value)}>
            {cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <button className="btn btn-primary" onClick={()=>{if(form.amount)onSave({...form,isFixed:true})}}>
          {expense?"Guardar cambios":"Agregar gasto fijo"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar</button>}
      </div>
    </div>
  );
}

// ── CardModal ─────────────────────────────────────────────────────────────────
function CardModal({card,onSave,onDelete,onClose}) {
  const COLORS=["#6366f1","#10b981","#3b82f6","#f59e0b","#ef4444","#ec4899","#8b5cf6","#14b8a6"];
  const [form,setForm]=useState({name:card?.name||"",color:card?.color||COLORS[0],closingDay:card?.closingDay||""});
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">{card?"Editar tarjeta":"Nueva tarjeta"}
          <button onClick={onClose} style={{fontSize:20,color:"var(--muted)"}}>✕</button></div>
        <div className="field"><label>Nombre</label>
          <input type="text" placeholder="Ej: Visa, Naranja, Débito" value={form.name}
            onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
        <div className="field">
          <label>Día de cierre</label>
          <input type="number" min="1" max="31" placeholder="Ej: 15 (dejá vacío si no aplica)"
            value={form.closingDay}
            onChange={e=>setForm(f=>({...f,closingDay:e.target.value?Number(e.target.value):null}))}/>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:5,lineHeight:1.5}}>
            Si tu tarjeta cierra el 15, los gastos del 16 en adelante van al próximo período.
          </div>
        </div>
        <div className="field"><label>Color</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
            {COLORS.map(c=>(
              <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                style={{width:28,height:28,borderRadius:"50%",background:c,border:form.color===c?"3px solid white":"3px solid transparent"}}/>
            ))}</div></div>
        <button className="btn btn-primary" onClick={()=>{if(form.name)onSave(form)}}>
          {card?"Guardar":"Agregar tarjeta"}</button>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>Eliminar tarjeta</button>}
      </div>
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────
function SettingsModal({settings,onSave,onClose}) {
  const [form,setForm]=useState({budget:settings.budget||"",income:settings.income||""});
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">Ajustes
          <button onClick={onClose} style={{fontSize:20,color:"var(--muted)"}}>✕</button></div>
        <div className="field"><label>Ingreso mensual ($)</label>
          <input type="number" placeholder="0" value={form.income} onChange={e=>setForm(f=>({...f,income:Number(e.target.value)}))} /></div>
        <div className="field"><label>Presupuesto mensual ($)</label>
          <input type="number" placeholder="0 = sin límite" value={form.budget} onChange={e=>setForm(f=>({...f,budget:Number(e.target.value)}))} /></div>
        <button className="btn btn-primary" onClick={()=>onSave(form)}>Guardar</button>
      </div>
    </div>
  );
}

// ── BackupModal ───────────────────────────────────────────────────────────────
function BackupModal({onExport,onImport,onClose}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">Backup de datos
          <button onClick={onClose} style={{fontSize:20,color:"var(--muted)"}}>✕</button></div>
        <p style={{fontSize:14,color:"var(--muted)",marginBottom:20,lineHeight:1.6}}>
          Exportá tus datos como JSON. Si necesitás restaurarlos, importá el archivo.
        </p>
        <button className="btn btn-primary" onClick={onExport} style={{marginBottom:10}}>⬇️ Exportar datos</button>
        <label className="btn" style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:13,display:"block",textAlign:"center",cursor:"pointer",fontWeight:600,fontSize:15}}>
          ⬆️ Importar datos
          <input type="file" accept=".json" style={{display:"none"}} onChange={onImport}/>
        </label>
      </div>
    </div>
  );
}

// ── AnalisisTab ───────────────────────────────────────────────────────────────
function AnalisisTab({cards}) {
  const [selectedCard,setSelectedCard]=useState(cards[0]?.id||"");
  const [closingDate,setClosingDate]=useState("");
  const [pdfFile,setPdfFile]=useState(null);
  const [pdfName,setPdfName]=useState("");
  const [analysis,setAnalysis]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  function handlePdf(e) {
    const f=e.target.files[0]; if(!f) return;
    setPdfFile(f); setPdfName(f.name); setAnalysis(null); setError("");
  }

  async function analyze() {
    if(!pdfFile){setError("Primero subí el PDF del resumen.");return;}
    setLoading(true); setError(""); setAnalysis(null);
    try {
      const cardName=cards.find(c=>c.id===selectedCard)?.name||"tarjeta de crédito";
      const base64=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res(r.result.split(",")[1]);
        r.onerror=()=>rej(new Error("No se pudo leer"));
        r.readAsDataURL(pdfFile);
      });
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1000,
          system:`Sos un asistente financiero personal que analiza resúmenes de tarjetas de crédito argentinas. Respondé SOLO con JSON válido sin texto extra ni backticks:
{"periodo":"string","total":number,"categorias":[{"nombre":"string","icono":"emoji","total":number,"porcentaje":number,"items":["desc monto"]}],"insights":["string"],"recomendaciones":["string"],"alertas":["string"]}
Agrupa gastos inteligentemente. Insights concretos. Recomendaciones accionables. Alertas solo si hay algo llamativo.`,
          messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},
            {type:"text",text:`Resumen de mi ${cardName}${closingDate?` cierre ${closingDate}`:""}.`}
          ]}]
        })
      });
      const data=await resp.json();
      const text=data.content?.map(b=>b.text||"").join("").trim();
      setAnalysis(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch(e) {
      setError("No se pudo analizar el PDF. Verificá que sea un resumen de tarjeta válido.");
    } finally { setLoading(false); }
  }

  const maxCat=analysis?Math.max(...analysis.categorias.map(c=>c.total)):1;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"var(--surface)",borderRadius:"var(--radius-sm)",padding:"12px 14px",fontSize:13,color:"var(--muted)",lineHeight:1.6}}>
        Subí el PDF del resumen y Claude analiza en qué gastás y dónde podés ahorrar.
      </div>
      <div className="card">
        <div className="field"><label>Tarjeta</label>
          <select value={selectedCard} onChange={e=>setSelectedCard(e.target.value)}
            style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"11px 13px",fontSize:15}}>
            {cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Fecha de cierre (opcional)</label>
          <input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)}
            style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"11px 13px",fontSize:15}}/></div>
        <div className="field"><label>PDF del resumen</label>
          <label style={{display:"flex",alignItems:"center",gap:12,background:"var(--surface2)",border:`1px dashed ${pdfFile?"var(--accent)":"var(--border)"}`,borderRadius:"var(--radius-sm)",padding:"14px 16px",cursor:"pointer"}}>
            <span style={{fontSize:24}}>{pdfFile?"📄":"⬆️"}</span>
            <div><div style={{fontWeight:500,fontSize:14}}>{pdfName||"Elegir archivo PDF"}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{pdfFile?"Toca para cambiar":"Resumen en PDF"}</div></div>
            <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handlePdf}/>
          </label></div>
        {error&&<div style={{background:"rgba(239,68,68,.1)",color:"var(--danger)",borderRadius:"var(--radius-sm)",padding:"10px 14px",fontSize:13,marginBottom:12}}>{error}</div>}
        <button className="btn btn-primary" onClick={analyze} disabled={loading||!pdfFile} style={{opacity:(!pdfFile||loading)?.5:1}}>
          {loading?"Analizando...":"🤖 Analizar resumen"}</button>
      </div>

      {loading&&(
        <div className="card" style={{display:"flex",flexDirection:"column",gap:12,alignItems:"center",padding:"32px 20px"}}>
          <div style={{fontSize:36}}>🤖</div>
          <div style={{fontWeight:500}}>Leyendo tu resumen...</div>
          <div style={{fontSize:13,color:"var(--muted)",textAlign:"center",lineHeight:1.6}}>
            Analizando todos tus gastos y buscando oportunidades de ahorro</div>
          <div style={{width:"100%",height:4,background:"var(--border)",borderRadius:99,overflow:"hidden",marginTop:8}}>
            <div style={{height:"100%",background:"var(--accent)",borderRadius:99,animation:"ldbar 1.5s ease-in-out infinite"}}/>
          </div>
          <style>{`@keyframes ldbar{0%{width:0%}50%{width:70%}100%{width:100%}}`}</style>
        </div>
      )}

      {analysis&&!loading&&(
        <>
          <div className="card" style={{borderLeft:"3px solid var(--accent)"}}>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>
              {analysis.periodo}</div>
            <div style={{fontSize:28,fontWeight:700,letterSpacing:"-1px"}}>
              {new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(analysis.total)}</div>
            <div style={{fontSize:13,color:"var(--muted)",marginTop:4}}>
              total · {analysis.categorias.length} categorías</div>
          </div>

          <div className="card">
            <div className="section-title" style={{marginBottom:14}}>Breakdown</div>
            {analysis.categorias.sort((a,b)=>b.total-a.total).map((cat,i)=>(
              <div key={i} style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>{cat.icono}</span>
                    <span style={{fontWeight:500,fontSize:14}}>{cat.nombre}</span>
                    <span style={{fontSize:11,padding:"2px 7px",background:"var(--surface2)",borderRadius:99,color:"var(--muted)"}}>{cat.porcentaje}%</span>
                  </div>
                  <span style={{fontWeight:600,fontSize:14}}>
                    {new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(cat.total)}</span>
                </div>
                <div style={{height:6,background:"var(--border)",borderRadius:99,overflow:"hidden",marginBottom:cat.items?.length?8:0}}>
                  <div style={{height:"100%",background:"var(--accent)",borderRadius:99,width:`${(cat.total/maxCat*100).toFixed(0)}%`}}/>
                </div>
                {cat.items?.slice(0,4).map((item,j)=>(
                  <div key={j} style={{fontSize:12,color:"var(--muted)",paddingLeft:28}}>· {item}</div>
                ))}
                {cat.items?.length>4&&<div style={{fontSize:12,color:"var(--muted)",paddingLeft:28}}>· y {cat.items.length-4} más...</div>}
              </div>
            ))}
          </div>

          {analysis.alertas?.length>0&&(
            <div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.25)",borderRadius:"var(--radius-sm)",padding:"14px 16px"}}>
              <div style={{fontWeight:600,fontSize:13,color:"var(--warn)",marginBottom:10}}>⚠️ Alertas</div>
              {analysis.alertas.map((a,i)=><div key={i} style={{fontSize:13,lineHeight:1.6,marginBottom:6}}>{a}</div>)}
            </div>
          )}

          {analysis.insights?.length>0&&(
            <div className="card">
              <div className="section-title" style={{marginBottom:12}}>📈 Lo que veo</div>
              {analysis.insights.map((ins,i)=>(
                <div key={i} style={{display:"flex",gap:10,marginBottom:12}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",marginTop:7,flexShrink:0}}/>
                  <div style={{fontSize:14,lineHeight:1.6}}>{ins}</div>
                </div>
              ))}
            </div>
          )}

          {analysis.recomendaciones?.length>0&&(
            <div className="card" style={{borderLeft:"3px solid var(--success)"}}>
              <div className="section-title" style={{marginBottom:12,color:"var(--success)"}}>💡 Dónde podés ahorrar</div>
              {analysis.recomendaciones.map((rec,i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<analysis.recomendaciones.length-1?"1px solid var(--border)":"none"}}>
                  <span style={{fontSize:18,flexShrink:0}}>✂️</span>
                  <div style={{fontSize:14,lineHeight:1.6}}>{rec}</div>
                </div>
              ))}
            </div>
          )}

          <button className="btn" style={{background:"var(--surface2)",border:"1px solid var(--border)"}}
            onClick={()=>{setAnalysis(null);setPdfFile(null);setPdfName("");}}>
            Analizar otro resumen</button>
        </>
      )}
    </div>
  );
}
