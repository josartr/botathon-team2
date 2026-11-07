import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  Download,
  Filter,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  calculatePlan,
  DEFAULT_PARAMETERS,
  MONTH_ORDER,
  parseStaffingCsv,
  validateStaffing,
} from "./data";
import type { Parameters, PlannedRow, ValidationItem } from "./types";

type View = "overview" | "professionals" | "quality";

const numberFormatter = new Intl.NumberFormat("es-CL");
const decimalFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 1,
});

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value));
}

function formatHours(value: number) {
  return `${decimalFormatter.format(value)} h`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function aggregateByInstitute(rows: PlannedRow[]) {
  const map = new Map<string, PlannedRow & { count: number }>();
  rows.forEach((row) => {
    const current = map.get(row.institute);
    if (!current) {
      map.set(row.institute, { ...row, count: 1 });
      return;
    }
    current.count += 1;
    current.weeklyHours += row.weeklyHours;
    current.contractedHours += row.contractedHours;
    current.directHours += row.directHours;
    current.indirectHours += row.indirectHours;
    current.nasHours += row.nasHours;
    current.directAttentions += row.directAttentions;
    current.indirectAttentions += row.indirectAttentions;
    current.totalAttentions += row.totalAttentions;
    current.managementTarget += row.managementTarget;
    current.foja += row.foja;
  });
  return [...map.values()]
    .map((row) => ({ ...row, foja: row.foja / row.count }))
    .sort((a, b) => b.totalAttentions - a.totalAttentions);
}

function aggregateByMonth(rows: PlannedRow[]) {
  return MONTH_ORDER.map((period) => {
    const monthRows = rows.filter((row) => row.period === period);
    return {
      period,
      month: monthRows[0]?.month ?? period,
      total: monthRows.reduce((sum, row) => sum + row.totalAttentions, 0),
      target: monthRows.reduce((sum, row) => sum + row.managementTarget, 0),
    };
  }).filter((row) => row.total > 0);
}

function App() {
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parameters, setParameters] = useState<Parameters>(DEFAULT_PARAMETERS);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [institute, setInstitute] = useState("Todos los institutos");
  const [area, setArea] = useState("Todas las áreas");
  const [month, setMonth] = useState("Todos los meses");
  const [uploadedName, setUploadedName] = useState("Reporte BUK base");

  useEffect(() => {
    fetch("/data/Nac-Base-contratos-x-mes.csv")
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el reporte base.");
        return response.text();
      })
      .then((csv) => {
        const staffing = parseStaffingCsv(csv);
        setRows(calculatePlan(staffing, DEFAULT_PARAMETERS));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const rawRows = useMemo(() => rows, [rows]);
  const institutes = useMemo(
    () => [...new Set(rawRows.map((row) => row.institute))].sort(),
    [rawRows],
  );
  const areas = useMemo(
    () => [...new Set(rawRows.map((row) => row.area))].sort(),
    [rawRows],
  );

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase().trim();
    return rawRows.filter((row) => {
      const matchesInstitute =
        institute === "Todos los institutos" || row.institute === institute;
      const matchesArea = area === "Todas las áreas" || row.area === area;
      const matchesMonth = month === "Todos los meses" || row.month === month;
      const matchesSearch =
        !query ||
        [row.personId, row.role, row.institute, row.area]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesInstitute && matchesArea && matchesMonth && matchesSearch;
    });
  }, [area, institute, month, rawRows, search]);

  const summary = useMemo(() => aggregateByInstitute(filteredRows), [filteredRows]);
  const monthly = useMemo(() => aggregateByMonth(filteredRows), [filteredRows]);
  const validations = useMemo(
    () => validateStaffing(rawRows),
    [rawRows],
  );
  const people = useMemo(() => {
    const byPerson = new Map<string, PlannedRow>();
    filteredRows.forEach((row) => {
      const current = byPerson.get(row.personId);
      if (!current) {
        byPerson.set(row.personId, { ...row });
        return;
      }
      current.contractedHours += row.contractedHours;
      current.directHours += row.directHours;
      current.indirectHours += row.indirectHours;
      current.nasHours += row.nasHours;
      current.directAttentions += row.directAttentions;
      current.indirectAttentions += row.indirectAttentions;
      current.totalAttentions += row.totalAttentions;
      current.managementTarget += row.managementTarget;
    });
    return [...byPerson.values()]
      .sort((a, b) => b.totalAttentions - a.totalAttentions)
      .slice(0, 100);
  }, [filteredRows]);

  const totals = useMemo(
    () => ({
      people: new Set(filteredRows.map((row) => row.personId)).size,
      contractedHours: filteredRows.reduce((sum, row) => sum + row.contractedHours, 0),
      directHours: filteredRows.reduce((sum, row) => sum + row.directHours, 0),
      totalAttentions: filteredRows.reduce((sum, row) => sum + row.totalAttentions, 0),
      target: filteredRows.reduce((sum, row) => sum + row.managementTarget, 0),
    }),
    [filteredRows],
  );

  const updateParameter = <K extends keyof Parameters>(key: K, value: Parameters[K]) => {
    const next = { ...parameters, [key]: value };
    setParameters(next);
    setRows((current) =>
      calculatePlan(
        current.map(({ contractedHours: _a, directHours: _b, indirectHours: _c, nasHours: _d, directAttentions: _e, indirectAttentions: _f, totalAttentions: _g, managementTarget: _h, foja: _i, ...row }) => row),
        next,
      ),
    );
  };

  const handleUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const staffing = parseStaffingCsv(String(reader.result));
        setRows(calculatePlan(staffing, parameters));
        setUploadedName(file.name);
      } catch {
        setError("El archivo seleccionado no tiene el formato esperado.");
      }
    };
    reader.readAsText(file);
  };

  const hasIssues = validations.some((item) => item.count > 0);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark"><Clock3 size={24} /></div>
        <strong>Preparando tu planificación</strong>
        <span>Cargando datos anonimizados y calculando indicadores...</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-screen"><ShieldCheck size={30} /><h1>No pudimos cargar el dashboard</h1><p>{error}</p></div>;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Clock3 size={20} /></div>
          <div><strong>Cada hora cuenta</strong><span>Planificación asistencial</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <div className="workspace-switcher"><div className="workspace-dot" /><div><span>Espacio de trabajo</span><strong>Planificación 2026</strong></div><ChevronDown size={16} /></div>
        <nav className="nav-list" aria-label="Navegación principal">
          <button className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => setView("overview")}><LayoutDashboard size={18} />Resumen ejecutivo</button>
          <button className={view === "professionals" ? "nav-item active" : "nav-item"} onClick={() => setView("professionals")}><Users size={18} />Profesionales</button>
          <button className={view === "quality" ? "nav-item active" : "nav-item"} onClick={() => setView("quality")}><ShieldCheck size={18} />Calidad del reporte{hasIssues && <span className="nav-badge">{validations.filter((item) => item.count > 0).length}</span>}</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="automation-card"><div className="automation-icon"><Activity size={17} /></div><div><strong>Blue Prism conectado</strong><span>Última sincronización hoy, 09:42</span></div><span className="online-dot" /></div>
          <button className="nav-item"><Settings2 size={18} />Configuración</button>
          <div className="user-card"><div className="avatar">PC</div><div><strong>Planificación central</strong><span>Equipo nacional</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Operaciones</span><span>/</span><strong>Planificación asistencial</strong></div>
          <div className="topbar-actions"><div className="sync-status"><span className="online-dot" />Datos actualizados</div><button className="icon-button" aria-label="Notificaciones"><Bell size={19} /><span className="notification-dot" /></button><div className="top-avatar">PC</div></div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div><div className="eyebrow"><span className="live-pill">● EN VIVO</span><span>Versión 2026.1</span></div><h1>Hola, equipo de planificación <span>👋</span></h1><p>Una vista clara para tomar decisiones sobre la capacidad asistencial de todo Chile.</p></div>
            <div className="heading-actions"><label className="upload-button"><Download size={16} />Cargar reporte BUK<input type="file" accept=".csv" onChange={(event) => handleUpload(event.target.files?.[0])} /></label><button className="primary-button" onClick={() => setView("overview")}><BarChart3 size={16} />Ver consolidado</button></div>
          </section>

          <section className="data-status"><div className="status-icon"><Database size={18} /></div><div className="status-copy"><strong>{uploadedName}</strong><span>3.123 registros mensuales · 462 profesionales · 15 institutos</span></div><div className="status-validation"><CheckCircle2 size={17} /><span>Reporte validado</span></div><span className="status-time">Hoy, 09:42</span></section>

          <section className="filter-bar">
            <div className="filter-label"><Filter size={16} /><strong>Filtros</strong><span>Vista actual</span></div>
            <div className="select-wrap"><select value={institute} onChange={(event) => setInstitute(event.target.value)}><option>Todos los institutos</option>{institutes.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div>
            <div className="select-wrap"><select value={area} onChange={(event) => setArea(event.target.value)}><option>Todas las áreas</option>{areas.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div>
            <div className="select-wrap"><select value={month} onChange={(event) => setMonth(event.target.value)}><option>Todos los meses</option>{[...new Set(rawRows.map((row) => row.month))].map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div>
            <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar profesional, cargo..." /></div>
            {(institute !== "Todos los institutos" || area !== "Todas las áreas" || month !== "Todos los meses" || search) && <button className="clear-filters" onClick={() => { setInstitute("Todos los institutos"); setArea("Todas las áreas"); setMonth("Todos los meses"); setSearch(""); }}>Limpiar</button>}
          </section>

          {view === "overview" && <Overview summary={summary} monthly={monthly} totals={totals} />}
          {view === "professionals" && <Professionals people={people} />}
          {view === "quality" && <Quality validations={validations} parameters={parameters} updateParameter={updateParameter} />}
        </div>
      </main>
    </div>
  );
}

function Overview({ summary, monthly, totals }: { summary: ReturnType<typeof aggregateByInstitute>; monthly: ReturnType<typeof aggregateByMonth>; totals: { people: number; contractedHours: number; directHours: number; totalAttentions: number; target: number } }) {
  const maxInstitute = Math.max(...summary.map((row) => row.totalAttentions), 1);
  return <div className="view-stack">
    <div className="metric-grid">
      <MetricCard icon={<Users size={19} />} label="Profesionales activos" value={formatNumber(totals.people)} detail="Con planificación vigente" tone="blue" />
      <MetricCard icon={<Clock3 size={19} />} label="Horas contratadas" value={formatHours(totals.contractedHours)} detail="Proyección seleccionada" tone="purple" />
      <MetricCard icon={<Activity size={19} />} label="Atenciones planificadas" value={formatNumber(totals.totalAttentions)} detail="Directas + indirectas" tone="orange" />
      <MetricCard icon={<ShieldCheck size={19} />} label="Meta de gestión" value={formatNumber(totals.target)} detail={`Cumplimiento al ${Math.round(totals.totalAttentions ? totals.target / totals.totalAttentions * 100 : 0)}%`} tone="green" />
    </div>
    <div className="content-grid">
      <section className="panel chart-panel"><PanelHeader title="Capacidad asistencial" subtitle="Atenciones planificadas por mes" action="2026" /><div className="chart-legend"><span><i className="legend-dot teal" />Planificadas</span><span><i className="legend-dot soft" />Meta de gestión</span></div><div className="bar-chart">{monthly.map((item) => { const height = Math.max((item.total / Math.max(...monthly.map((month) => month.total), 1)) * 100, 4); return <div className="bar-column" key={item.period}><div className="bar-value">{formatNumber(item.total)}</div><div className="bar-track"><div className="bar-fill" style={{ height: `${height}%` }} /><div className="bar-target" style={{ height: `${height * .9}%` }} /></div><span>{item.month.slice(0, 3)}</span></div>; })}</div><div className="chart-footer"><span><strong>{formatNumber(totals.directHours)}</strong> horas directas disponibles</span><span><strong>{totals.contractedHours ? formatPercent(totals.directHours / totals.contractedHours) : "0%"}</strong> FOJA promedio <ArrowUpRight size={14} /></span></div></section>
      <section className="panel"><PanelHeader title="Distribución por instituto" subtitle="Participación en la planificación" action="Ver todo" /><div className="institute-list">{summary.slice(0, 6).map((row) => <div className="institute-row" key={row.institute}><div className="institute-name"><span className="institute-avatar">{row.institute.slice(0, 2).toUpperCase()}</span><div><strong>{row.institute}</strong><span>{formatNumber(row.count)} registros</span></div></div><div className="progress-wrap"><div className="progress-track"><div className="progress-bar" style={{ width: `${row.totalAttentions / maxInstitute * 100}%` }} /></div><strong>{formatNumber(row.totalAttentions)}</strong></div></div>)}</div><button className="text-button" onClick={() => undefined}>Explorar todos los institutos <ArrowUpRight size={15} /></button></section>
    </div>
    <section className="panel"><PanelHeader title="Última actividad" subtitle="Cambios y eventos del flujo de planificación" action="Ver historial" /><div className="activity-list"><ActivityItem icon={<CheckCircle2 size={17} />} title="Reporte BUK procesado correctamente" detail="3.123 registros validados y disponibles para revisión" time="Hoy, 09:42" tone="success" /><ActivityItem icon={<SlidersHorizontal size={17} />} title="Parámetros de cálculo actualizados" detail="Meta de gestión configurada al 90%" time="Ayer, 16:20" tone="purple" /><ActivityItem icon={<ShieldCheck size={17} />} title="Versión 2026.1 aprobada" detail="Planificación nacional lista para distribución" time="06 nov, 11:15" tone="blue" /></div></section>
  </div>;
}

function MetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></div>;
}

