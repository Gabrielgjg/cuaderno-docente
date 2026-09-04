/* =================================================================
   CUADERNO DOCENTE — app.js
   Config, capa de datos (cache local + cola offline), y pantallas.
   ================================================================= */

const CONFIG = {
  // Pega aquí la URL /exec de tu implementación de Apps Script
  API_URL: 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT_/exec',
  CICLO: '2026-2027'
};

const ESTATUS_ASISTENCIA = ['Presente', 'Ausente', 'Retardo', 'Justificado'];
const TIPOS_DIARIO = [
  { id: 'nota', label: 'Nota' },
  { id: 'avance', label: 'Avance' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'incidencia', label: 'Incidencia' }
];
const TRIMESTRES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

/* ---------------------------------------------------------------
   CAPA DE DATOS: cache local (localStorage) + cola de sincronización
   --------------------------------------------------------------- */
const Store = {
  data: { Grupos: [], Alumnos: [], Asistencia: [], Encuadres: [], Calificaciones: [], Incidencias: [], Diario: [] },
  queue: { Asistencia: [], Calificaciones: [], Incidencias: [], Diario: [], Grupos: [], Alumnos: [] },

  load() {
    try {
      const d = localStorage.getItem('cd_data');
      if (d) this.data = JSON.parse(d);
      const q = localStorage.getItem('cd_queue');
      if (q) this.queue = JSON.parse(q);
    } catch (e) { console.warn('No se pudo leer cache local', e); }
  },
  persist() {
    localStorage.setItem('cd_data', JSON.stringify(this.data));
    localStorage.setItem('cd_queue', JSON.stringify(this.queue));
    updateSyncDot();
  },
  pendingCount() {
    return Object.values(this.queue).reduce((a, arr) => a + arr.length, 0);
  },

  upsertLocal(sheet, obj) {
    if (!obj.id) obj.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const arr = this.data[sheet];
    const idx = arr.findIndex(r => r.id === obj.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...obj }; else arr.push(obj);
    return obj.id;
  },

  enqueue(sheet, obj) {
    this.queue[sheet].push(obj);
    this.persist();
  },

  activeGrupos() { return this.data.Grupos.filter(g => g.activo === true || g.activo === 'TRUE' || g.activo === 'VERDADERO'); },
  alumnosDeGrupo(grupoId) { return this.data.Alumnos.filter(a => a.grupoId === grupoId && (a.activo === true || a.activo === 'TRUE' || a.activo === 'VERDADERO')); },
  encuadre(asignatura, trimestre) {
    return this.data.Encuadres.filter(e => e.asignatura === asignatura && e.trimestre === trimestre && (e.activo === true || e.activo === 'TRUE' || e.activo === 'VERDADERO'));
  }
};
Store.load();

/* ---------------------------------------------------------------
   JSONP client — GET con callback, evita problemas de CORS
   --------------------------------------------------------------- */
let _jsonpCounter = 0;
function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PEGA_AQUI') === 0) {
      reject(new Error('offline-config'));
      return;
    }
    const cbName = '_jsonp_cb_' + (++_jsonpCounter);
    const timeout = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 20000);
    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      const s = document.getElementById(cbName);
      if (s) s.remove();
    }
    window[cbName] = (res) => { cleanup(); resolve(res); };
    const qs = new URLSearchParams({ action, callback: cbName, ...params });
    const script = document.createElement('script');
    script.id = cbName;
    script.src = CONFIG.API_URL + '?' + qs.toString();
    script.onerror = () => { cleanup(); reject(new Error('network')); };
    document.body.appendChild(script);
  });
}

/* ---------------------------------------------------------------
   SINCRONIZACIÓN
   --------------------------------------------------------------- */
let syncing = false;
async function refreshFromServer() {
  try {
    const res = await jsonp('getAll');
    if (res && res.ok) {
      Store.data = res.data;
      Store.persist();
      toast('Datos actualizados');
      renderCurrentView();
    }
  } catch (e) { /* seguimos con lo local */ }
}

