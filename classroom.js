/* =================================================================
   CLASE — Selector aleatorio, Equipos, Tómbola, Dados
   Usa la lista de alumnos del grupo ya seleccionado arriba (ctx.grupoId).
   Todo corre en el dispositivo, sin tocar el Sheet.
   ================================================================= */

let claseTab = 'selector';
let selectorExcluidos = {}; // { grupoId: Set(alumnoId) }
let tombolaPool = {};       // { grupoId: [alumnoId,...] restantes }

function alumnosGrupoActivo() {
  return ctx.grupoId ? Store.alumnosDeGrupo(ctx.grupoId).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
}

function viewClase() {
  if (!ctx.grupoId) return `<div class="empty"><p class="muted">Selecciona un grupo arriba para usar estas herramientas.</p></div>`;
  const tabs = [
    { id: 'selector', label: 'Selector' },
    { id: 'equipos', label: 'Equipos' },
    { id: 'tombola', label: 'Tómbola' },
    { id: 'dados', label: 'Dados' }
  ];
  const fns = { selector: claseSelector, equipos: claseEquipos, tombola: claseTombola, dados: claseDados };
  return `
    <div class="chip-list">
      ${tabs.map(t => `<span class="chip ${claseTab === t.id ? 'active' : ''}" onclick="claseTab='${t.id}'; renderCurrentView();">${t.label}</span>`).join('')}
    </div>
    ${fns[claseTab]()}
  `;
}

/* ---------------- SELECTOR ALEATORIO ---------------- */
function claseSelector() {
  const alumnos = alumnosGrupoActivo();
  if (!selectorExcluidos[ctx.grupoId]) selectorExcluidos[ctx.grupoId] = new Set();
  const excluidos = selectorExcluidos[ctx.grupoId];
  const restantes = alumnos.length - excluidos.size;
  return `
    <div class="card">
      <div class="field"><label>¿Cuántos alumnos elegir?</label><input type="number" id="selCuantos" value="1" min="1" max="${alumnos.length}"></div>
      <label style="display:flex; align-items:center; gap:8px; font-size:.9rem; margin:10px 0;">
        <input type="checkbox" id="selPermitirRepetir" style="width:auto;"> Permitir que se repitan (no descarta de la lista)
      </label>
      <button class="btn block" onclick="elegirAlAzar()">Elegir</button>
      <div class="resultado-box" id="resultadoSelector" style="margin-top:14px; text-align:center; padding:18px; border-radius:10px; background:var(--accent-soft); min-height:40px; font-size:1.3rem; font-weight:700; color:var(--accent);"></div>
      <p class="muted" id="infoExcluidos" style="text-align:center; margin-top:8px;">${excluidos.size ? `Ya seleccionados: ${excluidos.size} / ${alumnos.length} · Restan: ${restantes}` : ''}</p>
      <button class="btn block ghost" style="margin-top:8px;" onclick="reiniciarSelector()">Reiniciar lista de seleccionados</button>
    </div>
  `;
}
function elegirAlAzar() {
  const alumnos = alumnosGrupoActivo();
  const cuantos = Math.max(1, parseInt(document.getElementById('selCuantos').value) || 1);
  const permitirRepetir = document.getElementById('selPermitirRepetir').checked;
  const excluidos = selectorExcluidos[ctx.grupoId];

  let pool = alumnos;
  if (!permitirRepetir) {
    pool = alumnos.filter(a => !excluidos.has(a.id));
    if (pool.length === 0) {
      document.getElementById('resultadoSelector').innerHTML = '¡Ya salieron todos los nombres! Reinicia la lista para volver a elegir.';
      return;
    }
  }
  const poolCopia = [...pool];
  const elegidos = [];
  for (let i = 0; i < cuantos && poolCopia.length > 0; i++) {
    const idx = Math.floor(Math.random() * poolCopia.length);
    elegidos.push(poolCopia[idx]);
    poolCopia.splice(idx, 1);
  }
  if (!permitirRepetir) elegidos.forEach(a => excluidos.add(a.id));

  document.getElementById('resultadoSelector').textContent = elegidos.map(a => a.nombre).join(', ');
  const restantes = alumnos.length - excluidos.size;
  const infoEl = document.getElementById('infoExcluidos');
  if (permitirRepetir) { infoEl.textContent = ''; }
  else if (restantes === 0) { infoEl.textContent = '¡Se agotaron los nombres! Dale "Reiniciar" para volver a elegir desde el principio.'; }
  else { infoEl.textContent = `Ya seleccionados: ${excluidos.size} / ${alumnos.length} · Restan: ${restantes}`; }
}
function reiniciarSelector() {
  selectorExcluidos[ctx.grupoId] = new Set();
  renderCurrentView();
  toast('Lista de seleccionados reiniciada');
}

