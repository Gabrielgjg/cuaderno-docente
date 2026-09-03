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

async function syncPending() {
  if (syncing) return;
  if (Store.pendingCount() === 0) { updateSyncDot(); return; }
  if (!navigator.onLine) { updateSyncDot(); return; }
  syncing = true;
  updateSyncDot();
  try {
    const batch = {
      asistencia: Store.queue.Asistencia,
      calificaciones: Store.queue.Calificaciones,
      incidencias: Store.queue.Incidencias,
      diario: Store.queue.Diario
    };
    const hasBatch = batch.asistencia.length || batch.calificaciones.length || batch.incidencias.length || batch.diario.length;
    if (hasBatch) {
      await jsonp('sync', { data: JSON.stringify(batch) });
      Store.queue.Asistencia = []; Store.queue.Calificaciones = [];
      Store.queue.Incidencias = []; Store.queue.Diario = [];
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
  { id: 'admin', label: 'Admin', icon: iconSettings }
];
let currentView = 'dashboard';
let ctx = { grupoId: null, fecha: todayISO(), asignatura: null, trimestre: TRIMESTRES[0] };

function iconHome(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';}
function iconCheck(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>';}
function iconStar(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21 7.5 13.5 2 9h7z"/></svg>';}
function iconBook(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3V4z"/><path d="M4 4v13a3 3 0 003 3"/></svg>';}
function iconSettings(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';}

function renderNav() {
  document.getElementById('bottomnav').innerHTML = NAV.map(n => `
    <button class="navbtn ${currentView === n.id ? 'active' : ''}" onclick="goTo('${n.id}')">
      ${n.icon()}<span>${n.label}</span>
    </button>`).join('');
}
function goTo(id) { currentView = id; renderNav(); renderCurrentView(); }
function renderCurrentView() {
  const titles = { dashboard: 'Cuaderno Docente', asistencia: 'Pase de lista', calificaciones: 'Calificaciones', diario: 'Diario docente', admin: 'Administración' };
  document.getElementById('viewTitle').textContent = titles[currentView];
  const fns = { dashboard: viewDashboard, asistencia: viewAsistencia, calificaciones: viewCalificaciones, diario: viewDiario, admin: viewAdmin };
  renderContextRow();
  document.getElementById('views').innerHTML = `<div class="view active">${fns[currentView]()}</div>`;
}

function renderContextRow() {
  const row = document.getElementById('contextRow');
  if (currentView === 'dashboard') { row.innerHTML = ''; return; }
  if (currentView === 'admin') { row.innerHTML = ''; return; }
  const grupos = Store.activeGrupos();
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
    <h3>Grupos</h3>
    ${grupos.map(g => `
      <div class="card-flat row between">
        <div><strong>${esc(g.grado)}${esc(g.grupo)}</strong> · ${esc(g.asignatura)}<br><span class="muted">${esc(g.escuela)}</span></div>
        <button class="btn small secondary" onclick="ctx.grupoId='${g.id}'; goTo('asistencia')">Pase de lista</button>
      </div>`).join('')}
    <div class="divider"></div>
    <button class="btn block secondary" onclick="refreshFromServer()">Actualizar datos del servidor</button>
  `;
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
    if (r.grupoId === ctx.grupoId && r.fecha === ctx.fecha) existentes[r.alumnoId] = r.estatus;
  });

  return `
    <div class="row between" style="margin-bottom:10px;">
      <span class="muted">${alumnos.length} alumnos · ${ctx.fecha}</span>
      <button class="btn small" onclick="marcarTodosPresente()">Todos presentes</button>
    </div>
    <div id="rosterList">
      ${alumnos.map(a => rosterRow(a, existentes[a.id])).join('')}
    </div>
    <button class="btn block" style="margin-top:14px;" onclick="guardarAsistencia()">Guardar pase de lista</button>
  `;
}
function rosterRow(a, estatusActual) {
  return `<div class="roster-item" data-alumno="${a.id}">
    <span class="roster-name">${esc(a.nombre)}</span>
    <div class="status-btns">
      ${ESTATUS_ASISTENCIA.map(s => `<button class="stat ${estatusActual === s ? 'on' : ''}" data-s="${s}" onclick="setEstatus('${a.id}','${s}',this)">${s[0]}</button>`).join('')}
    </div>
  </div>`;
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
    rows.push({
      id: uid(), alumnoId: item.dataset.alumno, grupoId: ctx.grupoId,
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
        <span class="muted">${esc(r.rubro)} (${r.porcentaje}%) · prom. ${prom} · ${vals.length} evid.</span>
        <button class="btn small secondary" onclick="abrirCapturaEvidencia('${alumno.id}','${attrJs(r.rubro)}')">+ Evidencia</button>
      </div>`;
    }).join('')}
  </div>`;
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