async function syncPending(manual) {
  if (syncing) { if (manual) toast('Ya está sincronizando…'); return; }
  if (Store.pendingCount() === 0) { updateSyncDot(); if (manual) toast('No hay nada pendiente'); return; }
  if (!navigator.onLine) { updateSyncDot(); if (manual) toast('Sin conexión detectada'); return; }
  syncing = true;
  updateSyncDot();
  const CHUNK_SIZE = 15; // evita URLs demasiado largas en el JSONP
  try {
    const categorias = [
      { key: 'Asistencia', campo: 'asistencia' },
      { key: 'Calificaciones', campo: 'calificaciones' },
      { key: 'Incidencias', campo: 'incidencias' },
      { key: 'Diario', campo: 'diario' }
    ];
    for (const cat of categorias) {
      const items = Store.queue[cat.key].slice();
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const payload = { asistencia: [], calificaciones: [], incidencias: [], diario: [] };
        payload[cat.campo] = chunk;
        await jsonp('sync', { data: JSON.stringify(payload) });
        const sentIds = new Set(chunk.map(r => r.id));
        Store.queue[cat.key] = Store.queue[cat.key].filter(r => !sentIds.has(r.id));
        Store.persist();
      }
    }
    for (const g of Store.queue.Grupos) await jsonp('saveGrupo', { data: JSON.stringify(g) });
    Store.queue.Grupos = [];
    for (const a of Store.queue.Alumnos) await jsonp('saveAlumno', { data: JSON.stringify(a) });
    Store.queue.Alumnos = [];
    Store.persist();
    toast('Sincronizado ✓');
    await refreshFromServer();
  } catch (e) {
    console.warn('Sync falló, se reintentará', e);
    if (manual) toast('Error al sincronizar: ' + e.message);
  } finally {
    syncing = false;
    updateSyncDot();
  }
}

function updateSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  if (!navigator.onLine) { dot.className = 'sync-dot offline'; dot.title = 'Sin conexión — capturando localmente'; return; }
  if (Store.pendingCount() > 0) { dot.className = 'sync-dot pending'; dot.title = Store.pendingCount() + ' cambios por sincronizar'; return; }
  dot.className = 'sync-dot'; dot.title = 'Todo sincronizado';
}
window.addEventListener('online', syncPending);
window.addEventListener('offline', updateSyncDot);
setInterval(syncPending, 30000);

