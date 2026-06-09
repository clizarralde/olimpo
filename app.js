// ===== Olimpo · App de seguimiento de rutina =====
// PWA 100% cliente. Estado en localStorage. Sin dependencias.

const LS = {
  profile: 'olimpo:profile',
  catalog: 'olimpo:catalog',
  routine: 'olimpo:routine',          // legacy (rutina única) — sólo para migración
  routines: 'olimpo:routines',
  activeRoutine: 'olimpo:activeRoutine',
  sessions: 'olimpo:sessions',
  active: 'olimpo:active',
};

const SEED_VERSION = 3; // subir para inyectar ejercicios/cambios nuevos a usuarios existentes

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_SHORT = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const GROUPS = {
  cardio: 'Cardio',
  pectorales: 'Pectorales',
  dorsales: 'Espalda',
  hombros: 'Hombros',
  triceps: 'Tríceps',
  biceps: 'Bíceps',
  piernas: 'Piernas',
  abdominales: 'Abdominales',
};
const GROUP_ORDER = Object.keys(GROUPS);
const SUBGROUPS = {
  'cuadriceps-gluteos': 'Cuádriceps / Glúteos',
  'isquiotibiales': 'Isquiotibiales',
  'cadena-posterior': 'Cadena posterior',
  'gemelos': 'Gemelos',
};
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none"><rect width="64" height="64" rx="12" fill="%23f0f2f5"/><g stroke="%239aa1ab" stroke-width="3" stroke-linecap="round"><path d="M16 32h32M22 24v16M42 24v16M14 28v8M50 28v8"/></g></svg>'
);

// ---------- Estado ----------
const state = {
  profile: null,
  catalog: [],       // [Exercise]
  routines: [],      // [{id,name,days}]
  activeRoutineId: null,
  sessions: [],      // [Session]
  active: null,      // {date, dayKey, progress:{id:{setsDone,completed}}}
  view: 'hoy',
};

// Rutina activa (objeto vivo dentro de state.routines)
function activeRoutine() {
  return state.routines.find((r) => r.id === state.activeRoutineId) || state.routines[0];
}
function genRoutineId() {
  let n = state.routines.length + 1, id;
  do { id = 'rutina-' + n++; } while (state.routines.some((r) => r.id === id));
  return id;
}
function blankDays() {
  const d = {};
  for (const k of DAYS) d[k] = { label: 'Descanso', exercises: [] };
  return d;
}

const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function save() {
  write(LS.profile, state.profile);
  write(LS.catalog, state.catalog);
  write(LS.routines, state.routines);
  write(LS.activeRoutine, state.activeRoutineId);
  write(LS.sessions, state.sessions);
  write(LS.active, state.active);
}