function PanelHeader({ title, subtitle, action }: { title: string; subtitle: string; action: string }) {
  return <div className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="panel-action">{action}<ChevronDown size={14} /></button></div>;
}

function ActivityItem({ icon, title, detail, time, tone }: { icon: React.ReactNode; title: string; detail: string; time: string; tone: string }) {
  return <div className="activity-item"><div className={`activity-icon ${tone}`}>{icon}</div><div className="activity-copy"><strong>{title}</strong><span>{detail}</span></div><time>{time}</time></div>;
}

function Professionals({ people }: { people: PlannedRow[] }) {
  return <section className="panel table-panel"><PanelHeader title="Profesionales" subtitle="Detalle de planificación individual" action="Exportar CSV" /><div className="table-scroll"><table><thead><tr><th>Profesional</th><th>Instituto</th><th>Cargo</th><th>Horas contratadas</th><th>Atenciones directas</th><th>Total planificado</th><th>Meta</th><th>FOJA</th></tr></thead><tbody>{people.map((person) => <tr key={person.personId}><td><div className="person-cell"><span className="person-avatar">{person.personId.slice(-2)}</span><strong>{person.personId}</strong></div></td><td>{person.institute}</td><td><span className="role-pill">{person.role}</span></td><td>{formatHours(person.contractedHours)}</td><td>{formatNumber(person.directAttentions)}</td><td><strong>{formatNumber(person.totalAttentions)}</strong></td><td>{formatNumber(person.managementTarget)}</td><td><span className="foja-value">{formatPercent(person.foja)}</span></td></tr>)}</tbody></table></div></section>;
}