/* ---------------- EQUIPOS ---------------- */
function claseEquipos() {
  const alumnos = alumnosGrupoActivo();
  return `
    <div class="card">
      <p class="muted">${alumnos.length} alumnos en el grupo</p>
      <div class="field"><label>Formar equipos por…</label>
        <select id="eqTipo">
          <option value="cantidad">Número de equipos</option>
          <option value="tamano">Integrantes por equipo</option>
        </select>
      </div>
      <div class="field"><label>Valor</label><input type="number" id="eqValor" value="4" min="1"></div>
      <button class="btn block" onclick="generarEquipos()">Formar equipos</button>
      <div class="equipos-grid" id="equiposResultado" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:14px;"></div>
    </div>
  `;
}
function generarEquipos() {
  const alumnos = alumnosGrupoActivo();
  if (alumnos.length === 0) { toast('No hay alumnos en este grupo'); return; }
  const tipo = document.getElementById('eqTipo').value;
  const valor = Math.max(1, parseInt(document.getElementById('eqValor').value) || 1);
  const mezclados = [...alumnos];
  for (let i = mezclados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
  }
  let numEquipos = tipo === 'cantidad' ? valor : Math.ceil(mezclados.length / valor);
  numEquipos = Math.max(1, Math.min(numEquipos, mezclados.length));
  const equipos = Array.from({ length: numEquipos }, () => []);
  mezclados.forEach((a, i) => equipos[i % numEquipos].push(a.nombre));
  document.getElementById('equiposResultado').innerHTML = equipos.map((eq, i) => `
    <div class="card-flat">
      <strong>Equipo ${i + 1}</strong> <span class="muted">(${eq.length})</span>
      <ul style="margin:8px 0 0; padding-left:18px; font-size:.88rem;">${eq.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`).join('');
}