async function fetchSeed(file) {
  const res = await fetch(file, { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar ' + file);
  return res.json();
}

async function init() {
  state.profile = read(LS.profile, null) || { name: 'Carlos', weightKg: 80, restSecondsDefault: 60, secondsPerRepDefault: 3 };
  if (!state.profile.imageStyle) state.profile.imageStyle = 'foto';
  if (!state.profile.imageGender) state.profile.imageGender = 'm';
  state.catalog = read(LS.catalog, null);
  state.sessions = read(LS.sessions, []);
  state.active = read(LS.active, null);

  // ----- Catálogo (con merge de ejercicios nuevos del seed) -----
  const catSeed = await fetchSeed('data/catalog.seed.json');
  if (!state.catalog) {
    state.catalog = catSeed.exercises;
  } else if ((state.profile.seedVersion || 1) < SEED_VERSION) {
    const byIdLocal = new Map(state.catalog.map((e) => [e.id, e]));
    for (const e of catSeed.exercises) {
      const local = byIdLocal.get(e.id);
      if (!local) state.catalog.push(e);
      else if (!local.image && e.image) local.image = e.image; // completar fotos faltantes
    }
  }

  // ----- Rutinas (migración desde rutina única) -----
  state.routines = read(LS.routines, null);
  if (!state.routines) {
    const legacy = read(LS.routine, null);
    state.routines = legacy ? [legacy] : [await fetchSeed('data/routine.seed.json')];
  }
  state.activeRoutineId = read(LS.activeRoutine, null) || state.routines[0].id;
  if (!state.routines.find((r) => r.id === state.activeRoutineId)) state.activeRoutineId = state.routines[0].id;

  // ----- Migración v2: calentamiento + abdominales en rutinas existentes -----
  if ((state.profile.seedVersion || 1) < SEED_VERSION) {
    state.routines.forEach(migrateRoutineV2);
    state.profile.seedVersion = SEED_VERSION;
  }

  save();
  bindTabs();
  setView('hoy');
}

// Inserta entrada en calor al inicio y un abdominal al final de cada día de entrenamiento
function migrateRoutineV2(r) {
  const absByDay = { lunes: 'abs-banco', miercoles: 'abs-inclinado', viernes: 'abs-rodillas' };
  for (const d of DAYS) {
    const day = r.days[d];
    if (!day || !day.exercises.length) continue;
    if (!day.exercises.some((i) => i.exerciseId === 'entrada-calor')) {
      day.exercises.unshift({ exerciseId: 'entrada-calor', sets: 1, reps: 1 });
    }
    const hasAbs = day.exercises.some((i) => { const ex = byId(i.exerciseId); return ex && ex.muscleGroup === 'abdominales'; });
    if (!hasAbs) {
      const absId = absByDay[d] || 'abs-banco';
      if (byId(absId)) day.exercises.push({ exerciseId: absId, sets: 3, reps: 15 });
    }
  }
}

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const byId = (id) => state.catalog.find((e) => e.id === id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const weekdayKey = () => DAYS[(new Date().getDay() + 6) % 7]; // getDay: 0=Dom
const round = (n) => Math.round(n);

function imgTag(src, cls) {
  return `<img class="${cls}" src="${esc(src || PLACEHOLDER)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'" alt="">`;
}

// Imagen de un ejercicio según estilo/género elegido, con fallback: estilo → foto → placeholder
function exImageSrc(ex) {
  const st = (state.profile && state.profile.imageStyle) || 'foto';
  if (st === 'foto' || !ex) return (ex && ex.image) ? ex.image : PLACEHOLDER;
  const g = (state.profile && state.profile.imageGender) || 'm';
  return `images/${st}/${g}/${ex.id}.png`;
}
function exImg(ex, cls) {
  const styled = exImageSrc(ex);
  const photo = (ex && ex.image) ? ex.image : PLACEHOLDER;
  return `<img class="${cls}" src="${esc(styled)}" loading="lazy" data-photo="${esc(photo)}"
    onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=this.dataset.photo;}else{this.onerror=null;this.src='${PLACEHOLDER}';}" alt="">`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- Calorías ----------
function secondsPerSet(ex, reps) {
  const spr = ex.secondsPerRep || state.profile.secondsPerRepDefault || 3;
  const rest = state.profile.restSecondsDefault ?? 60;
  return reps * spr + rest;
}
function exerciseSeconds(ex, setsDone, reps) {
  if (!ex || setsDone <= 0) return 0;
  if (ex.durationMin) return ex.durationMin * 60;            // ejercicio por tiempo (cardio)
  return setsDone * secondsPerSet(ex, reps);
}
function exerciseCalories(ex, setsDone, reps) {
  if (!ex || setsDone <= 0) return 0;
  return ex.met * state.profile.weightKg * (exerciseSeconds(ex, setsDone, reps) / 3600);
}

// ---------- Active session (Hoy) ----------
function ensureActive(dayKey) {
  const date = todayISO();
  if (!state.active || state.active.date !== date) {
    state.active = { date, dayKey, progress: {} };
  } else if (dayKey && state.active.dayKey !== dayKey) {
    state.active.dayKey = dayKey;
    state.active.progress = {};
  }
  return state.active;
}

function activeTotals() {
  const a = state.active;
  const day = activeRoutine().days[a.dayKey];
  let cal = 0, secs = 0, doneSets = 0, totalSets = 0, doneEx = 0;
  for (const item of day.exercises) {
    const ex = byId(item.exerciseId);
    const p = a.progress[item.exerciseId] || { setsDone: 0 };
    cal += exerciseCalories(ex, p.setsDone, item.reps);
    secs += exerciseSeconds(ex, p.setsDone, item.reps);
    doneSets += Math.min(p.setsDone, item.sets);
    totalSets += item.sets;
    if (p.setsDone >= item.sets && item.sets > 0) doneEx++;
  }
  return { cal, min: secs / 60, doneSets, totalSets, doneEx, totalEx: day.exercises.length };
}

// ===================================================================
//  VISTAS
// ===================================================================
function setView(v) {
  state.view = v;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === v));
  const el = $('#view');
  ({ hoy: renderHoy, rutina: renderRutina, catalogo: renderCatalogo, historial: renderHistorial, perfil: renderPerfil }[v])(el);
  updateHeader();
  window.scrollTo(0, 0);
}

function updateHeader() {
  const sub = $('#headerSub');
  const pill = $('#headerCal');
  if (state.view === 'hoy' && state.active) {
    const t = activeTotals();
    pill.hidden = false;
    $('#headerCalNum').textContent = round(t.cal);
    sub.textContent = 'Sesión de hoy';
  } else {
    pill.hidden = true;
    sub.textContent = { rutina: 'Editor de rutina', catalogo: 'Catálogo de ejercicios', historial: 'Tu progreso', perfil: 'Ajustes' }[state.view] || 'Seguimiento de rutina';
  }
}

// ---------- HOY ----------
function renderHoy(root) {
  const r = activeRoutine();
  // Sólo los días con ejercicios planificados (los de descanso quedan ocultos)
  const trainingDays = DAYS.filter((d) => r.days[d].exercises.length > 0);

  // Día por defecto: hoy si tiene ejercicios; si no, el primer día planificado
  let sel;
  if (state.active && state.active.date === todayISO() && r.days[state.active.dayKey] && r.days[state.active.dayKey].exercises.length) {
    sel = state.active.dayKey;
  } else {
    const wd = weekdayKey();
    sel = r.days[wd].exercises.length ? wd : (trainingDays[0] || wd);
  }
  ensureActive(sel);
  const dayKey = state.active.dayKey;
  const day = r.days[dayKey];

  const chips = trainingDays.map((d) => `
    <button class="daychip ${d === dayKey ? 'is-active' : ''}" data-day="${d}">
      <span class="daychip__day">${DAY_SHORT[d]}</span>
      <span class="daychip__lbl">${esc(r.days[d].label)}</span>
    </button>`).join('');

  if (!day.exercises.length) {
    root.innerHTML = `${chips ? `<div class="daybar">${chips}</div>` : ''}
      <div class="empty"><div class="empty__icon">🗓️</div><p>No tenés días con ejercicios planificados.<br>Configurá tu rutina para empezar.</p>
      <div style="margin-top:16px"><button class="btn btn--sm" data-goto="rutina">Configurar rutina</button></div></div>`;
    bindDayChips(root);
    root.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => setView(b.dataset.goto));
    return;
  }

  const n = day.exercises.length;
  if (state.active.cursor == null) state.active.cursor = 0;
  state.active.cursor = Math.max(0, Math.min(state.active.cursor, n));

  const slides = day.exercises.map((item, i) => exerciseSlide(item, i, n)).join('') + finishSlide(n);
  const dots = Array.from({ length: n + 1 }, (_, i) =>
    `<button class="pdot ${i === state.active.cursor ? 'is-cur' : ''} ${i < n && completedItem(day.exercises[i]) ? 'is-done' : ''}" data-dot="${i}"></button>`).join('');

  root.innerHTML = `
    <div class="daybar">${chips}</div>
    <div class="pdots">${dots}</div>
    <div class="pviewport" id="pvp">${slides}</div>`;

  bindDayChips(root);
  bindPlayer(root, day);
}

// ----- Player: un ejercicio por pantalla, swipe izq/der -----
function completedItem(item) {
  const p = state.active.progress[item.exerciseId] || { setsDone: 0 };
  return item.sets > 0 && p.setsDone >= item.sets;
}

function bindDayChips(root) {
  root.querySelectorAll('.daychip').forEach((c) => c.onclick = () => {
    const d = c.dataset.day;
    if (d === state.active.dayKey) return;
    const hasProgress = Object.values(state.active.progress).some((p) => p.setsDone > 0);
    if (hasProgress && !confirm('Cambiar de día reinicia el progreso de hoy. ¿Continuar?')) return;
    ensureActive(d); state.active.cursor = 0; save(); renderHoy(root); updateHeader();
  });
}

function exerciseSlide(item, i, n) {
  const ex = byId(item.exerciseId);
  const p = state.active.progress[item.exerciseId] || { setsDone: 0 };
  const done = completedItem(item);
  const cal = round(exerciseCalories(ex, p.setsDone, item.reps));
  const isTime = ex && ex.durationMin;
  const target = isTime
    ? `⏱️ <b>${ex.durationMin} min</b>`
    : `<b>${item.sets}</b> series × <b>${item.reps}</b> reps`;
  const setdots = isTime ? '' : Array.from({ length: item.sets }, (_, s) => `<span class="sdot ${s < p.setsDone ? 'is-on' : ''}"></span>`).join('');
  const control = isTime
    ? `<button class="btn ${done ? 'btn--ghost' : 'btn--primary'} ecard__cta" data-act="toggle">${done ? '↺ Marcar pendiente' : '✓ Marcar hecho'}</button>`
    : `<div class="setdots">${setdots}</div>
       <div class="ecard__stepper">
         <button class="stepbtn" data-act="minus">−</button>
         <div class="ecard__count"><span class="ecard__countval">${p.setsDone}</span><small>/${item.sets} series</small></div>
         <button class="stepbtn" data-act="plus">+</button>
       </div>`;
  return `
    <section class="pslide" data-slide="${i}" data-ex="${esc(item.exerciseId)}">
      <div class="ecard ${done ? 'is-done' : ''}">
        <div class="ecard__head">
          <span class="ecard__group">${esc(ex ? (GROUPS[ex.muscleGroup] || ex.muscleGroup) : '')}</span>
          <span class="ecard__idx">${i + 1} / ${n}</span>
        </div>
        ${exImg(ex, 'ecard__img')}
        <h2 class="ecard__name">${esc(ex ? ex.name : item.exerciseId)}</h2>
        <div class="ecard__target">${target}</div>
        ${control}
        <div class="ecard__cal">🔥 <b>${cal}</b> kcal</div>
        <button class="btn btn--primary ecard__cta" data-cta>${done ? 'Siguiente ›' : '✓ Completar'}</button>
      </div>
    </section>`;
}

function finishSlide(n) {
  const t = activeTotals();
  return `
    <section class="pslide pslide--finish" data-slide="${n}">
      <div class="ecard ecard--finish">
        <div class="ecard__big">🏁</div>
        <h2 class="ecard__name">Resumen del día</h2>
        <div class="summary" style="margin:10px 0 6px">
          <div class="card stat stat--accent"><div class="stat__num" id="fCal">${round(t.cal)}<small> kcal</small></div><div class="stat__label">Quemadas</div></div>
          <div class="card stat"><div class="stat__num" id="fEx">${t.doneEx}<small>/${t.totalEx}</small></div><div class="stat__label">Ejercicios</div></div>
          <div class="card stat"><div class="stat__num" id="fMin">${round(t.min)}<small> min</small></div><div class="stat__label">Tiempo</div></div>
        </div>
        <button class="btn btn--primary ecard__cta" id="btnFinish">✅ Finalizar día</button>
        <button class="btn btn--ghost ecard__cta" data-back style="margin-top:10px">‹ Volver a ejercicios</button>
      </div>
    </section>`;
}

let _playerResize = null;

function bindPlayer(root, day) {
  const n = day.exercises.length;
  const vp = root.querySelector('#pvp');
  const W = () => vp.clientWidth || 1;
  const goTo = (i, smooth = true) => {
    i = Math.max(0, Math.min(i, n));
    vp.scrollTo({ left: i * W(), behavior: smooth ? 'smooth' : 'auto' });
  };

  requestAnimationFrame(() => { vp.scrollLeft = state.active.cursor * W(); });

  let raf = null;
  vp.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const i = Math.round(vp.scrollLeft / W());
      if (i !== state.active.cursor) { state.active.cursor = i; save(); updateDots(root, day); }
      if (i === n) refreshFinish(root);
      updateHeaderCal();
    });
  });

  root.querySelectorAll('.pdot').forEach((d) => d.onclick = () => goTo(parseInt(d.dataset.dot)));

  const afterChange = (idx) => { rerenderSlide(idx); updateDots(root, day); updateHeaderCal(); refreshFinish(root); };
  function rerenderSlide(idx) {
    const sl = root.querySelector(`.pslide[data-slide="${idx}"]`);
    if (!sl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = exerciseSlide(day.exercises[idx], idx, n).trim();
    sl.replaceWith(tmp.firstChild);
    wireSlide(root.querySelector(`.pslide[data-slide="${idx}"]`));
  }
  function wireSlide(sl) {
    const id = sl.dataset.ex;
    const idx = parseInt(sl.dataset.slide);
    const item = day.exercises[idx];
    const p = state.active.progress[id] || (state.active.progress[id] = { setsDone: 0, completed: false });
    sl.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'plus') p.setsDone = Math.min(item.sets, p.setsDone + 1);
      else if (a === 'minus') p.setsDone = Math.max(0, p.setsDone - 1);
      else if (a === 'toggle') p.setsDone = completedItem(item) ? 0 : item.sets;
      p.completed = p.setsDone >= item.sets;
      save(); afterChange(idx);
    });
    sl.querySelector('[data-cta]').onclick = () => {
      if (!completedItem(item)) { p.setsDone = item.sets; p.completed = true; save(); afterChange(idx); }
      goTo(idx + 1);
    };
  }
  root.querySelectorAll('.pslide[data-ex]').forEach(wireSlide);

  const fin = root.querySelector('#btnFinish');
  if (fin) fin.onclick = finishDay;
  const back = root.querySelector('[data-back]');
  if (back) back.onclick = () => goTo(n - 1);

  _playerResize = () => { vp.scrollLeft = state.active.cursor * W(); };
}