function Quality({ validations, parameters, updateParameter }: { validations: ValidationItem[]; parameters: Parameters; updateParameter: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void }) {
  return <div className="quality-layout"><section className="panel"><PanelHeader title="Calidad del reporte" subtitle="Controles ejecutados antes del cálculo" action="Actualizar" /><div className="validation-list">{validations.map((item) => <div className="validation-row" key={item.label}><div className={`validation-state ${item.count === 0 ? "valid" : "warning"}`}>{item.count === 0 ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}</div><div><strong>{item.label}</strong><span>{item.description}</span></div><b className={item.count === 0 ? "valid-text" : "warning-text"}>{item.count === 0 ? "OK" : `${item.count} hallazgos`}</b></div>)}</div></section><section className="panel parameters-panel"><PanelHeader title="Parámetros activos" subtitle="Reglas editables sin tocar código" action="Restaurar" /><Parameter label="Atención directa" value={parameters.directPct} onChange={(value) => updateParameter("directPct", value)} /><Parameter label="Atención indirecta" value={parameters.indirectPct} onChange={(value) => updateParameter("indirectPct", value)} /><Parameter label="Actividad NAS" value={parameters.nasPct} onChange={(value) => updateParameter("nasPct", value)} /><Parameter label="Meta de gestión" value={parameters.managementTarget} onChange={(value) => updateParameter("managementTarget", value)} /><div className="parameter-number"><label>Minutos estándar directa</label><input type="number" value={parameters.standardMinutes} onChange={(event) => updateParameter("standardMinutes", Number(event.target.value))} /></div><div className="parameter-number"><label>Semanas equivalentes por mes</label><input type="number" step="0.1" value={parameters.weeksPerMonth} onChange={(event) => updateParameter("weeksPerMonth", Number(event.target.value))} /></div></section></div>;
}

function Parameter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="parameter"><div><label>{label}</label><strong>{formatPercent(value)}</strong></div><input type="range" min="0" max="1" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

export default App;