/* ---------------- TÓMBOLA ---------------- */
function claseTombola() {
  const alumnos = alumnosGrupoActivo();
  if (!tombolaPool[ctx.grupoId]) tombolaPool[ctx.grupoId] = alumnos.map(a => a.id);
  const restantes = tombolaPool[ctx.grupoId].length;
  return `
    <div class="card" style="text-align:center;">
      <label style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:.9rem; margin-bottom:14px;">
        <input type="checkbox" id="tomQuitar" checked style="width:auto;"> Quitar de la tómbola al salir
      </label>
      <div class="bombo" id="bombo" style="width:180px;height:180px;border-radius:50%;background:radial-gradient(circle at 35% 30%, var(--accent-soft), var(--paper-raised) 70%); border:5px solid var(--accent); display:flex; align-items:center; justify-content:center; margin:0 auto;">
        <span style="font-size:.85rem; color:var(--ink-soft);">🎲</span>
      </div>
      <div class="tombola-nombre" id="tombolaNombre" style="margin-top:16px; font-size:1.5rem; font-weight:700; min-height:36px; color:var(--accent);"></div>
      <p class="muted" id="tombolaRestantes" style="margin-top:6px;">Quedan en la tómbola: ${restantes} / ${alumnos.length}</p>
      <div class="row" style="justify-content:center; margin-top:10px;">
        <button class="btn" onclick="girarTombola()">Girar</button>
        <button class="btn ghost" onclick="reiniciarTombola()">Reiniciar</button>
      </div>
    </div>
  `;
}
function girarTombola() {
  const alumnos = alumnosGrupoActivo();
  if (!tombolaPool[ctx.grupoId] || tombolaPool[ctx.grupoId].length === 0) tombolaPool[ctx.grupoId] = alumnos.map(a => a.id);
  const pool = tombolaPool[ctx.grupoId];
  if (pool.length === 0) { document.getElementById('tombolaNombre').textContent = 'La tómbola está vacía.'; return; }
  const quitar = document.getElementById('tomQuitar').checked;
  const nombreEl = document.getElementById('tombolaNombre');
  const nombreDe = (id) => (Store.data.Alumnos.find(a => a.id === id) || {}).nombre || '';
  let vueltas = 0;
  const maxVueltas = 16;
  const intervalo = setInterval(() => {
    const idxTemp = Math.floor(Math.random() * pool.length);
    nombreEl.textContent = nombreDe(pool[idxTemp]);
    vueltas++;
    if (vueltas >= maxVueltas) {
      clearInterval(intervalo);
      const idxFinal = Math.floor(Math.random() * pool.length);
      const ganadorId = pool[idxFinal];
      nombreEl.textContent = '🎉 ' + nombreDe(ganadorId);
      if (quitar) pool.splice(idxFinal, 1);
      const el = document.getElementById('tombolaRestantes');
      if (el) el.textContent = `Quedan en la tómbola: ${pool.length} / ${alumnos.length}`;
    }
  }, 90);
}
function reiniciarTombola() {
  const alumnos = alumnosGrupoActivo();
  tombolaPool[ctx.grupoId] = alumnos.map(a => a.id);
  renderCurrentView();
}

/* ---------------- DADOS ---------------- */
function claseDados() {
  const caras = [4, 6, 8, 10, 12, 20];
  return `
    <div class="card">
      <label style="font-size:.8rem; color:var(--ink-soft); font-weight:500;">Tipo de dado</label>
      <div class="chip-list" id="dadoTipos" style="margin-top:6px;">
        ${caras.map((c, i) => `<span class="chip ${i === 1 ? 'active' : ''}" data-caras="${c}" onclick="this.classList.toggle('active')">D${c}</span>`).join('')}
      </div>
      <div class="field" style="margin-top:10px;"><label>Cantidad por tipo seleccionado</label><input type="number" id="dadoCantidad" value="1" min="1" max="12"></div>
      <button class="btn block" onclick="lanzarDados()">Lanzar</button>
      <div class="row" id="dadosResultado" style="flex-wrap:wrap; gap:10px; justify-content:center; margin-top:16px;"></div>
      <div class="muted" id="dadoSuma" style="text-align:center; margin-top:10px; font-weight:700; font-size:1.1rem;"></div>
    </div>
  `;
}
function lanzarDados() {
  const seleccionados = [...document.querySelectorAll('#dadoTipos .chip.active')].map(c => parseInt(c.dataset.caras));
  const cantidad = Math.max(1, parseInt(document.getElementById('dadoCantidad').value) || 1);
  if (seleccionados.length === 0) { toast('Selecciona al menos un dado'); return; }
  let suma = 0;
  let html = '';
  seleccionados.forEach(caras => {
    for (let i = 0; i < cantidad; i++) {
      const r = Math.floor(Math.random() * caras) + 1;
      suma += r;
      html += `<div class="card-flat" style="min-width:56px; text-align:center; padding:12px 8px;"><strong style="font-size:1.2rem;">${r}</strong><br><span class="muted" style="font-size:.7rem;">D${caras}</span></div>`;
    }
  });
  document.getElementById('dadosResultado').innerHTML = html;
  document.getElementById('dadoSuma').textContent = 'Suma total: ' + suma;
}