function updateDots(root, day) {
  const n = day.exercises.length;
  root.querySelectorAll('.pdot').forEach((d, i) => {
    d.classList.toggle('is-cur', i === state.active.cursor);
    d.classList.toggle('is-done', i < n && completedItem(day.exercises[i]));
  });
}

function refreshFinish(root) {
  const c = root.querySelector('#fCal');
  if (!c) return;
  const t = activeTotals();
  c.innerHTML = `${round(t.cal)}<small> kcal</small>`;
  root.querySelector('#fEx').innerHTML = `${t.doneEx}<small>/${t.totalEx}</small>`;
  root.querySelector('#fMin').innerHTML = `${round(t.min)}<small> min</small>`;
}

function updateHeaderCal() {
  if (state.view === 'hoy' && state.active) {
    const el = $('#headerCalNum');
    if (el) el.textContent = round(activeTotals().cal);
  }
}

function finishDay() {
  const a = state.active;
  const r = activeRoutine();
  const day = r.days[a.dayKey];
  const t = activeTotals();
  if (t.doneSets === 0) { toast('Marcá al menos una serie 💪'); return; }

  const entries = day.exercises.map((item) => {
    const p = a.progress[item.exerciseId] || { setsDone: 0 };
    return { exerciseId: item.exerciseId, sets: item.sets, reps: item.reps, setsDone: p.setsDone, completed: p.setsDone >= item.sets };
  });

  const session = {
    date: a.date, dayKey: a.dayKey, routineId: r.id, label: day.label,
    weightKg: state.profile.weightKg, entries,
    caloriesBurned: round(t.cal), durationMin: round(t.min),
  };
  // reemplazar si ya hay una sesión hoy
  state.sessions = state.sessions.filter((s) => s.date !== session.date);
  state.sessions.push(session);
  state.active = null;
  save();
  showSummaryModal(session, t);
}

