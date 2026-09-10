/* =================================================================
   ADMIN — Grupos, Alumnos (con migración/baja), Encuadres, Importar
   ================================================================= */

let adminTab = 'grupos';

function viewAdmin() {
  const tabs = [
    { id: 'grupos', label: 'Grupos' },
    { id: 'alumnos', label: 'Alumnos' },
    { id: 'perfil', label: 'Perfil' },
    { id: 'encuadres', label: 'Encuadres' },
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'importar', label: 'Importar' },
    { id: 'config', label: 'Conexión' }
  ];
  const fns = { grupos: adminGrupos, alumnos: adminAlumnos, perfil: adminPerfil, encuadres: adminEncuadres, diagnostico: adminDiagnostico, importar: adminImportar, config: adminConfig };
  return `
    <div class="chip-list no-print">
      ${tabs.map(t => `<span class="chip ${adminTab === t.id ? 'active' : ''}" onclick="adminTab='${t.id}'; renderCurrentView();">${t.label}</span>`).join('')}
    </div>
    ${fns[adminTab]()}
  `;
}

/* ---------------- GRUPOS ---------------- */
function adminGrupos() {
  const grupos = Store.data.Grupos.slice().sort((a, b) => (a.escuela + a.grado + a.grupo).localeCompare(b.escuela + b.grado + b.grupo));
  return `
    <button class="btn block secondary" onclick="modalGrupo()">+ Nuevo grupo</button>
    <div style="margin-top:10px;">
    ${grupos.length === 0 ? '<p class="muted">Sin grupos aún.</p>' : grupos.map(g => `
      <div class="card-flat row between">
        <div>
          <strong>${esc(g.grado)}${esc(g.grupo)}</strong> · ${esc(g.asignatura)}
          ${g.activo === false || g.activo === 'FALSE' ? '<span class="tag" style="background:var(--danger);color:#fff;">inactivo</span>' : ''}
          <br><span class="muted">${esc(g.escuela)} · ${esc(g.cicloEscolar || CONFIG.CICLO)}</span>
        </div>
        <button class="btn small ghost" onclick="modalGrupo('${g.id}')">Editar</button>
      </div>`).join('')}
    </div>`;
}
function modalGrupo(id) {
  const g = id ? Store.data.Grupos.find(x => x.id === id) : null;
  openModal(`
    <h2>${g ? 'Editar' : 'Nuevo'} grupo</h2>
    <div class="field"><label>Escuela</label><input id="gEscuela" value="${g ? esc(g.escuela) : ''}" placeholder="Ej. Secundaria Técnica 88"></div>
    <div class="field"><label>Grado</label><input id="gGrado" value="${g ? esc(g.grado) : ''}" placeholder="1° / 3°"></div>
    <div class="field"><label>Grupo</label><input id="gGrupo" value="${g ? esc(g.grupo) : ''}" placeholder="A, B, C…"></div>
    <div class="field"><label>Asignatura</label><input id="gAsignatura" value="${g ? esc(g.asignatura) : ''}" placeholder="Biología / Tecnología"></div>
    <div class="field"><label>Ciclo escolar</label><input id="gCiclo" value="${g ? esc(g.cicloEscolar) : CONFIG.CICLO}"></div>
    <div class="field"><label><input type="checkbox" id="gActivo" ${!g || g.activo !== false ? 'checked' : ''} style="width:auto;"> Activo</label></div>
    <button class="btn block" onclick="guardarGrupo(${g ? `'${g.id}'` : 'null'})">Guardar</button>
  `);
}
function guardarGrupo(id) {
  const row = {
    id: id || uid(),
    escuela: document.getElementById('gEscuela').value.trim(),
    grado: document.getElementById('gGrado').value.trim(),
    grupo: document.getElementById('gGrupo').value.trim(),
    asignatura: document.getElementById('gAsignatura').value.trim(),
    cicloEscolar: document.getElementById('gCiclo').value.trim(),
    activo: document.getElementById('gActivo').checked
  };
  if (!row.escuela || !row.grado || !row.grupo || !row.asignatura) { toast('Completa los campos'); return; }
  Store.upsertLocal('Grupos', row);
  Store.enqueue('Grupos', row);
  Store.persist();
  closeModal();
  toast('Grupo guardado');
  syncPending();
  renderCurrentView();
}