/* ---------------------------------------------------------------
   UI helpers
   --------------------------------------------------------------- */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function openModal(html) {
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
function uid() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Para insertar texto libre del usuario como literal JS ('...') dentro de un atributo onclick="..."
function attrJs(s) {
  const js = (s ?? '').toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return js.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------------------------------------------------------
   NAVEGACIÓN
   --------------------------------------------------------------- */
const NAV = [
  { id: 'dashboard', label: 'Inicio', icon: iconHome },
  { id: 'asistencia', label: 'Asistencia', icon: iconCheck },
  { id: 'calificaciones', label: 'Calif.', icon: iconStar },
  { id: 'diario', label: 'Diario', icon: iconBook },
  { id: 'clase', label: 'Clase', icon: iconDice },
  { id: 'admin', label: 'Admin', icon: iconSettings }
];
let currentView = 'dashboard';
let ctx = { grupoId: null, fecha: todayISO(), asignatura: null, trimestre: TRIMESTRES[0] };

function iconHome(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';}
function iconCheck(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>';}
function iconStar(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21 7.5 13.5 2 9h7z"/></svg>';}
function iconBook(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3V4z"/><path d="M4 4v13a3 3 0 003 3"/></svg>';}
function iconSettings(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';}
function iconDice(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';}

function renderNav() {
  document.getElementById('bottomnav').innerHTML = NAV.map(n => `
    <button class="navbtn ${currentView === n.id ? 'active' : ''}" onclick="goTo('${n.id}')">
      ${n.icon()}<span>${n.label}</span>
    </button>`).join('');
}
function goTo(id) { currentView = id; renderNav(); renderCurrentView(); }
function renderCurrentView() {
  const titles = { dashboard: 'Cuaderno Docente', asistencia: 'Pase de lista', calificaciones: 'Calificaciones', diario: 'Diario docente', clase: 'Herramientas de clase', admin: 'Administración' };
  document.getElementById('viewTitle').textContent = titles[currentView];
  const fns = { dashboard: viewDashboard, asistencia: viewAsistencia, calificaciones: viewCalificaciones, diario: viewDiario, clase: viewClase, admin: viewAdmin };
  renderContextRow();
  document.getElementById('views').innerHTML = `<div class="view active">${fns[currentView]()}</div>`;
  postRenderHooks();
}

function renderContextRow() {
  const row = document.getElementById('contextRow');
  if (currentView === 'admin') { row.innerHTML = ''; return; }
  const grupos = Store.activeGrupos();
  if (currentView === 'dashboard') {
    row.innerHTML = `<select id="ctxGrupo" onchange="ctx.grupoId=this.value; renderCurrentView();">
        <option value="">Panorama general (todos los grupos)</option>
        ${grupos.map(g => `<option value="${g.id}" ${ctx.grupoId === g.id ? 'selected' : ''}>${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}
      </select>
      ${ctx.grupoId ? `<select id="ctxTrimestre" onchange="ctx.trimestre=this.value; renderCurrentView();">
          ${TRIMESTRES.map(t => `<option ${ctx.trimestre === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>` : ''}`;
    return;
  }
  let html = `<select id="ctxGrupo" onchange="ctx.grupoId=this.value; renderCurrentView();">
      <option value="">Selecciona grupo…</option>
      ${grupos.map(g => `<option value="${g.id}" ${ctx.grupoId === g.id ? 'selected' : ''}>${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}
    </select>`;
  if (currentView === 'asistencia' || currentView === 'diario') {
    html += `<input type="date" id="ctxFecha" value="${ctx.fecha}" onchange="ctx.fecha=this.value; renderCurrentView();">`;
  }
  if (currentView === 'calificaciones') {
    html += `<select id="ctxTrimestre" onchange="ctx.trimestre=this.value; renderCurrentView();">
        ${TRIMESTRES.map(t => `<option ${ctx.trimestre === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>`;
  }
  row.innerHTML = html;
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function viewDashboard() {
  if (ctx.grupoId) return viewDashboardGrupo();
  const grupos = Store.activeGrupos();
  const totalAlumnos = Store.data.Alumnos.filter(a => a.activo === true || a.activo === 'TRUE' || a.activo === 'VERDADERO').length;
  const pend = Store.pendingCount();
  if (grupos.length === 0) {
    return `<div class="empty"><div class="mark-big"></div>
      <h2>Vamos a empezar</h2>
      <p class="muted">Aún no tienes grupos configurados.</p>
      <button class="btn" onclick="goTo('admin')">Configurar grupos</button>
    </div>`;
  }
  return `
    <div class="card"><div class="row between"><div><div class="muted">Grupos activos</div><h2>${grupos.length}</h2></div>
      <div><div class="muted">Alumnos</div><h2>${totalAlumnos}</h2></div>
      <div><div class="muted">Por sincronizar</div><h2 style="color:${pend ? 'var(--warn)' : 'var(--ok)'}">${pend}</h2></div></div></div>
    <p class="muted" style="text-align:center; margin:6px 0 12px;">Selecciona un grupo arriba para ver sus estadísticas</p>
    <h3>Grupos</h3>
    ${grupos.map(g => `
      <div class="card-flat row between">
        <div><strong>${esc(g.grado)}${esc(g.grupo)}</strong> · ${esc(g.asignatura)}<br><span class="muted">${esc(g.escuela)}</span></div>
        <button class="btn small secondary" onclick="ctx.grupoId='${g.id}'; goTo('asistencia')">Pase de lista</button>
      </div>`).join('')}
    <div class="divider"></div>
    <button class="btn block secondary" onclick="syncPending(true)">Sincronizar ahora</button>
    <button class="btn block ghost" style="margin-top:8px;" onclick="refreshFromServer()">Actualizar datos del servidor</button>
  `;
}
function viewDashboardGrupo() {
  const grupo = Store.data.Grupos.find(g => g.id === ctx.grupoId);
  if (!grupo) return '';
  const alumnos = Store.alumnosDeGrupo(ctx.grupoId);
  return `
    <div class="row between no-print" style="margin-bottom:4px;">
      <span class="muted">${esc(grupo.escuela)} · ${esc(grupo.grado)}${esc(grupo.grupo)} · ${esc(grupo.asignatura)} · ${alumnos.length} alumnos</span>
      <button class="btn small secondary" onclick="window.print()">Imprimir / PDF</button>
    </div>
    <div class="card-flat muted" style="display:none;" id="printHeader">${esc(grupo.escuela)} · ${esc(grupo.grado)}${esc(grupo.grupo)} · ${esc(grupo.asignatura)} · ${alumnos.length} alumnos · ${esc(ctx.trimestre)}</div>
    <h3>Asistencia acumulada</h3>
    <div class="card chart-box"><canvas id="chartAsistenciaGrupo"></canvas></div>
    <h3>% de entregas por rubro — ${esc(ctx.trimestre)}</h3>
    <div class="card chart-box"><canvas id="chartEntregas"></canvas></div>
    <h3>Distribución de calificaciones — ${esc(ctx.trimestre)}</h3>
    <div class="card chart-box"><canvas id="chartDistribucion"></canvas></div>
  `;
}

const chartInstances = {};
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }
const CHART_COLORS = { Presente: '#4C7A5E', Ausente: '#B5533C', Retardo: '#C48A34', Justificado: '#5B7EA6', accent: '#2F4A3D', line: '#DAD0BC' };

function postRenderHooks() {
  if (currentView === 'dashboard' && ctx.grupoId) renderDashboardCharts();
  if (currentView === 'admin' && typeof adminTab !== 'undefined' && adminTab === 'perfil' && typeof perfilAlumnoId !== 'undefined' && perfilAlumnoId) {
    if (typeof renderPerfilChart === 'function') renderPerfilChart();
  }
}
function renderDashboardCharts() {
  if (typeof Chart === 'undefined') {
    ['chartAsistenciaGrupo', 'chartEntregas', 'chartDistribucion'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.parentElement.innerHTML = '<p class="muted">No se pudo cargar la librería de gráficas. Verifica tu conexión y recarga.</p>';
    });
    return;
  }
  const grupo = Store.data.Grupos.find(g => g.id === ctx.grupoId);
  if (!grupo) return;
  const alumnos = Store.alumnosDeGrupo(ctx.grupoId);

  // 1. Asistencia acumulada
  const counts = { Presente: 0, Ausente: 0, Retardo: 0, Justificado: 0 };
  Store.data.Asistencia.concat(Store.queue.Asistencia).forEach(r => { if (r.grupoId === ctx.grupoId && counts[r.estatus] !== undefined) counts[r.estatus]++; });
  const elA = document.getElementById('chartAsistenciaGrupo');
  if (elA) {
    destroyChart('chartAsistenciaGrupo');
    chartInstances.chartAsistenciaGrupo = new Chart(elA, {
      type: 'doughnut',
      data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: Object.keys(counts).map(k => CHART_COLORS[k]) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // 2. % de entregas por rubro
  const rubros = Store.encuadre(grupo.asignatura, ctx.trimestre);
  const elE = document.getElementById('chartEntregas');
  if (elE) {
    destroyChart('chartEntregas');
    const calRows = Store.data.Calificaciones.concat(Store.queue.Calificaciones).filter(c => c.grupoId === ctx.grupoId && c.trimestre === ctx.trimestre);
    const pcts = rubros.map(r => {
      if (alumnos.length === 0) return 0;
      const entregaron = new Set(calRows.filter(c => c.rubro === r.rubro).map(c => c.alumnoId)).size;
      return Math.round((entregaron / alumnos.length) * 100);
    });
    chartInstances.chartEntregas = new Chart(elE, {
      type: 'bar',
      data: { labels: rubros.map(r => r.rubro), datasets: [{ label: '% entregó', data: pcts, backgroundColor: CHART_COLORS.accent }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });
  }

  // 3. Distribución de calificaciones (aprobado/reprobado/sin calificar)
  const elD = document.getElementById('chartDistribucion');
  if (elD) {
    destroyChart('chartDistribucion');
    let aprobado = 0, reprobado = 0, sinCalificar = 0;
    alumnos.forEach(a => {
      const calRows = Store.data.Calificaciones.concat(Store.queue.Calificaciones).filter(c => c.alumnoId === a.id && c.grupoId === ctx.grupoId && c.trimestre === ctx.trimestre);
      if (calRows.length === 0) { sinCalificar++; return; }
      let final = 0;
      rubros.forEach(r => {
        const vals = calRows.filter(c => c.rubro === r.rubro).map(c => Number(c.valor));
        if (vals.length) final += (vals.reduce((s, v) => s + v, 0) / vals.length) * (Number(r.porcentaje) / 100);
      });
      if (final >= 6) aprobado++; else reprobado++;
    });
    chartInstances.chartDistribucion = new Chart(elD, {
      type: 'doughnut',
      data: { labels: ['Aprobado (≥6)', 'Reprobado (<6)', 'Sin calificar'], datasets: [{ data: [aprobado, reprobado, sinCalificar], backgroundColor: [CHART_COLORS.Presente, CHART_COLORS.Ausente, CHART_COLORS.line] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

/* ================================================================
   ASISTENCIA
   ================================================================ */
function viewAsistencia() {
  if (!ctx.grupoId) return `<div class="empty"><p class="muted">Selecciona un grupo arriba para tomar asistencia.</p></div>`;
  const alumnos = Store.alumnosDeGrupo(ctx.grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (alumnos.length === 0) return `<div class="empty"><p class="muted">Este grupo no tiene alumnos activos. Agrégalos en Admin.</p></div>`;

  const existentes = {};
  Store.data.Asistencia.concat(Store.queue.Asistencia).forEach(r => {
    if (r.grupoId === ctx.grupoId && r.fecha === ctx.fecha) existentes[r.alumnoId] = r;
  });

  return `
    <div class="row between" style="margin-bottom:10px;">
      <span class="muted">${alumnos.length} alumnos · ${ctx.fecha}</span>
      <div class="row">
        <button class="btn small ghost" onclick="verResumenAsistencia()">Ver resumen</button>
        <button class="btn small" onclick="marcarTodosPresente()">Todos presentes</button>
      </div>
    </div>
    <div id="rosterList">
      ${alumnos.map(a => rosterRow(a, existentes[a.id])).join('')}
    </div>
    <button class="btn block" style="margin-top:14px;" onclick="guardarAsistencia()">${Object.keys(existentes).length ? 'Guardar cambios' : 'Guardar pase de lista'}</button>
  `;
}
function contarAsistencia(alumnoId) {
  const counts = { Presente: 0, Ausente: 0, Retardo: 0, Justificado: 0 };
  Store.data.Asistencia.concat(Store.queue.Asistencia).forEach(r => {
    if (r.alumnoId === alumnoId && counts[r.estatus] !== undefined) counts[r.estatus]++;
  });
  return counts;
}
function rosterRow(a, registro) {
  const c = contarAsistencia(a.id);
  const estatusActual = registro ? registro.estatus : null;
  return `<div class="roster-item" data-alumno="${a.id}" data-registro="${registro ? registro.id : ''}">
    <div class="roster-name">${esc(a.nombre)}<br>
      <span class="muted" style="font-size:.72rem; font-weight:400;">P:${c.Presente} · A:${c.Ausente} · R:${c.Retardo} · J:${c.Justificado}</span>
    </div>
    <div class="status-btns">
      ${ESTATUS_ASISTENCIA.map(s => `<button class="stat ${estatusActual === s ? 'on' : ''}" data-s="${s}" onclick="setEstatus('${a.id}','${s}',this)">${s[0]}</button>`).join('')}
    </div>
  </div>`;
}
function verResumenAsistencia() {
  const alumnos = Store.alumnosDeGrupo(ctx.grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const rows = alumnos.map(a => {
    const c = contarAsistencia(a.id);
    const total = c.Presente + c.Ausente + c.Retardo + c.Justificado;
    const pct = total ? Math.round((c.Presente / total) * 100) : 0;
    return { nombre: a.nombre, ...c, total, pct };
  });
  openModal(`
    <h2>Resumen de asistencia</h2>
    <p class="muted">Grupo completo · todas las fechas registradas</p>
    <table>
      <thead><tr><th>Alumno</th><th>P</th><th>A</th><th>R</th><th>J</th><th>%</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td>${esc(r.nombre)}</td><td>${r.Presente}</td><td>${r.Ausente}</td><td>${r.Retardo}</td><td>${r.Justificado}</td><td>${r.total ? r.pct + '%' : '—'}</td></tr>`).join('')}
      </tbody>
    </table>
  `);
}
function setEstatus(alumnoId, estatus, btn) {
  btn.parentElement.querySelectorAll('.stat').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}
function marcarTodosPresente() {
  document.querySelectorAll('#rosterList .roster-item').forEach(item => {
    const btn = item.querySelector('.stat[data-s="Presente"]');
    item.querySelectorAll('.stat').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  });
}
function guardarAsistencia() {
  const rows = [];
  document.querySelectorAll('#rosterList .roster-item').forEach(item => {
    const on = item.querySelector('.stat.on');
    if (!on) return;
    const registroId = item.dataset.registro;
    rows.push({
      id: registroId || uid(), alumnoId: item.dataset.alumno, grupoId: ctx.grupoId,
      fecha: ctx.fecha, estatus: on.dataset.s, observacion: ''
    });
  });
  if (rows.length === 0) { toast('Marca al menos un alumno'); return; }
  rows.forEach(r => { Store.upsertLocal('Asistencia', r); Store.enqueue('Asistencia', r); });
  Store.persist();
  toast('Asistencia guardada (' + rows.length + ')');
  syncPending();
  renderCurrentView();
}

/* ================================================================
   CALIFICACIONES
   ================================================================ */
function viewCalificaciones() {
  if (!ctx.grupoId) return `<div class="empty"><p class="muted">Selecciona un grupo arriba.</p></div>`;
  const grupo = Store.data.Grupos.find(g => g.id === ctx.grupoId);
  if (!grupo) return '';
  const rubros = Store.encuadre(grupo.asignatura, ctx.trimestre);
  if (rubros.length === 0) {
    return `<div class="empty"><p class="muted">No hay encuadre configurado para <strong>${esc(grupo.asignatura)}</strong> en ${esc(ctx.trimestre)}.</p>
      <button class="btn" onclick="goTo('admin')">Configurar encuadre</button></div>`;
  }
  const alumnos = Store.alumnosDeGrupo(ctx.grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const calRows = Store.data.Calificaciones.concat(Store.queue.Calificaciones)
    .filter(c => c.grupoId === ctx.grupoId && c.trimestre === ctx.trimestre);

  return `
    <div class="card-flat muted">Encuadre de <strong>${esc(grupo.asignatura)}</strong>: ${rubros.map(r => `${esc(r.rubro)} (${r.porcentaje}%)`).join(' · ')}</div>
    ${alumnos.map(a => alumnoCalifCard(a, rubros, calRows.filter(c => c.alumnoId === a.id))).join('')}
  `;
}
function alumnoCalifCard(alumno, rubros, calRows) {
  const porRubro = {};
  rubros.forEach(r => { porRubro[r.rubro] = calRows.filter(c => c.rubro === r.rubro).map(c => Number(c.valor)); });
  let final = 0, sumPct = 0;
  rubros.forEach(r => {
    const vals = porRubro[r.rubro];
    if (vals.length) {
      const prom = vals.reduce((a, b) => a + b, 0) / vals.length;
      final += prom * (Number(r.porcentaje) / 100);
    }
    sumPct += Number(r.porcentaje);
  });
  return `
  <div class="card">
    <div class="row between"><strong>${esc(alumno.nombre)}</strong><span class="tag">${final.toFixed(1)}</span></div>
    ${rubros.map(r => {
      const vals = porRubro[r.rubro];
      const prom = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
      return `<div class="row between" style="margin-top:8px;">
        <span class="muted" ${vals.length ? `onclick="verEvidencias('${alumno.id}','${attrJs(r.rubro)}')" style="text-decoration:underline; cursor:pointer;"` : ''}>${esc(r.rubro)} (${r.porcentaje}%) · prom. ${prom} · ${vals.length} evid.</span>
        <button class="btn small secondary" onclick="abrirCapturaEvidencia('${alumno.id}','${attrJs(r.rubro)}')">+ Evidencia</button>
      </div>`;
    }).join('')}
  </div>`;
}
function verEvidencias(alumnoId, rubro) {
  const rows = Store.data.Calificaciones.concat(Store.queue.Calificaciones)
    .filter(c => c.alumnoId === alumnoId && c.rubro === rubro && c.grupoId === ctx.grupoId && c.trimestre === ctx.trimestre);
  const alumno = Store.data.Alumnos.find(a => a.id === alumnoId);
  openModal(`
    <h2>${esc(rubro)}</h2>
    <p class="muted">${esc(alumno ? alumno.nombre : '')}</p>
    ${rows.map(r => `
      <div class="card-flat row between">
        <div><strong>${r.valor}</strong> — ${esc(r.evidencia || 'sin descripción')}<br><span class="muted">${esc(r.fecha)}</span></div>
        <div class="row">
          <button class="btn small ghost" onclick="editarEvidencia('${r.id}')">Editar</button>
          <button class="btn small ghost" style="color:var(--danger);" onclick="borrarEvidencia('${r.id}','${alumnoId}','${attrJs(rubro)}')">✕</button>
        </div>
      </div>`).join('')}
  `);
}
function editarEvidencia(id) {
  const row = Store.data.Calificaciones.concat(Store.queue.Calificaciones).find(c => c.id === id);
  if (!row) return;
  openModal(`
    <h2>Editar evidencia</h2>
    <p class="muted">${esc(row.rubro)} · ${esc(row.trimestre)}</p>
    <div class="field"><label>Descripción</label><input id="evDesc" value="${esc(row.evidencia)}"></div>
    <div class="field"><label>Calificación (0–10)</label><input id="evValor" type="number" min="0" max="10" step="0.1" value="${row.valor}"></div>
    <div class="field"><label>Fecha</label><input id="evFecha" type="date" value="${row.fecha}"></div>
    <button class="btn block" onclick="guardarEdicionEvidencia('${id}')">Guardar cambios</button>
  `);
}
function guardarEdicionEvidencia(id) {
  const valor = parseFloat(document.getElementById('evValor').value);
  if (isNaN(valor) || valor < 0 || valor > 10) { toast('Calificación inválida (0–10)'); return; }
  let row = Store.data.Calificaciones.find(c => c.id === id) || Store.queue.Calificaciones.find(c => c.id === id);
  if (!row) return;
  row.valor = valor;
  row.evidencia = document.getElementById('evDesc').value;
  row.fecha = document.getElementById('evFecha').value;
  Store.enqueue('Calificaciones', row); // upsert por id, sobreescribe en el Sheet
  Store.persist();
  closeModal();
  toast('Evidencia actualizada');
  syncPending();
  renderCurrentView();
}
async function borrarEvidencia(id, alumnoId, rubro) {
  Store.data.Calificaciones = Store.data.Calificaciones.filter(c => c.id !== id);
  Store.queue.Calificaciones = Store.queue.Calificaciones.filter(c => c.id !== id);
  Store.persist();
  toast('Evidencia borrada');
  try { await jsonp('deleteCalificacion', { id }); } catch (e) {}
  verEvidencias(alumnoId, rubro);
  renderCurrentView();
}
function abrirCapturaEvidencia(alumnoId, rubro) {
  const grupo = Store.data.Grupos.find(g => g.id === ctx.grupoId);
  openModal(`
    <h2>Nueva evidencia</h2>
    <p class="muted">${esc(rubro)} · ${ctx.trimestre}</p>
    <div class="field"><label>Descripción</label><input id="evDesc" placeholder="Ej. Examen unidad 2"></div>
    <div class="field"><label>Calificación (0–10)</label><input id="evValor" type="number" min="0" max="10" step="0.1"></div>
    <div class="field"><label>Fecha</label><input id="evFecha" type="date" value="${todayISO()}"></div>
    <button class="btn block" onclick="guardarEvidencia('${alumnoId}','${attrJs(rubro)}','${attrJs(grupo.asignatura)}')">Guardar</button>
  `);
}
function guardarEvidencia(alumnoId, rubro, asignatura) {
  const valor = parseFloat(document.getElementById('evValor').value);
  if (isNaN(valor) || valor < 0 || valor > 10) { toast('Calificación inválida (0–10)'); return; }
  const row = {
    id: uid(), alumnoId, grupoId: ctx.grupoId, asignatura, trimestre: ctx.trimestre, rubro,
    valor, evidencia: document.getElementById('evDesc').value, fecha: document.getElementById('evFecha').value
  };
  Store.upsertLocal('Calificaciones', row);
  Store.enqueue('Calificaciones', row);
  Store.persist();
  closeModal();
  toast('Evidencia guardada');
  syncPending();
  renderCurrentView();
}

/* ================================================================
   DIARIO DOCENTE
   ================================================================ */
function viewDiario() {
  if (!ctx.grupoId) return `<div class="empty"><p class="muted">Selecciona un grupo arriba.</p></div>`;
  const entradas = Store.data.Diario.concat(Store.queue.Diario)
    .filter(d => d.grupoId === ctx.grupoId)
    .sort((a, b) => (b.fecha + (b.timestamp || '')).localeCompare(a.fecha + (a.timestamp || '')));

  return `
    <div class="card">
      <div class="field"><label>Tipo</label>
        <div class="chip-list" id="diarioTipoChips">
          ${TIPOS_DIARIO.map((t, i) => `<span class="chip ${i === 0 ? 'active' : ''}" data-t="${t.id}" onclick="selectChip(this)">${t.label}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label>Nota</label><textarea id="diarioTexto" placeholder="¿Qué pasó en esta sesión?"></textarea></div>
      <button class="btn block" onclick="guardarDiario()">Agregar al diario</button>
    </div>
    <h3>Historial del grupo</h3>
    ${entradas.length === 0 ? '<p class="muted">Sin entradas todavía.</p>' :
      entradas.map(e => `<div class="diary-entry"><div class="diary-type">${esc(e.tipo)} · ${esc(e.fecha)}</div><div>${esc(e.texto)}</div></div>`).join('')}
  `;
}
function selectChip(el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}
function guardarDiario() {
  const texto = document.getElementById('diarioTexto').value.trim();
  if (!texto) { toast('Escribe algo primero'); return; }
  const tipo = document.querySelector('#diarioTipoChips .chip.active').dataset.t;
  const row = { id: uid(), grupoId: ctx.grupoId, fecha: ctx.fecha, tipo, texto };
  Store.upsertLocal('Diario', row);
  Store.enqueue('Diario', row);
  Store.persist();
  toast('Guardado en el diario');
  syncPending();
  renderCurrentView();
}

/* ================================================================
   INCIDENCIAS (registro rápido, accesible desde Admin/alumno)
   ================================================================ */
function abrirNuevaIncidencia(alumnoId, alumnoNombre, grupoId) {
  openModal(`
    <h2>Nueva incidencia</h2>
    <p class="muted">${esc(alumnoNombre)}</p>
    <div class="field"><label>Tipo</label>
      <select id="incTipo"><option>Conducta</option><option>Material/tareas</option><option>Convivencia</option><option>Salud</option><option>Otro</option></select>
    </div>
    <div class="field"><label>Descripción</label><textarea id="incDesc" placeholder="Describe brevemente lo ocurrido"></textarea></div>
    <p class="muted" style="font-size:.75rem;">No afecta la calificación — queda como bitácora para seguimiento.</p>
    <button class="btn block" onclick="guardarIncidencia('${alumnoId}','${grupoId}')">Guardar</button>
  `);
}
function guardarIncidencia(alumnoId, grupoId) {
  const desc = document.getElementById('incDesc').value.trim();
  if (!desc) { toast('Describe la incidencia'); return; }
  const row = { id: uid(), alumnoId, grupoId, fecha: todayISO(), tipo: document.getElementById('incTipo').value, descripcion: desc };
  Store.upsertLocal('Incidencias', row);
  Store.enqueue('Incidencias', row);
  Store.persist();
  closeModal();
  toast('Incidencia registrada');
  syncPending();
}

/* ================================================================
   ADMIN — cargado desde admin.js (grupos, alumnos, encuadres, import/OCR)
   ================================================================ */

/* ---------------------------------------------------------------
   ARRANQUE
   --------------------------------------------------------------- */
renderNav();
renderCurrentView();
updateSyncDot();
if (navigator.onLine) refreshFromServer();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