function showSummaryModal(session, t) {
  openModal(`
    <h3 class="modal__title">🎉 ¡Día completado!</h3>
    <div class="summary" style="margin-top:0">
      <div class="card stat stat--accent"><div class="stat__num">${session.caloriesBurned}<small> kcal</small></div><div class="stat__label">Quemadas</div></div>
      <div class="card stat"><div class="stat__num">${t.doneEx}<small>/${t.totalEx}</small></div><div class="stat__label">Ejercicios</div></div>
      <div class="card stat"><div class="stat__num">${session.durationMin}<small> min</small></div><div class="stat__label">Duración</div></div>
    </div>
    <p style="color:var(--text-soft);font-size:14px;text-align:center;margin:6px 0 4px">${esc(GROUPS_label(session))}</p>
    <button class="btn btn--primary" data-close style="margin-top:8px">Listo</button>
  `, () => setView('hoy'));
}
function GROUPS_label(session) { return `${esc(session.label)} · ${new Date(session.date + 'T00:00').getDate()} ${MONTHS[new Date(session.date + 'T00:00').getMonth()]}`; }

// ---------- RUTINA ----------
function switchRoutine(id) {
  if (!state.routines.some((x) => x.id === id)) return;
  state.activeRoutineId = id;
  state.active = null; // sesión fresca para la nueva rutina
  save();
}