/* ---------------- ALUMNOS ---------------- */
let alumnosFiltro = { texto: '', grupoId: '' };
function adminAlumnos() {
  const gruposActivos = Store.activeGrupos();
  return `
    <button class="btn block secondary" onclick="modalAlumno()">+ Nuevo alumno</button>
    <div class="row" style="margin-top:10px;">
      <input id="alumFiltroTexto" placeholder="Buscar por nombre…" value="${esc(alumnosFiltro.texto)}" oninput="alumnosFiltro.texto=this.value; renderAlumnosLista();" style="flex:1; padding:9px 11px; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-raised);">
      <select id="alumFiltroGrupo" onchange="alumnosFiltro.grupoId=this.value; renderAlumnosLista();" style="padding:9px 11px; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-raised);">
        <option value="">Todos los grupos</option>
        ${gruposActivos.map(g => `<option value="${g.id}" ${alumnosFiltro.grupoId === g.id ? 'selected' : ''}>${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}
      </select>
    </div>
    <div id="alumnosListaWrap" style="margin-top:10px;">${alumnosListaHTML()}</div>`;
}
function alumnosListaHTML() {
  const grupos = Store.data.Grupos;
  let alumnos = Store.data.Alumnos.filter(a => a.activo !== false && a.activo !== 'FALSE')
    .slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (alumnosFiltro.texto) alumnos = alumnos.filter(a => a.nombre.toLowerCase().includes(alumnosFiltro.texto.toLowerCase()));
  if (alumnosFiltro.grupoId) alumnos = alumnos.filter(a => a.grupoId === alumnosFiltro.grupoId);
  const grupoName = (id) => { const g = grupos.find(x => x.id === id); return g ? `${g.grado}${g.grupo} · ${g.asignatura}` : '—'; };
  return alumnos.length === 0 ? '<p class="muted">Sin resultados.</p>' : alumnos.map(a => `
      <div class="card-flat row between">
        <div><strong>${esc(a.nombre)}</strong>${a.notas ? ' <span class="tag">nota</span>' : ''}<br><span class="muted">${grupoName(a.grupoId)}</span></div>
        <div class="row">
          <button class="btn small ghost" onclick="abrirNuevaIncidencia('${a.id}','${attrJs(a.nombre)}','${a.grupoId}')">Incidencia</button>
          <button class="btn small ghost" onclick="modalAlumno('${a.id}')">Editar</button>
        </div>
      </div>`).join('');
}
function renderAlumnosLista() {
  const el = document.getElementById('alumnosListaWrap');
  if (el) el.innerHTML = alumnosListaHTML();
}
function modalAlumno(id) {
  const a = id ? Store.data.Alumnos.find(x => x.id === id) : null;
  const grupos = Store.activeGrupos();
  openModal(`
    <h2>${a ? 'Editar' : 'Nuevo'} alumno</h2>
    <div class="field"><label>Nombre completo</label><input id="aNombre" value="${a ? esc(a.nombre) : ''}"></div>
    <div class="field"><label>Matrícula (opcional)</label><input id="aMatricula" value="${a ? esc(a.matricula) : ''}"></div>
    <div class="field"><label>Grupo</label>
      <select id="aGrupo">${grupos.map(g => `<option value="${g.id}" ${a && a.grupoId === g.id ? 'selected' : ''}>${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}</select>
    </div>
    ${a ? `<div class="field"><label>Notas particulares (solo para ti)</label><textarea id="aNotas" placeholder="Ej. alergias, acuerdos con el padre, seguimiento especial…">${esc(a.notas)}</textarea></div>` : ''}
    <button class="btn block" onclick="guardarAlumno(${a ? `'${a.id}'` : 'null'})">Guardar</button>
    ${a ? `<div class="divider"></div>
      <button class="btn block secondary" onclick="modalMigrar('${a.id}')">Cambiar de grupo (migrar)</button>
      <button class="btn block ghost" style="margin-top:8px; color:var(--danger); border-color:var(--danger);" onclick="confirmarBaja('${a.id}')">Dar de baja</button>` : ''}
  `);
}
function guardarAlumno(id) {
  const nombre = document.getElementById('aNombre').value.trim();
  const grupoId = document.getElementById('aGrupo').value;
  if (!nombre || !grupoId) { toast('Nombre y grupo son obligatorios'); return; }
  const existente = id ? Store.data.Alumnos.find(x => x.id === id) : null;
  const row = {
    id: id || uid(), nombre, matricula: document.getElementById('aMatricula').value.trim(),
    grupoId, activo: true,
    notas: id ? document.getElementById('aNotas').value : '',
    historialGrupos: existente ? existente.historialGrupos : '[]'
  };
  Store.upsertLocal('Alumnos', row);
  Store.enqueue('Alumnos', row);
  Store.persist();
  closeModal();
  toast('Alumno guardado');
  syncPending();
  renderCurrentView();
}
function modalMigrar(alumnoId) {
  const grupos = Store.activeGrupos();
  openModal(`
    <h2>Cambiar de grupo</h2>
    <p class="muted">Su historial de asistencia, calificaciones e incidencias viaja con él.</p>
    <div class="field"><label>Nuevo grupo</label>
      <select id="migGrupo">${grupos.map(g => `<option value="${g.id}">${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}</select>
    </div>
    <button class="btn block" onclick="migrarAlumnoUI('${alumnoId}')">Confirmar cambio</button>
  `);
}
function migrarAlumnoUI(alumnoId) {
  const nuevoGrupoId = document.getElementById('migGrupo').value;
  const a = Store.data.Alumnos.find(x => x.id === alumnoId);
  if (a) {
    let hist = [];
    try { hist = a.historialGrupos ? JSON.parse(a.historialGrupos) : []; } catch (e) {}
    hist.push({ grupoAnterior: a.grupoId, fecha: todayISO() });
    a.grupoId = nuevoGrupoId;
    a.historialGrupos = JSON.stringify(hist);
    Store.enqueue('Alumnos', a);
    Store.persist();
  }
  closeModal();
  toast('Alumno migrado');
  syncPending();
  renderCurrentView();
}
function confirmarBaja(alumnoId) {
  const a = Store.data.Alumnos.find(x => x.id === alumnoId);
  openModal(`
    <h2>Dar de baja</h2>
    <p>¿Confirmas dar de baja a <strong>${esc(a.nombre)}</strong>? Su historial se conserva, solo deja de aparecer en listas activas.</p>
    <div class="row">
      <button class="btn secondary block" onclick="closeModal()">Cancelar</button>
      <button class="btn block" style="background:var(--danger); border-color:var(--danger);" onclick="darDeBajaUI('${alumnoId}')">Dar de baja</button>
    </div>
  `);
}
async function darDeBajaUI(alumnoId) {
  const a = Store.data.Alumnos.find(x => x.id === alumnoId);
  a.activo = false;
  a.fechaBaja = todayISO();
  Store.persist();
  closeModal();
  toast('Alumno dado de baja');
  try { await jsonp('bajaAlumno', { data: JSON.stringify({ alumnoId, fecha: a.fechaBaja }) }); } catch (e) {}
  renderCurrentView();
}

/* ---------------- PERFIL DE ALUMNO ---------------- */
let perfilFiltro = '';
let perfilFiltroGrupo = '';
let perfilAlumnoId = null;
function adminPerfil() {
  const alumnoActivo = perfilAlumnoId ? Store.data.Alumnos.find(a => a.id === perfilAlumnoId && a.activo !== false && a.activo !== 'FALSE') : null;
  if (alumnoActivo) return renderPerfilDetalle(alumnoActivo);
  const gruposActivos = Store.activeGrupos();
  return `
    <div class="row" style="margin-bottom:10px;">
      <input id="perfilBuscar" placeholder="Buscar alumno por nombre…" value="${esc(perfilFiltro)}" oninput="perfilFiltro=this.value; renderPerfilLista();" style="flex:1; padding:9px 11px; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-raised);">
      <select id="perfilFiltroGrupoSel" onchange="perfilFiltroGrupo=this.value; renderPerfilLista();" style="padding:9px 11px; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-raised);">
        <option value="">Todos los grupos</option>
        ${gruposActivos.map(g => `<option value="${g.id}" ${perfilFiltroGrupo === g.id ? 'selected' : ''}>${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}
      </select>
    </div>
    <div id="perfilListaWrap" style="max-height:340px; overflow-y:auto;">${perfilListaHTML()}</div>
  `;
}
function perfilListaHTML() {
  const grupos = Store.data.Grupos;
  let alumnos = Store.data.Alumnos.filter(a => a.activo !== false && a.activo !== 'FALSE').slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (perfilFiltro) alumnos = alumnos.filter(a => a.nombre.toLowerCase().includes(perfilFiltro.toLowerCase()));
  if (perfilFiltroGrupo) alumnos = alumnos.filter(a => a.grupoId === perfilFiltroGrupo);
  const grupoName = (id) => { const g = grupos.find(x => x.id === id); return g ? `${g.grado}${g.grupo} · ${g.asignatura}` : '—'; };
  return alumnos.length === 0 ? '<p class="muted">Sin resultados.</p>' : alumnos.map(a => `
          <div class="card-flat row between" style="cursor:pointer;" onclick="perfilAlumnoId='${a.id}'; renderCurrentView();">
            <div><strong>${esc(a.nombre)}</strong><br><span class="muted">${grupoName(a.grupoId)}</span></div>
            <span class="muted">Ver →</span>
          </div>`).join('');
}
function renderPerfilLista() {
  const el = document.getElementById('perfilListaWrap');
  if (el) el.innerHTML = perfilListaHTML();
}
function renderPerfilDetalle(a) {
  const grupo = Store.data.Grupos.find(g => g.id === a.grupoId);
  ensureResumenAsistencia(a.grupoId);
  const counts = contarAsistencia(a.id, a.grupoId);
  const totalAsist = counts.Presente + counts.Ausente + counts.Retardo + counts.Justificado;
  const pct = totalAsist ? Math.round((counts.Presente / totalAsist) * 100) : 0;

  const incidencias = Store.merged('Incidencias').filter(r => r.alumnoId === a.id)
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
  const diarioGrupo = Store.merged('Diario').filter(r => r.grupoId === a.grupoId)
    .sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 15);

  const califHtml = grupo ? TRIMESTRES.map(tri => {
    const rubros = Store.encuadre(grupo.asignatura, tri);
    if (rubros.length === 0) return '';
    const calRows = Store.merged('Calificaciones').filter(c => c.alumnoId === a.id && c.trimestre === tri);
    let final = 0;
    const detalle = rubros.map(r => {
      const vals = calRows.filter(c => c.rubro === r.rubro).map(c => Number(c.valor));
      const prom = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      if (vals.length) final += prom * (Number(r.porcentaje) / 100);
      return `${esc(r.rubro)}: ${vals.length ? prom.toFixed(1) : '—'}`;
    }).join(' · ');
    return `<div class="card-flat row between"><span>${esc(tri)}<br><span class="muted" style="font-size:.78rem;">${detalle}</span></span><span class="tag">${final.toFixed(1)}</span></div>`;
  }).join('') : '<p class="muted">Este grupo no tiene asignatura/encuadre configurado.</p>';

  return `
    <button class="btn small ghost no-print" onclick="perfilAlumnoId=null; renderCurrentView();">← Buscar otro alumno</button>
    <button class="btn small secondary no-print" onclick="window.print()">Imprimir / PDF</button>
    <div class="card" style="margin-top:10px;">
      <h2>${esc(a.nombre)}</h2>
      <p class="muted">${grupo ? `${esc(grupo.escuela)} · ${esc(grupo.grado)}${esc(grupo.grupo)} · ${esc(grupo.asignatura)}` : 'Sin grupo'}${a.matricula ? ' · Matrícula: ' + esc(a.matricula) : ''}</p>
    </div>

    <h3>Asistencia</h3>
    <div class="card row between">
      <div><div class="muted">Presente</div><h2 style="color:var(--ok);">${counts.Presente}</h2></div>
      <div><div class="muted">Ausente</div><h2 style="color:var(--danger);">${counts.Ausente}</h2></div>
      <div><div class="muted">Retardo</div><h2 style="color:var(--warn);">${counts.Retardo}</h2></div>
      <div><div class="muted">Justif.</div><h2 style="color:var(--just);">${counts.Justificado}</h2></div>
      <div><div class="muted">%</div><h2>${totalAsist ? pct + '%' : '—'}</h2></div>
    </div>
    ${totalAsist ? `<div class="card chart-box"><canvas id="chartPerfilAsistencia"></canvas></div>` : ''}

    <h3>Calificaciones</h3>
    ${(() => { const diag = Store.merged('Diagnosticos').find(d => d.alumnoId === a.id);
      return diag ? `<div class="card-flat row between"><span>Diagnóstico inicial de ciclo (${esc(diag.fecha)})</span><span class="tag">${diag.puntaje}%</span></div>` : ''; })()}
    ${califHtml}

    <h3>Incidencias (${incidencias.length})</h3>
    ${incidencias.length === 0 ? '<p class="muted">Sin incidencias registradas.</p>' :
      incidencias.map(i => `<div class="diary-entry"><div class="diary-type">${esc(i.tipo)} · ${esc(i.fecha)}</div><div>${esc(i.descripcion)}</div></div>`).join('')}
    <button class="btn small secondary" onclick="abrirNuevaIncidencia('${a.id}','${attrJs(a.nombre)}','${a.grupoId}')">+ Nueva incidencia</button>

    <h3 style="margin-top:16px;">Diario del grupo (últimas ${diarioGrupo.length})</h3>
    ${diarioGrupo.length === 0 ? '<p class="muted">Sin entradas de diario para este grupo.</p>' :
      diarioGrupo.map(d => `<div class="diary-entry"><div class="diary-type">${esc(d.tipo)} · ${esc(d.fecha)}</div><div>${esc(d.texto)}</div></div>`).join('')}

    <h3 style="margin-top:16px;">Notas particulares</h3>
    ${a.notas ? `<div class="card-flat">${esc(a.notas)}</div>` : '<p class="muted">Sin notas.</p>'}
    <button class="btn small ghost" onclick="modalAlumno('${a.id}')">Editar notas</button>
  `;
}

function renderPerfilChart() {
  const el = document.getElementById('chartPerfilAsistencia');
  if (!el || !perfilAlumnoId) return;
  const alumno = Store.data.Alumnos.find(a => a.id === perfilAlumnoId);
  const counts = contarAsistencia(perfilAlumnoId, alumno ? alumno.grupoId : null);
  destroyChart('chartPerfilAsistencia');
  chartInstances.chartPerfilAsistencia = new Chart(el, {
    type: 'doughnut',
    data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: Object.keys(counts).map(k => CHART_COLORS[k]) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

/* ---------------- ENCUADRES ---------------- */function adminEncuadres() {
  const combos = {};
  Store.data.Encuadres.forEach(e => {
    const key = e.asignatura + '||' + e.trimestre;
    (combos[key] = combos[key] || []).push(e);
  });
  const asignaturas = [...new Set(Store.data.Grupos.map(g => g.asignatura))];
  return `
    <button class="btn block secondary" onclick="modalEncuadre()">+ Nuevo encuadre</button>
    <div style="margin-top:10px;">
    ${Object.keys(combos).length === 0 ? `<p class="muted">Sin encuadres. ${asignaturas.length ? 'Asignaturas disponibles: ' + asignaturas.map(esc).join(', ') : ''}</p>` :
      Object.entries(combos).map(([key, rubros]) => {
        const [asig, tri] = key.split('||');
        const total = rubros.reduce((s, r) => s + Number(r.porcentaje), 0);
        return `<div class="card">
          <div class="row between"><strong>${esc(asig)}</strong><span class="muted">${esc(tri)}</span></div>
          <table><tbody>${rubros.map(r => `<tr><td>${esc(r.rubro)}</td><td>${r.porcentaje}%</td></tr>`).join('')}</tbody></table>
          <div class="encuadre-total ${total === 100 ? 'good' : 'bad'}">Total: ${total}%</div>
          <button class="btn small ghost" style="margin-top:6px;" onclick="modalEncuadre('${attrJs(asig)}','${attrJs(tri)}')">Editar</button>
        </div>`;
      }).join('')}
    </div>`;
}
function modalEncuadre(asignatura, trimestre) {
  const rubrosExistentes = asignatura ? Store.data.Encuadres.filter(e => e.asignatura === asignatura && e.trimestre === trimestre) : [];
  openModal(`
    <h2>Encuadre</h2>
    <div class="field"><label>Asignatura</label><input id="eAsignatura" value="${asignatura ? esc(asignatura) : ''}" ${asignatura ? 'readonly' : ''}></div>
    <div class="field"><label>Trimestre</label>
      <select id="eTrimestre" ${trimestre ? 'disabled' : ''}>${TRIMESTRES.map(t => `<option ${trimestre === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <label style="font-size:.8rem; color:var(--ink-soft); font-weight:500;">Rubros</label>
    <div id="rubrosWrap">
      ${(rubrosExistentes.length ? rubrosExistentes : [{ rubro: '', porcentaje: '' }]).map(r => rubroRow(r)).join('')}
    </div>
    <button class="btn small secondary" onclick="agregarRubroRow()">+ Rubro</button>
    <div class="encuadre-total" id="encTotalPreview" style="margin:10px 0;"></div>
    <button class="btn block" onclick="guardarEncuadre('${attrJs(asignatura || '')}')">Guardar encuadre</button>
  `);
  actualizarTotalPreview();
}
function rubroRow(r) {
  return `<div class="rubro-row">
    <input value="${esc(r.rubro || '')}" placeholder="Ej. Examen" oninput="actualizarTotalPreview()">
    <input type="number" value="${r.porcentaje || ''}" placeholder="%" oninput="actualizarTotalPreview()">
    <button class="btn small ghost" onclick="this.parentElement.remove(); actualizarTotalPreview();">✕</button>
  </div>`;
}
function agregarRubroRow() {
  document.getElementById('rubrosWrap').insertAdjacentHTML('beforeend', rubroRow({}));
}
function actualizarTotalPreview() {
  const rows = document.querySelectorAll('#rubrosWrap .rubro-row');
  let total = 0;
  rows.forEach(r => { total += Number(r.querySelectorAll('input')[1].value || 0); });
  const el = document.getElementById('encTotalPreview');
  if (el) { el.textContent = 'Total: ' + total + '%'; el.className = 'encuadre-total ' + (total === 100 ? 'good' : 'bad'); }
}
async function guardarEncuadre(asignaturaExistente) {
  const asignatura = document.getElementById('eAsignatura').value.trim();
  const trimestre = document.getElementById('eTrimestre').value;
  if (!asignatura) { toast('Indica la asignatura'); return; }
  const rows = [];
  document.querySelectorAll('#rubrosWrap .rubro-row').forEach(r => {
    const inputs = r.querySelectorAll('input');
    const rubro = inputs[0].value.trim();
    const porcentaje = Number(inputs[1].value || 0);
    if (rubro) rows.push({ rubro, porcentaje });
  });
  const total = rows.reduce((s, r) => s + r.porcentaje, 0);
  if (total !== 100) { toast('Los porcentajes deben sumar 100% (van en ' + total + '%)'); return; }

  // Reemplazo local inmediato (por si no hay conexión)
  Store.data.Encuadres = Store.data.Encuadres.filter(e => !(e.asignatura === asignatura && e.trimestre === trimestre));
  rows.forEach(r => {
    Store.data.Encuadres.push({ id: uid(), asignatura, trimestre, cicloEscolar: CONFIG.CICLO, rubro: r.rubro, porcentaje: r.porcentaje, activo: true });
  });
  Store.persist();
  closeModal();
  toast('Encuadre guardado');
  renderCurrentView();

  // Reemplazo real en el Sheet: borra las filas viejas de esta asignatura+trimestre
  // (sin importar cuántos intentos anteriores hayan quedado) y escribe las nuevas.
  try {
    await jsonp('replaceEncuadre', { data: JSON.stringify({ asignatura, trimestre, cicloEscolar: CONFIG.CICLO, rubros: rows }) });
    await refreshFromServer();
  } catch (e) { /* se reintentará en el próximo refresh manual */ }
}

/* ---------------- DIAGNÓSTICO INICIAL DE CICLO ---------------- */
let diagGrupoSeleccionado = null;
function adminDiagnostico() {
  const grupos = Store.activeGrupos();
  if (grupos.length === 0) return '<p class="muted">Da de alta un grupo primero.</p>';
  if (!diagGrupoSeleccionado || !grupos.find(g => g.id === diagGrupoSeleccionado)) diagGrupoSeleccionado = grupos[0].id;
  return `
    <div class="card">
      <h3>Diagnóstico inicial de ciclo</h3>
      <p class="muted">No cuenta como calificación — es solo un punto de referencia para ver el avance del alumno durante el ciclo (ej. resultado importado de ZipGrade).</p>
      <div class="field"><label>Grupo</label>
        <select id="diagGrupo" onchange="diagGrupoSeleccionado=this.value; renderDiagnosticoLista();">
          ${grupos.map(g => `<option value="${g.id}" ${g.id === diagGrupoSeleccionado ? 'selected' : ''}>${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}
        </select>
      </div>
      <div id="diagnosticoListaWrap">${diagnosticoListaHTML(diagGrupoSeleccionado)}</div>
    </div>`;
}
function diagnosticoListaHTML(grupoId) {
  const alumnos = Store.alumnosDeGrupo(grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (alumnos.length === 0) return '<p class="muted">Sin alumnos en este grupo.</p>';
  const regs = Store.merged('Diagnosticos').filter(d => d.grupoId === grupoId);
  return alumnos.map(a => {
    const reg = regs.find(d => d.alumnoId === a.id);
    return `<div class="roster-item" data-alumno="${a.id}" data-reg="${reg ? reg.id : ''}">
      <span class="roster-name">${esc(a.nombre)}</span>
      <input type="number" min="0" max="100" step="0.1" value="${reg ? reg.puntaje : ''}" placeholder="%"
        style="width:70px; padding:6px; border:1px solid var(--line); border-radius:6px; text-align:center;"
        onchange="guardarDiagnostico(this)">
    </div>`;
  }).join('');
}
function renderDiagnosticoLista() {
  const grupoId = document.getElementById('diagGrupo').value;
  diagGrupoSeleccionado = grupoId;
  document.getElementById('diagnosticoListaWrap').innerHTML = diagnosticoListaHTML(grupoId);
}
function guardarDiagnostico(input) {
  const item = input.closest('.roster-item');
  const alumnoId = item.dataset.alumno;
  const regId = item.dataset.reg;
  const grupoId = diagGrupoSeleccionado;
  const grupo = Store.data.Grupos.find(g => g.id === grupoId);

  if (input.value === '') {
    if (regId) {
      Store.data.Diagnosticos = Store.data.Diagnosticos.filter(d => d.id !== regId);
      Store.queue.Diagnosticos = Store.queue.Diagnosticos.filter(d => d.id !== regId);
      Store.persist();
      jsonp('deleteDiagnostico', { id: regId }).catch(() => {});
      item.dataset.reg = '';
    }
    return;
  }
  const puntaje = parseFloat(input.value);
  if (isNaN(puntaje) || puntaje < 0 || puntaje > 100) { toast('Puntaje inválido (0–100)'); return; }
  const row = { id: regId || uid(), alumnoId, grupoId, asignatura: grupo.asignatura, puntaje, fecha: todayISO(), notas: '' };
  Store.upsertLocal('Diagnosticos', row);
  Store.enqueue('Diagnosticos', row);
  Store.persist();
  syncPending();
  item.dataset.reg = row.id;
  toast('Guardado');
}

/* ---------------- IMPORTAR (CSV / Excel exportado + OCR con cámara) ---------------- */
function adminImportar() {
  const grupos = Store.activeGrupos();
  return `
    <div class="card">
      <h3>Importar desde CSV/Excel</h3>
      <p class="muted">Exporta tu lista de Excel como CSV (una columna con el nombre completo) y súbela aquí.</p>
      <div class="field"><label>Grupo destino</label>
        <select id="impGrupo">${grupos.map(g => `<option value="${g.id}">${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}</select>
      </div>
      <input type="file" id="impFile" accept=".csv,text/csv" onchange="procesarCSV(this)">
    </div>
    <div class="card">
      <h3>Cargar por cámara (OCR)</h3>
      <p class="muted">Fotografía tu lista física. El texto reconocido siempre se revisa antes de guardarse — el OCR de letra manuscrita no es perfecto.</p>
      <div class="field"><label>Grupo destino</label>
        <select id="ocrGrupo">${grupos.map(g => `<option value="${g.id}">${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}</select>
      </div>
      <input type="file" id="ocrFile" accept="image/*" capture="environment" onchange="procesarOCR(this)">
      <div id="ocrProgress" class="muted" style="margin-top:8px;"></div>
    </div>
    <div class="card">
      <h3>Exportar para ZipGrade</h3>
      <p class="muted">Genera un CSV con el formato que pide ZipGrade para cargar tu lista de alumnos (nombre, apellidos e ID numérico) y así poder escanear e importar sus exámenes de opción múltiple.</p>
      <div class="field"><label>Grupo</label>
        <select id="zgGrupo">${grupos.map(g => `<option value="${g.id}">${esc(g.escuela)} · ${esc(g.grado)}${esc(g.grupo)} · ${esc(g.asignatura)}</option>`).join('')}</select>
      </div>
      <button class="btn block secondary" onclick="exportarZipGrade()">Descargar CSV para ZipGrade</button>
    </div>
  `;
}
function exportarZipGrade() {
  const grupoId = document.getElementById('zgGrupo').value;
  const grupo = Store.data.Grupos.find(g => g.id === grupoId);
  const alumnos = Store.alumnosDeGrupo(grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!grupo || alumnos.length === 0) { toast('Selecciona un grupo con alumnos'); return; }
  const filas = [['ZipGrade ID', 'Apellidos', 'Nombre(s)', 'Clase']];
  alumnos.forEach((a, i) => {
    const partes = a.nombre.trim().split(/\s+/);
    let apellidos, nombres;
    if (partes.length >= 3) { apellidos = partes.slice(0, 2).join(' '); nombres = partes.slice(2).join(' '); }
    else if (partes.length === 2) { apellidos = partes[0]; nombres = partes[1]; }
    else { apellidos = partes[0] || ''; nombres = ''; }
    filas.push([i + 1, apellidos, nombres, `${grupo.grado}${grupo.grupo}`]);
  });
  const csv = filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `zipgrade_${grupo.grado}${grupo.grupo}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV descargado — revisa la separación de nombre/apellido antes de subirlo');
}
function procesarCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const grupoId = document.getElementById('impGrupo').value;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // toma la primera columna de cada línea como nombre (soporta CSV simple o una columna)
    const nombres = lines.map(l => l.split(',')[0].replace(/^"|"$/g, '').trim()).filter(n => n && n.toLowerCase() !== 'nombre');
    mostrarRevisionImportacion(nombres, grupoId);
  };
  reader.readAsText(file, 'UTF-8');
}
async function procesarOCR(input) {
  const file = input.files[0];
  if (!file) return;
  const grupoId = document.getElementById('ocrGrupo').value;
  const prog = document.getElementById('ocrProgress');
  prog.textContent = 'Reconociendo texto de la imagen…';
  try {
    const result = await Tesseract.recognize(file, 'spa', {
      logger: (m) => { if (m.status === 'recognizing text') prog.textContent = 'Reconociendo… ' + Math.round(m.progress * 100) + '%'; }
    });
    const lines = result.data.text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 2);
    prog.textContent = '';
    mostrarRevisionImportacion(lines, grupoId);
  } catch (err) {
    prog.textContent = 'No se pudo procesar la imagen. Intenta con más luz o mejor encuadre.';
  }
}
function mostrarRevisionImportacion(nombres, grupoId) {
  if (nombres.length === 0) { toast('No se detectaron nombres'); return; }
  openModal(`
    <h2>Revisa antes de guardar</h2>
    <p class="muted">Corrige o elimina lo que no se haya leído bien. Nada se guarda hasta que confirmes.</p>
    <div id="revisionList">
      ${nombres.map((n, i) => `<div class="row" style="margin-bottom:6px;">
        <input value="${esc(n)}" data-i="${i}" style="flex:1; padding:8px; border:1px solid var(--line); border-radius:8px;">
        <button class="btn small ghost" onclick="this.parentElement.remove()">✕</button>
      </div>`).join('')}
    </div>
    <button class="btn block" style="margin-top:10px;" onclick="confirmarImportacion('${grupoId}')">Guardar alumnos confirmados</button>
  `);
}
function confirmarImportacion(grupoId) {
  const inputs = document.querySelectorAll('#revisionList input');
  const rows = [];
  inputs.forEach(inp => {
    const nombre = inp.value.trim();
    if (nombre) rows.push({ id: uid(), nombre, grupoId, matricula: '', activo: true, historialGrupos: '[]' });
  });
  rows.forEach(r => { Store.upsertLocal('Alumnos', r); Store.enqueue('Alumnos', r); });
  Store.persist();
  closeModal();
  toast(rows.length + ' alumnos agregados');
  syncPending();
  renderCurrentView();
}

/* ---------------- CONEXIÓN (URL del Apps Script) ---------------- */
function adminConfig() {
  const url = localStorage.getItem('cd_api_url') || CONFIG.API_URL;
  return `
    <div class="card-flat muted" style="text-align:center;">Versión de la app: <strong>${CONFIG.APP_VERSION}</strong></div>
    <div class="card">
      <h3>Conexión con Google Sheets</h3>
      <p class="muted">Pega la URL /exec de tu implementación de Apps Script.</p>
      <div class="field"><input id="cfgUrl" value="${url.indexOf('PEGA_AQUI') === 0 ? '' : esc(url)}" placeholder="https://script.google.com/macros/s/.../exec"></div>
      <button class="btn block" onclick="guardarConfigUrl()">Guardar y probar conexión</button>
    </div>
  `;
}
function guardarConfigUrl() {
  const url = document.getElementById('cfgUrl').value.trim();
  if (!url) { toast('Pega la URL primero'); return; }
  CONFIG.API_URL = url;
  localStorage.setItem('cd_api_url', url);
  toast('Probando conexión…');
  refreshFromServer();
}