function renderRutina(root) {
  const r = activeRoutine();
  const opts = state.routines.map((x) => `<option value="${esc(x.id)}" ${x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <div class="field"><label>Rutina activa</label>
        <select class="input" id="rPick">${opts}</select></div>
      <div class="field"><label>Nombre</label>
        <input class="input" id="rName" value="${esc(r.name)}"></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" id="rNew">＋ Nueva</button>
        <button class="btn btn--ghost btn--sm" id="rDup">⧉ Duplicar</button>
        <button class="btn btn--danger btn--sm" id="rDel" ${state.routines.length <= 1 ? 'disabled' : ''}>🗑️ Eliminar</button>
      </div>
    </div>
    <div class="section-title">Días</div>
    ${DAYS.map((d) => routineDayCard(d)).join('')}
    <div class="btn-row">
      <button class="btn btn--ghost" id="btnResetRoutine">↺ Restablecer a rutina Olimpo</button>
    </div>
  `;
  $('#rPick', root).onchange = (e) => { switchRoutine(e.target.value); renderRutina(root); };
  $('#rName', root).onchange = (e) => { r.name = e.target.value.trim() || 'Mi rutina'; save(); renderRutina(root); };
  $('#rNew', root).onclick = () => {
    const nr = { id: genRoutineId(), name: 'Nueva rutina', days: blankDays() };
    state.routines.push(nr); switchRoutine(nr.id); renderRutina(root); toast('Rutina nueva creada');
  };
  $('#rDup', root).onclick = () => {
    const copy = JSON.parse(JSON.stringify(r)); copy.id = genRoutineId(); copy.name = r.name + ' (copia)';
    state.routines.push(copy); switchRoutine(copy.id); renderRutina(root); toast('Rutina duplicada');
  };
  $('#rDel', root).onclick = () => {
    if (state.routines.length <= 1) return;
    if (!confirm(`¿Eliminar la rutina "${r.name}"? (no afecta tu historial)`)) return;
    state.routines = state.routines.filter((x) => x.id !== r.id);
    state.activeRoutineId = state.routines[0].id; state.active = null;
    save(); renderRutina(root); toast('Rutina eliminada');
  };
  root.querySelectorAll('[data-addex]').forEach((b) => b.onclick = () => openExercisePicker(b.dataset.addex, root));
  root.querySelectorAll('[data-rmline]').forEach((b) => b.onclick = () => {
    const [d, id] = b.dataset.rmline.split('|');
    const day = r.days[d];
    day.exercises = day.exercises.filter((i) => i.exerciseId !== id);
    save(); renderRutina(root);
  });
  root.querySelectorAll('[data-editline]').forEach((b) => b.onclick = () => {
    const [d, id] = b.dataset.editline.split('|');
    editLineSetsReps(d, id, root);
  });
  root.querySelectorAll('[data-editlabel]').forEach((b) => b.onclick = () => {
    const d = b.dataset.editlabel;
    const v = prompt('Nombre del día (ej. Pecho, Push, Descanso):', r.days[d].label);
    if (v != null) { r.days[d].label = v.trim() || r.days[d].label; save(); renderRutina(root); }
  });
  $('#btnResetRoutine', root).onclick = async () => {
    if (!confirm('¿Restablecer ESTA rutina al split Olimpo por defecto? (no afecta tu historial)')) return;
    const seed = await fetchSeed('data/routine.seed.json');
    seed.id = r.id; // conservar el lugar/id en la lista
    const idx = state.routines.findIndex((x) => x.id === r.id);
    state.routines[idx] = seed;
    state.active = null;
    save(); renderRutina(root); toast('Rutina restablecida');
  };
}

function routineDayCard(d) {
  const day = activeRoutine().days[d];
  const lines = day.exercises.map((item) => {
    const ex = byId(item.exerciseId);
    return `<div class="rline">
      <span class="rline__name">${esc(ex ? ex.name : item.exerciseId)}</span>
      <button class="tag" data-editline="${d}|${esc(item.exerciseId)}">${item.sets}×${item.reps}</button>
      <button class="icon-btn" data-rmline="${d}|${esc(item.exerciseId)}">✕</button>
    </div>`;
  }).join('') || `<p class="rday__rest">Sin ejercicios (día de descanso)</p>`;
  return `<div class="card rday">
    <div class="rday__head">
      <button class="rday__title" data-editlabel="${d}" style="border:0;background:0;cursor:pointer;font:inherit;color:inherit;padding:0">
        ${DAY_SHORT[d]} · ${esc(day.label)} ✎</button>
      <button class="btn btn--sm" data-addex="${d}">+ Ejercicio</button>
    </div>
    ${lines}
  </div>`;
}

function editLineSetsReps(d, id, root) {
  const item = activeRoutine().days[d].exercises.find((i) => i.exerciseId === id);
  const ex = byId(id);
  openModal(`
    <h3 class="modal__title">${esc(ex ? ex.name : id)}</h3>
    <div class="field-row">
      <div class="field"><label>Series</label><input class="input" type="number" min="1" id="fSets" value="${item.sets}"></div>
      <div class="field"><label>Repeticiones</label><input class="input" type="number" min="1" id="fReps" value="${item.reps}"></div>
    </div>
    <button class="btn btn--primary" id="fSave">Guardar</button>
  `);
  $('#fSave').onclick = () => {
    item.sets = Math.max(1, parseInt($('#fSets').value) || item.sets);
    item.reps = Math.max(1, parseInt($('#fReps').value) || item.reps);
    save(); closeModal(); renderRutina(root);
  };
}

function openExercisePicker(d, root) {
  const groups = GROUP_ORDER.map((g) => {
    const list = state.catalog.filter((e) => e.muscleGroup === g);
    if (!list.length) return '';
    return `<div class="section-title">${esc(GROUPS[g])}</div>` +
      list.map((e) => `<div class="picker-item" data-pick="${esc(e.id)}">
        ${exImg(e, '')}<span class="picker-item__name">${esc(e.name)}</span>
        <span class="tag">${e.defaultSets}×${e.defaultReps}</span></div>`).join('');
  }).join('');
  openModal(`<h3 class="modal__title">Agregar ejercicio · ${esc(activeRoutine().days[d].label)}</h3>${groups}`);
  document.querySelectorAll('[data-pick]').forEach((it) => it.onclick = () => {
    const e = byId(it.dataset.pick);
    const day = activeRoutine().days[d];
    if (day.exercises.some((i) => i.exerciseId === e.id)) { toast('Ya está en este día'); return; }
    day.exercises.push({ exerciseId: e.id, sets: e.defaultSets, reps: e.defaultReps });
    save(); closeModal(); renderRutina(root); toast('Agregado ✔');
  });
}

// ---------- CATÁLOGO ----------
function renderCatalogo(root) {
  const groups = GROUP_ORDER.map((g) => {
    const list = state.catalog.filter((e) => e.muscleGroup === g);
    const items = list.map((e) => `
      <div class="cat-item">
        ${exImg(e, 'cat-item__thumb')}
        <div class="cat-item__body">
          <div class="cat-item__name">${esc(e.name)}</div>
          <div class="cat-item__meta">${e.defaultSets}×${e.defaultReps} · MET ${e.met}${e.subGroup ? ' · ' + esc(SUBGROUPS[e.subGroup] || e.subGroup) : ''}</div>
        </div>
        <button class="icon-btn" data-edit="${esc(e.id)}">✎</button>
        <button class="icon-btn" data-del="${esc(e.id)}">🗑️</button>
      </div>`).join('');
    return `<div class="card accordion">
      <button class="accordion__head"><b>${esc(GROUPS[g])}</b>
        <span><span class="accordion__count">${list.length}</span> <span class="accordion__chev">▾</span></span></button>
      <div class="accordion__body">${items || '<p class="rday__rest" style="padding:8px">Sin ejercicios</p>'}</div>
    </div>`;
  }).join('');
  root.innerHTML = `
    <div class="btn-row" style="margin-top:4px"><button class="btn btn--primary" id="btnAddEx">+ Nuevo ejercicio</button></div>
    ${groups}`;

  root.querySelectorAll('.accordion__head').forEach((h) => h.onclick = () => h.parentElement.classList.toggle('is-open'));
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); openExerciseForm(byId(b.dataset.edit), root); });
  root.querySelectorAll('[data-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const ex = byId(b.dataset.del);
    if (!confirm(`¿Eliminar "${ex.name}" del catálogo?`)) return;
    state.catalog = state.catalog.filter((x) => x.id !== ex.id);
    // limpiarlo de todas las rutinas
    for (const rr of state.routines) for (const d of DAYS) rr.days[d].exercises = rr.days[d].exercises.filter((i) => i.exerciseId !== ex.id);
    save(); renderCatalogo(root);
  });
  $('#btnAddEx', root).onclick = () => openExerciseForm(null, root);
}

function openExerciseForm(ex, root) {
  const isNew = !ex;
  ex = ex || { id: '', name: '', muscleGroup: 'pectorales', subGroup: null, met: 4.0, defaultSets: 3, defaultReps: 12, secondsPerRep: 3, image: '' };
  const groupOpts = GROUP_ORDER.map((g) => `<option value="${g}" ${g === ex.muscleGroup ? 'selected' : ''}>${GROUPS[g]}</option>`).join('');
  const subOpts = ['', ...Object.keys(SUBGROUPS)].map((s) => `<option value="${s}" ${s === (ex.subGroup || '') ? 'selected' : ''}>${s ? SUBGROUPS[s] : '—'}</option>`).join('');
  openModal(`
    <h3 class="modal__title">${isNew ? 'Nuevo ejercicio' : 'Editar ejercicio'}</h3>
    <div class="field"><label>Nombre</label><input class="input" id="eName" value="${esc(ex.name)}"></div>
    <div class="field-row">
      <div class="field"><label>Grupo muscular</label><select class="input" id="eGroup">${groupOpts}</select></div>
      <div class="field" id="eSubWrap"><label>Subgrupo (piernas)</label><select class="input" id="eSub">${subOpts}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Series</label><input class="input" type="number" min="1" id="eSets" value="${ex.defaultSets}"></div>
      <div class="field"><label>Reps</label><input class="input" type="number" min="1" id="eReps" value="${ex.defaultReps}"></div>
      <div class="field"><label>MET</label><input class="input" type="number" step="0.1" min="1" id="eMet" value="${ex.met}"></div>
    </div>
    <div class="field"><label>URL de imagen (opcional)</label><input class="input" id="eImg" value="${esc(ex.image || '')}" placeholder="https://..."></div>
    <button class="btn btn--primary" id="eSave">${isNew ? 'Crear' : 'Guardar'}</button>
  `);
  const syncSub = () => { $('#eSubWrap').style.display = $('#eGroup').value === 'piernas' ? '' : 'none'; };
  $('#eGroup').onchange = syncSub; syncSub();
  $('#eSave').onclick = () => {
    const name = $('#eName').value.trim();
    if (!name) { toast('Poné un nombre'); return; }
    const g = $('#eGroup').value;
    const data = {
      name, muscleGroup: g,
      subGroup: g === 'piernas' ? ($('#eSub').value || null) : null,
      defaultSets: Math.max(1, parseInt($('#eSets').value) || 3),
      defaultReps: Math.max(1, parseInt($('#eReps').value) || 12),
      met: Math.max(1, parseFloat($('#eMet').value) || 4),
      secondsPerRep: ex.secondsPerRep || 3,
      image: $('#eImg').value.trim() || null,
    };
    if (isNew) {
      const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ej';
      let id = base, n = 2; while (byId(id)) id = `${base}-${n++}`;
      state.catalog.push({ id, ...data });
    } else {
      Object.assign(ex, data);
    }
    save(); closeModal(); renderCatalogo(root);
  };
}

// ---------- HISTORIAL ----------
function renderHistorial(root) {
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) {
    root.innerHTML = `<div class="empty"><div class="empty__icon">📈</div><p>Todavía no finalizaste ningún día.<br>Completá una sesión en <b>Hoy</b> para verla acá.</p></div>`;
    return;
  }
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 6 * 864e5);
  const weekCal = sessions.filter((s) => new Date(s.date + 'T00:00') >= weekAgo).reduce((a, s) => a + s.caloriesBurned, 0);
  const totalCal = sessions.reduce((a, s) => a + s.caloriesBurned, 0);

  const items = sessions.map((s) => {
    const d = new Date(s.date + 'T00:00');
    const pct = s.entries.length ? Math.round(s.entries.filter((e) => e.completed).length / s.entries.length * 100) : 0;
    return `<div class="card hist">
      <div class="hist__date"><div class="hist__day">${d.getDate()}</div><div class="hist__mon">${MONTHS[d.getMonth()]}</div></div>
      <div class="hist__body">
        <div class="hist__label">${esc(s.label || DAY_SHORT[s.dayKey])}</div>
        <div class="hist__meta">${DAY_SHORT[s.dayKey]} · ${s.durationMin} min · ${pct}% completado</div>
      </div>
      <div style="text-align:right"><div class="hist__cal">${s.caloriesBurned}</div><div class="hist__mon">kcal</div></div>
      <button class="icon-btn" data-delsession="${esc(s.date)}">🗑️</button>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="summary" style="margin-top:4px">
      <div class="card stat stat--accent"><div class="stat__num">${weekCal}<small> kcal</small></div><div class="stat__label">Últimos 7 días</div></div>
      <div class="card stat"><div class="stat__num">${sessions.length}</div><div class="stat__label">Sesiones</div></div>
      <div class="card stat"><div class="stat__num">${totalCal}<small> kcal</small></div><div class="stat__label">Total</div></div>
    </div>
    <div class="section-title">Sesiones</div>
    ${items}`;
  root.querySelectorAll('[data-delsession]').forEach((b) => b.onclick = () => {
    if (!confirm('¿Eliminar esta sesión del historial?')) return;
    state.sessions = state.sessions.filter((s) => s.date !== b.dataset.delsession);
    save(); renderHistorial(root);
  });
}

// ---------- PERFIL ----------
function renderPerfil(root) {
  const p = state.profile;
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <div class="field"><label>Nombre</label><input class="input" id="pName" value="${esc(p.name)}"></div>
      <div class="field"><label>Peso corporal (kg)</label><input class="input" type="number" min="20" step="0.5" id="pWeight" value="${p.weightKg}"></div>
      <p style="font-size:12px;color:var(--text-soft);margin:-6px 0 14px">Se usa para calcular las calorías (fórmula MET × peso × duración).</p>
      <div class="field-row">
        <div class="field"><label>Descanso entre series (seg)</label><input class="input" type="number" min="0" id="pRest" value="${p.restSecondsDefault}"></div>
        <div class="field"><label>Segundos por repetición</label><input class="input" type="number" min="1" id="pSpr" value="${p.secondsPerRepDefault}"></div>
      </div>
      <button class="btn btn--primary" id="pSave">Guardar</button>
    </div>
    <div class="section-title">Imágenes de ejercicios</div>
    <div class="card" style="padding:16px">
      <div class="field"><label>Estilo</label>
        <select class="input" id="pStyle">
          <option value="foto" ${p.imageStyle === 'foto' ? 'selected' : ''}>Fotos (reales)</option>
          <option value="cartoon" ${p.imageStyle === 'cartoon' ? 'selected' : ''}>Cartoon</option>
        </select></div>
      <p style="font-size:12px;color:var(--text-soft);margin:-6px 0 0">Si falta una ilustración, usa la foto del ejercicio.</p>
    </div>
    <div class="section-title">Datos</div>
    <div class="card" style="padding:16px">
      <p style="font-size:13px;color:var(--text-soft);margin-top:0">Tus datos se guardan sólo en este dispositivo (offline).</p>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" id="btnExport">⬇️ Exportar</button>
        <button class="btn btn--danger btn--sm" id="btnReset">Borrar todo</button>
      </div>
    </div>
    <p style="text-align:center;color:var(--text-faint);font-size:12px;margin-top:20px">Olimpo · imágenes © free-exercise-db (dominio público)</p>
  `;
  $('#pSave', root).onclick = () => {
    p.name = $('#pName').value.trim() || 'Atleta';
    p.weightKg = Math.max(20, parseFloat($('#pWeight').value) || p.weightKg);
    p.restSecondsDefault = Math.max(0, parseInt($('#pRest').value) || 0);
    p.secondsPerRepDefault = Math.max(1, parseInt($('#pSpr').value) || 3);
    save(); toast('Perfil guardado ✔');
  };
  $('#pStyle', root).onchange = (e) => { p.imageStyle = e.target.value; save(); toast('Estilo: ' + (p.imageStyle === 'cartoon' ? 'Cartoon' : 'Fotos')); };
  $('#btnExport', root).onclick = () => {
    const data = { profile: state.profile, catalog: state.catalog, routines: state.routines, activeRoutineId: state.activeRoutineId, sessions: state.sessions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'olimpo-backup.json'; a.click();
  };
  $('#btnReset', root).onclick = () => {
    if (!confirm('Esto borra perfil, rutina, catálogo e historial de este dispositivo. ¿Seguro?')) return;
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };
}

// ---------- Modal ----------
function openModal(html, onClose) {
  closeModal();
  const root = $('#modalRoot');
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back._onClose = onClose;
  back.onclick = (e) => { if (e.target === back || e.target.hasAttribute('data-close')) closeModal(); };
  root.appendChild(back);
}
function closeModal() {
  const back = $('.modal-backdrop');
  if (back) { const cb = back._onClose; back.remove(); if (cb) cb(); }
}

// ---------- Tabs ----------
function bindTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => setView(t.dataset.view));
}

// Reubicar el slide actual si cambia el ancho (rotación/resize)
window.addEventListener('resize', () => { if (state.view === 'hoy' && _playerResize) _playerResize(); });

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init().catch((e) => {
  $('#view').innerHTML = `<div class="empty"><div class="empty__icon">⚠️</div><p>Error al iniciar: ${esc(e.message)}<br>Serví la app con un servidor (no abras el archivo directo).</p></div>`;
});
