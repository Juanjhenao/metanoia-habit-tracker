/* ==========================================================================
   Hábitos — lógica de la aplicación
   Todo el estado vive en el servidor (habit-log.json dentro del vault). Aquí
   solo se guarda la copia cargada y qué está mirando el usuario ahora mismo.
   ========================================================================== */

const state = {
  data: null,
  usuario: null,          // el perfil abierto en esta pantalla
  usuarios: [],           // quiénes viven en la casa
  sesion: '',             // vale de sesión, solo si el perfil tiene contraseña
  liga: [],               // la tabla de la casa: rachas y puntos de cada quien
  retos: [],              // los retos en los que estoy o a los que me invitan
  avisos: [],             // la bandeja: lo que pasó mientras no estabas mirando
  tablon: [],             // hábitos públicos de los demás a los que puedo unirme
  sincronizado: false,    // ¿está viva la conexión en vivo con el servidor?
  historialMonth: new Date(),
  historialModo: 'mes',
  diaSeleccionado: null,
  editandoHabito: null,   // id del hábito en edición, o 'nuevo', o null
  borrando: null,         // id pendiente de confirmar borrado
  nivelPrevio: null,      // para detectar subidas de nivel
  hoyPintado: false,      // la entrada escalonada solo va en el primer pintado
  notasPintadas: false,
  notas: {
    buscar: '',
    tag: null,            // etiqueta activa en el filtro, o null
    orden: 'editadas',
    resaltador: 'amarillo', // último resaltador usado (para Ctrl+Shift+H)
  },
  work: {
    filtro: 'abiertas',   // abiertas | en-curso | bloqueada | hecha | todas
    buscar: '',
    abierta: null,        // id de la tarea desplegada, o null
    editando: null,       // id en edición, o 'nueva', o null
  },
  casa: {
    editandoPersona: null, // id de la persona en edición, o 'nueva', o null
    editandoTarea: null,   // id de la tarea de casa en edición, o 'nueva', o null
  },
};

// Colores de hábito, ordenados por tono para que la fila se lea como un
// espectro y elegir sea rápido. Todos viven en la banda clara (300–500): el
// color tiene que verse sobre el negro del fondo y a la vez aguantar el check
// en texto oscuro encima, y los tonos profundos fallan en las dos cosas.
const PALETA = [
  { hex: '#a3e635', nombre: 'Lima' },
  { hex: '#4ade80', nombre: 'Verde claro' },
  { hex: '#22c55e', nombre: 'Verde' },
  { hex: '#34d399', nombre: 'Esmeralda' },
  { hex: '#2dd4bf', nombre: 'Turquesa' },
  { hex: '#22d3ee', nombre: 'Cian' },
  { hex: '#38bdf8', nombre: 'Celeste' },
  { hex: '#60a5fa', nombre: 'Azul' },
  { hex: '#3b82f6', nombre: 'Azul intenso' },
  { hex: '#818cf8', nombre: 'Índigo' },
  { hex: '#a78bfa', nombre: 'Violeta' },
  { hex: '#c084fc', nombre: 'Púrpura' },
  { hex: '#e879f9', nombre: 'Orquídea' },
  { hex: '#d946ef', nombre: 'Fucsia' },
  { hex: '#f472b6', nombre: 'Rosa' },
  { hex: '#ec4899', nombre: 'Magenta' },
  { hex: '#fb7185', nombre: 'Coral' },
  { hex: '#f43f5e', nombre: 'Carmín' },
  { hex: '#f87171', nombre: 'Rojo' },
  { hex: '#fca5a5', nombre: 'Salmón' },
  { hex: '#fb923c', nombre: 'Naranja' },
  { hex: '#f97316', nombre: 'Naranja intenso' },
  { hex: '#fbbf24', nombre: 'Ámbar' },
  { hex: '#facc15', nombre: 'Amarillo' },
  { hex: '#d6d3d1', nombre: 'Piedra' },
  { hex: '#a8a29e', nombre: 'Topo' },
  { hex: '#cbd5e1', nombre: 'Niebla' },
  { hex: '#94a3b8', nombre: 'Pizarra' },
];

// Los colores de las etiquetas de notas se sortean por hash del nombre. Si
// usaran PALETA, ampliarla habría recoloreado todas las etiquetas que ya
// existen, así que tienen su propia lista y esa no se toca.
const PALETA_TAGS = [
  '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24',
  '#fb7185', '#2dd4bf', '#818cf8', '#f97316', '#4ade80',
];

// ------------------------------------------------------------- notas --------

// Color del texto de la nota.
const NOTE_TEXT_COLORS = [
  { hex: '#e7e9ec', nombre: 'Normal' },
  { hex: '#4ade80', nombre: 'Verde' },
  { hex: '#fbbf24', nombre: 'Ámbar' },
  { hex: '#38bdf8', nombre: 'Azul' },
  { hex: '#f472b6', nombre: 'Rosa' },
  { hex: '#a78bfa', nombre: 'Violeta' },
  { hex: '#fb7185', nombre: 'Coral' },
  { hex: '#2dd4bf', nombre: 'Turquesa' },
];

// Color de la nota entera (se aplica como tinte suave sobre la tarjeta).
const NOTE_BG_COLORS = [
  { hex: '', nombre: 'Sin color' },
  { hex: '#22c55e', nombre: 'Verde' },
  { hex: '#38bdf8', nombre: 'Azul' },
  { hex: '#a78bfa', nombre: 'Violeta' },
  { hex: '#f472b6', nombre: 'Rosa' },
  { hex: '#fbbf24', nombre: 'Ámbar' },
  { hex: '#fb7185', nombre: 'Coral' },
  { hex: '#2dd4bf', nombre: 'Turquesa' },
  { hex: '#94a3b8', nombre: 'Gris' },
];

// Las claves coinciden con las clases .nota-font-<clave> de style.css.
const NOTE_FONTS = [
  { grupo: 'Del sistema', fuentes: [
    { key: 'sans', label: 'Sistema' },
    { key: 'serif', label: 'Serif' },
    { key: 'mono', label: 'Mono' },
    { key: 'rounded', label: 'Redondeada' },
  ] },
  { grupo: 'Sans', fuentes: [
    { key: 'inter', label: 'Inter' },
    { key: 'poppins', label: 'Poppins' },
    { key: 'nunito', label: 'Nunito' },
    { key: 'worksans', label: 'Work Sans' },
    { key: 'grotesk', label: 'Space Grotesk' },
  ] },
  { grupo: 'Serif', fuentes: [
    { key: 'playfair', label: 'Playfair Display' },
    { key: 'lora', label: 'Lora' },
    { key: 'merriweather', label: 'Merriweather' },
    { key: 'baskerville', label: 'Libre Baskerville' },
  ] },
  { grupo: 'Monoespaciadas', fuentes: [
    { key: 'jetbrains', label: 'JetBrains Mono' },
    { key: 'plexmono', label: 'IBM Plex Mono' },
  ] },
  { grupo: 'Manuscritas', fuentes: [
    { key: 'caveat', label: 'Caveat' },
    { key: 'indie', label: 'Indie Flower' },
    { key: 'dancing', label: 'Dancing Script' },
    { key: 'shadows', label: 'Shadows Into Light' },
  ] },
  { grupo: 'Titulares', fuentes: [
    { key: 'bebas', label: 'Bebas Neue' },
    { key: 'oswald', label: 'Oswald' },
  ] },
];

const NOTE_FONT_LABELS = new Map(
  NOTE_FONTS.flatMap((g) => g.fuentes.map((f) => [f.key, f.label]))
);

const NOTE_SIZES = [
  { key: 'sm', label: 'Chico' },
  { key: 'md', label: 'Mediano' },
  { key: 'lg', label: 'Grande' },
  { key: 'xl', label: 'Enorme' },
];

// Resaltadores. La clave viaja dentro del HTML como <mark class="hl hl-clave">.
const HIGHLIGHTS = [
  { key: 'amarillo', nombre: 'Amarillo' },
  { key: 'verde', nombre: 'Verde' },
  { key: 'azul', nombre: 'Azul' },
  { key: 'rosa', nombre: 'Rosa' },
  { key: 'naranja', nombre: 'Naranja' },
  { key: 'violeta', nombre: 'Violeta' },
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_SEMANA_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const XP_POR_HABITO = 10;
const XP_DIA_PERFECTO = 50;

// ---- Monedas ----
// Dos monedas separadas a propósito, una por cada mitad de la vida: los Lucky
// Dollars salen de los hábitos y las Chamba Coins del trabajo. No se mezclan ni
// se convierten entre sí; si se sumaran en un solo saldo, un buen mes de
// trabajo taparía un mal mes de hábitos y el número dejaría de decir nada.
//
// Ninguna de las dos se guarda: se calculan desde el historial, igual que el
// XP. Así desmarcar un hábito o reabrir una tarea devuelve el saldo exacto sin
// necesidad de llevar un libro de movimientos que se pueda desincronizar.

// Todos los hábitos pagan lo mismo: la app no juzga cuál cuesta más.
const LD_POR_HABITO = 10;

// La recompensa de un logro sale de su dificultad, no de su número. Un mismo
// nivel paga igual venga de una racha, del volumen o de los días perfectos.
const LD_POR_DIFICULTAD = { 1: 25, 2: 75, 3: 200, 4: 500, 5: 1500 };
const NOMBRE_DIFICULTAD = { 1: 'Fácil', 2: 'Normal', 3: 'Difícil', 4: 'Muy difícil', 5: 'Legendario' };

// Chamba Coins: el paso es la unidad de avance real, así que es lo que paga a
// diario. Terminar la tarea paga el grueso, escalado por prioridad y por lo
// larga que fuera, más un extra por llegar antes de la fecha límite.
const CC_POR_PASO = 5;
const CC_POR_TAREA = { alta: 150, media: 80, baja: 40 };
const CC_POR_PASO_AL_CERRAR = 5;
const CC_A_TIEMPO = 50;

// Columnas del heatmap anual. El CSS lo lee desde --hm-semanas para que la fila
// de meses y la de celdas no puedan desalinearse.
const SEMANAS_HEATMAP = 53;

// ---------------------------------------------------------- identidad ------
// Cada pestaña abierta tiene su propio id. No identifica a una persona: sirve
// para que el canal en vivo pueda distinguir el cambio que hizo otro del eco de
// lo que acabo de hacer yo, que ya está pintado en pantalla.
const CLIENTE = Math.random().toString(36).slice(2) + Date.now().toString(36);

// Qué perfil eligió ESTE dispositivo. Va en localStorage y no en el servidor:
// el mismo servidor lo abren varias personas desde varios sitios, así que la
// elección es de cada pantalla, no de la instalación.
const PERFIL_GUARDADO = 'metanoia-perfil';

// El vale que demuestra que en esta pantalla se acertó la contraseña. Vive al
// lado del perfil elegido y por el mismo motivo: es de esta pantalla, no de la
// instalación. Si se pierde, lo único que pasa es que vuelve a pedirla.
const SESION_GUARDADA = 'metanoia-sesion';

// ---------------------------------------------------------------- fechas ----

function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// new Date('2026-08-13') se interpreta como UTC y en husos negativos cae en el
// día anterior. Construyendo la fecha por partes siempre queda en local.
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return formatISO(new Date());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Lunes = 0 ... Domingo = 6
function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

// ------------------------------------------------------------------ API -----

// Toda petición dice de parte de quién va y desde qué pestaña. Va aquí y no en
// cada llamada porque así no hay forma de escribir una ruta nueva y olvidarse.
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(state.usuario ? { 'X-Usuario': state.usuario.id } : {}),
      ...(state.sesion ? { 'X-Sesion': state.sesion } : {}),
      'X-Cliente': CLIENTE,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Hay dos 401 distintos y confundirlos se nota: «tu perfil ya no existe»
    // manda a la casilla uno, «vuelve a escribir la contraseña» no debería.
    // El de la propia puerta no se toca: allí el error ya es la respuesta.
    if (res.status === 401 && url !== '/api/sesion') {
      if (body.clave) volverAPedirClave();
      else olvidarPerfil();
    }
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

// El servidor devuelve el perfil aplanado (habits, log, notes...) más la casa,
// así que `state.data` conserva la forma de siempre y ninguna vista se entera
// de que ahora hay más de una persona.
async function fetchData() {
  // Con la fecha de esta pantalla: el servidor la usa para calcular los rangos,
  // y la suya es UTC. Sin esto, aquí el día cambiaría a las siete de la tarde.
  const payload = await api(`/api/data?hoy=${todayISO()}`);
  state.usuario = payload.user;
  state.usuarios = payload.users;
  state.data = payload;
}

function jsonBody(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function markHabit(date, habitId, done) {
  const result = await api('/api/mark', jsonBody('POST', { date, habitId, done }));
  state.data.log[date] = result.log;
  // La tabla de la casa y el rango del hábito cambian con cada marca. Se piden
  // aparte y sin esperar: el check ya está pintado y esto refresca lo de arriba.
  cargarLiga();
  refrescarRangos();
  if (state.retos.length) cargarRetos();
}

const crearHabito = (payload) => api('/api/habits', jsonBody('POST', payload));
const editarHabito = (id, payload) => api(`/api/habits/${id}`, jsonBody('PATCH', payload));
const borrarHabito = (id) => api(`/api/habits/${id}`, { method: 'DELETE' });
const reordenarHabitos = (ids) => api('/api/habits/reorder', jsonBody('POST', { ids }));

async function createNote() {
  const result = await api('/api/notes', jsonBody('POST', { content: '' }));
  state.data.notes.push(result.note);
  return result.note;
}

async function updateNote(id, patch) {
  const result = await api(`/api/notes/${id}`, jsonBody('PATCH', patch));
  const idx = state.data.notes.findIndex((n) => n.id === id);
  if (idx !== -1) state.data.notes[idx] = result.note;
  return result.note;
}

// Sube una imagen del portapapeles y devuelve su ruta en el vault. El servidor
// la escribe como archivo; aquí solo se guarda la ruta.
async function subirImagen(dataUrl) {
  const res = await api('/api/uploads', jsonBody('POST', { dataUrl }));
  return res.src;
}

const leerComoDataURL = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('No se pudo leer la imagen'));
  fr.readAsDataURL(blob);
});

async function deleteNote(id) {
  await api(`/api/notes/${id}`, { method: 'DELETE' });
  state.data.notes = state.data.notes.filter((n) => n.id !== id);
}

// ------------------------------------------------------------- derivados ----

const habits = () => state.data.habits;
const habitById = (id) => habits().find((h) => h.id === id);
// Tareas de Work Mode. Viven aquí, con el resto de accesores derivados, porque
// el cálculo de Chamba Coins las necesita mucho antes de la vista que las pinta.
const tareas = () => state.data.work || [];
const tareaById = (id) => tareas().find((t) => t.id === id);
// Casa. El respaldo cubre el caso de un servidor viejo que no manda `casa`:
// así todo lo que lee la sección puede hacerlo sin comprobar nada.
const casa = () => state.data.casa || { chores: [], done: {} };
// Las personas de la casa son los perfiles: quien aparece en la tabla es quien
// usa la app. Una sola lista y un solo sitio donde puede desajustarse.
const personaById = (id) => state.usuarios.find((u) => u.id === id);

const doneOn = (iso) => (state.data.log[iso] || {}).done || [];
const isDone = (iso, habitId) => doneOn(iso).includes(habitId);

// El log puede contener ids de hábitos ya borrados; para contar solo valen los
// que existen hoy, si no las estadísticas quedarían infladas.
function doneCount(iso) {
  const vivos = new Set(habits().map((h) => h.id));
  return doneOn(iso).filter((id) => vivos.has(id)).length;
}

function esDiaPerfecto(iso) {
  return habits().length > 0 && doneCount(iso) === habits().length;
}

function fechasConRegistro() {
  return Object.keys(state.data.log).filter((iso) => doneCount(iso) > 0).sort();
}

function rachaDe(habitId) {
  let actual = 0;
  let cursor = new Date();
  // Que hoy siga pendiente no rompe la racha: todavía queda día por delante.
  if (!isDone(formatISO(cursor), habitId)) cursor = addDays(cursor, -1);
  while (isDone(formatISO(cursor), habitId)) {
    actual += 1;
    cursor = addDays(cursor, -1);
  }

  let maxima = 0;
  let enCurso = 0;
  let previa = null;
  for (const iso of Object.keys(state.data.log).sort()) {
    if (!isDone(iso, habitId)) {
      enCurso = 0;
      previa = null;
      continue;
    }
    const actualFecha = parseISO(iso);
    if (previa) {
      const dias = Math.round((actualFecha - previa) / 86400000);
      enCurso = dias === 1 ? enCurso + 1 : 1;
    } else {
      enCurso = 1;
    }
    maxima = Math.max(maxima, enCurso);
    previa = actualFecha;
  }

  return { actual, maxima };
}

// Racha global: días seguidos en los que se completó al menos un hábito.
function rachaGlobal() {
  let dias = 0;
  let cursor = new Date();
  if (doneCount(formatISO(cursor)) === 0) cursor = addDays(cursor, -1);
  while (doneCount(formatISO(cursor)) > 0) {
    dias += 1;
    cursor = addDays(cursor, -1);
  }
  return dias;
}

function porcentajeDe(habitId) {
  const fechas = fechasConRegistro();
  if (fechas.length === 0) return 0;
  const hechos = fechas.filter((iso) => isDone(iso, habitId)).length;
  return Math.round((hechos / fechas.length) * 100);
}

function totales() {
  const fechas = Object.keys(state.data.log);
  let completados = 0;
  let perfectos = 0;
  let maxEnUnDia = 0;
  for (const iso of fechas) {
    const n = doneCount(iso);
    completados += n;
    if (n > maxEnUnDia) maxEnUnDia = n;
    if (esDiaPerfecto(iso)) perfectos += 1;
  }
  const mejorRacha = habits().reduce((max, h) => Math.max(max, rachaDe(h.id).maxima), 0);

  // Un solo recorrido por los días con actividad para dos métricas más:
  // la racha más larga de días perfectos seguidos y los días de fin de semana.
  const activos = fechasConRegistro();
  let rachaPerfecta = 0;
  let enCurso = 0;
  let previa = null;
  let finde = 0;
  for (const iso of activos) {
    const fecha = parseISO(iso);
    if (weekdayIndex(fecha) >= 5) finde += 1;
    if (!esDiaPerfecto(iso)) {
      enCurso = 0;
      previa = null;
      continue;
    }
    const seguido = previa && Math.round((fecha - previa) / 86400000) === 1;
    enCurso = seguido ? enCurso + 1 : 1;
    rachaPerfecta = Math.max(rachaPerfecta, enCurso);
    previa = fecha;
  }

  const xp = completados * XP_POR_HABITO + perfectos * XP_DIA_PERFECTO;

  return {
    completados,
    perfectos,
    mejorRacha,
    maxEnUnDia,
    rachaPerfecta,
    finde,
    diasActivos: activos.length,
    rachaActual: rachaGlobal(),
    habitos: habits().length,
    notas: (state.data.notes || []).length,
    nivel: nivelDesdeXP(xp).nivel,
  };
}

function calcularXP() {
  const t = totales();
  return t.completados * XP_POR_HABITO + t.perfectos * XP_DIA_PERFECTO;
}

// ---- Lucky Dollars: la moneda de los hábitos ----

const premioLogro = (l) => LD_POR_DIFICULTAD[l.dif] || 0;

// Saldo = lo que pagó marcar hábitos + lo que pagó cada logro conseguido.
// Se recalcula entero cada vez; no hay saldo guardado que pueda desviarse.
function calcularLuckyDollars(t = totales()) {
  const porHabitos = t.completados * LD_POR_HABITO;
  const porLogros = LOGROS.reduce((n, l) => n + (l.valor(t) >= l.meta ? premioLogro(l) : 0), 0);
  return { porHabitos, porLogros, total: porHabitos + porLogros };
}

// ---- Chamba Coins: la moneda del trabajo ----

// Lo que paga una tarea al cerrarse: base por prioridad, más su tamaño en
// pasos, más el extra por haber llegado antes de la fecha límite.
function premioTarea(t) {
  const base = CC_POR_TAREA[t.priority] || CC_POR_TAREA.media;
  const porTamano = t.steps.length * CC_POR_PASO_AL_CERRAR;
  return { base, porTamano, aTiempo: cerradaATiempo(t) ? CC_A_TIEMPO : 0 };
}

// Solo cuenta si había fecha que cumplir: una tarea sin fecha no puede llegar
// tarde, así que tampoco puede cobrar por llegar a tiempo.
function cerradaATiempo(t) {
  if (t.status !== 'hecha' || !t.due || !t.doneAt) return false;
  const limite = parseISO(t.due);
  limite.setHours(23, 59, 59, 999);
  return new Date(t.doneAt) <= limite;
}

// Lo que vale la tarea entera: sus pasos más lo que paga cerrarla. En una tarea
// abierta es lo que puede llegar a pagar; en una cerrada, lo que ya pagó.
function premioTotalTarea(t) {
  const p = premioTarea(t);
  const pasos = t.steps.length * CC_POR_PASO;
  // Sin fecha límite no hay extra por puntualidad, ni siquiera potencial.
  const extra = t.status === 'hecha' ? p.aTiempo : (t.due ? CC_A_TIEMPO : 0);
  return pasos + p.base + p.porTamano + extra;
}

function explicarPremio(t) {
  const p = premioTarea(t);
  const partes = [
    `${moneda(t.steps.length * CC_POR_PASO)} por sus ${t.steps.length} pasos`,
    `${moneda(p.base)} por prioridad ${t.priority}`,
    `${moneda(p.porTamano)} por tamaño al cerrarla`,
  ];
  if (t.status === 'hecha') {
    partes.push(p.aTiempo > 0 ? `${moneda(p.aTiempo)} por llegar a tiempo` : 'sin extra de puntualidad');
    return `Ya pagó: ${partes.join(', ')}.`;
  }
  if (t.due) partes.push(`${moneda(CC_A_TIEMPO)} si la cierras antes del ${t.due}`);
  return `Puede pagar: ${partes.join(', ')}.`;
}

function calcularChambaCoins() {
  let porPasos = 0;
  let porTareas = 0;
  let aTiempo = 0;
  let cerradas = 0;

  for (const t of tareas()) {
    porPasos += t.steps.filter((s) => s.done).length * CC_POR_PASO;
    if (t.status !== 'hecha') continue;
    cerradas += 1;
    const p = premioTarea(t);
    porTareas += p.base + p.porTamano;
    aTiempo += p.aTiempo;
  }

  return { porPasos, porTareas, aTiempo, cerradas, total: porPasos + porTareas + aTiempo };
}

// Separador de miles: a partir de cuatro cifras el número deja de leerse solo.
const moneda = (n) => n.toLocaleString('es');

// Cada nivel cuesta un 30% más que el anterior, redondeado a decenas para que
// los números que ve el usuario sean legibles.
function nivelDesdeXP(xp) {
  let nivel = 1;
  let necesita = 100;
  let acumulado = 0;
  while (xp >= acumulado + necesita) {
    acumulado += necesita;
    nivel += 1;
    necesita = Math.round((necesita * 1.3) / 10) * 10;
  }
  return { nivel, dentro: xp - acumulado, necesita, pct: Math.round(((xp - acumulado) / necesita) * 100) };
}

// ------------------------------------------------------------------ logros --

// Cada logro se describe con un valor actual y una meta: así el mismo dato
// sirve para saber si está conseguido y para pintar cuánto falta.
const GRUPOS_LOGROS = [
  { id: 'constancia', nombre: 'Constancia' },
  { id: 'volumen', nombre: 'Volumen' },
  { id: 'perfectos', nombre: 'Días perfectos' },
  { id: 'presencia', nombre: 'Presencia' },
  { id: 'nivel', nombre: 'Nivel' },
  { id: 'sistema', nombre: 'Tu sistema' },
];

const LOGROS = [
  // --- Constancia: la racha más larga de un mismo hábito ---
  { id: 'racha3', grupo: 'constancia', icon: 'fire', nombre: 'Tres seguidos', desc: 'Racha de 3 días', dif: 1, valor: (t) => t.mejorRacha, meta: 3 },
  { id: 'racha7', grupo: 'constancia', icon: 'fire', nombre: 'Semana viva', desc: 'Racha de 7 días', dif: 1, valor: (t) => t.mejorRacha, meta: 7 },
  { id: 'racha14', grupo: 'constancia', icon: 'fire', nombre: 'Dos semanas', desc: 'Racha de 14 días', dif: 2, valor: (t) => t.mejorRacha, meta: 14 },
  { id: 'racha30', grupo: 'constancia', icon: 'fire', nombre: 'Mes entero', desc: 'Racha de 30 días', dif: 3, valor: (t) => t.mejorRacha, meta: 30 },
  { id: 'racha60', grupo: 'constancia', icon: 'bolt', nombre: 'Dos meses', desc: 'Racha de 60 días', dif: 3, valor: (t) => t.mejorRacha, meta: 60 },
  { id: 'racha100', grupo: 'constancia', icon: 'medal', nombre: 'Imparable', desc: 'Racha de 100 días', dif: 4, valor: (t) => t.mejorRacha, meta: 100 },
  { id: 'racha365', grupo: 'constancia', icon: 'trophy', nombre: 'Año redondo', desc: 'Racha de 365 días', dif: 5, valor: (t) => t.mejorRacha, meta: 365 },

  // --- Volumen: hábitos marcados en total ---
  { id: 'primero', grupo: 'volumen', icon: 'check', nombre: 'Primer paso', desc: 'Completa tu primer hábito', dif: 1, valor: (t) => t.completados, meta: 1 },
  { id: 'diez', grupo: 'volumen', icon: 'sealcheck', nombre: 'Arrancando', desc: '10 hábitos completados', dif: 1, valor: (t) => t.completados, meta: 10 },
  { id: 'cincuenta', grupo: 'volumen', icon: 'sealcheck', nombre: 'En marcha', desc: '50 hábitos completados', dif: 2, valor: (t) => t.completados, meta: 50 },
  { id: 'cien', grupo: 'volumen', icon: 'chart', nombre: 'Centenar', desc: '100 hábitos completados', dif: 2, valor: (t) => t.completados, meta: 100 },
  { id: 'doscientos', grupo: 'volumen', icon: 'chart', nombre: 'Doscientos cincuenta', desc: '250 hábitos completados', dif: 3, valor: (t) => t.completados, meta: 250 },
  { id: 'quinientos', grupo: 'volumen', icon: 'trophy', nombre: 'Veterano', desc: '500 hábitos completados', dif: 4, valor: (t) => t.completados, meta: 500 },
  { id: 'mil', grupo: 'volumen', icon: 'trophy', nombre: 'Mil marcas', desc: '1000 hábitos completados', dif: 5, valor: (t) => t.completados, meta: 1000 },

  // --- Días perfectos: todos los hábitos del día hechos ---
  { id: 'perfecto1', grupo: 'perfectos', icon: 'star', nombre: 'Día perfecto', desc: 'Completa todos en un día', dif: 1, valor: (t) => t.perfectos, meta: 1 },
  { id: 'perfecto10', grupo: 'perfectos', icon: 'star', nombre: 'Diez perfectos', desc: '10 días perfectos', dif: 2, valor: (t) => t.perfectos, meta: 10 },
  { id: 'perfecto30', grupo: 'perfectos', icon: 'medal', nombre: 'Treinta perfectos', desc: '30 días perfectos', dif: 3, valor: (t) => t.perfectos, meta: 30 },
  { id: 'perfecto100', grupo: 'perfectos', icon: 'trophy', nombre: 'Cien perfectos', desc: '100 días perfectos', dif: 4, valor: (t) => t.perfectos, meta: 100 },
  { id: 'perfectaSemana', grupo: 'perfectos', icon: 'meta', nombre: 'Semana impecable', desc: '7 días perfectos seguidos', dif: 3, valor: (t) => t.rachaPerfecta, meta: 7 },
  { id: 'identityShift', grupo: 'perfectos', icon: 'medal', nombre: 'Identity Shift', desc: '30 días perfectos seguidos', dif: 5, valor: (t) => t.rachaPerfecta, meta: 30 },

  // --- Presencia: días en los que apareciste ---
  { id: 'activos7', grupo: 'presencia', icon: 'calendar', nombre: 'Primera semana', desc: '7 días con actividad', dif: 1, valor: (t) => t.diasActivos, meta: 7 },
  { id: 'constante', grupo: 'presencia', icon: 'calendar', nombre: 'Constancia', desc: '30 días con actividad', dif: 2, valor: (t) => t.diasActivos, meta: 30 },
  { id: 'activos100', grupo: 'presencia', icon: 'calendar', nombre: 'Cien días', desc: '100 días con actividad', dif: 3, valor: (t) => t.diasActivos, meta: 100 },
  { id: 'activos365', grupo: 'presencia', icon: 'trophy', nombre: 'Un año presente', desc: '365 días con actividad', dif: 5, valor: (t) => t.diasActivos, meta: 365 },
  { id: 'rachaViva', grupo: 'presencia', icon: 'bolt', nombre: 'Racha viva', desc: '10 días seguidos sin fallar', dif: 2, valor: (t) => t.rachaActual, meta: 10 },
  { id: 'finde', grupo: 'presencia', icon: 'naturaleza', nombre: 'Sin domingos libres', desc: '20 días de fin de semana activos', dif: 2, valor: (t) => t.finde, meta: 20 },

  // --- Nivel ---
  { id: 'nivel5', grupo: 'nivel', icon: 'star', nombre: 'Nivel 5', desc: 'Llega al nivel 5', dif: 2, valor: (t) => t.nivel, meta: 5 },
  { id: 'nivel10', grupo: 'nivel', icon: 'star', nombre: 'Nivel 10', desc: 'Llega al nivel 10', dif: 3, valor: (t) => t.nivel, meta: 10 },
  { id: 'nivel25', grupo: 'nivel', icon: 'medal', nombre: 'Nivel 25', desc: 'Llega al nivel 25', dif: 4, valor: (t) => t.nivel, meta: 25 },

  // --- Tu sistema: cómo tienes montada la app ---
  { id: 'habitos3', grupo: 'sistema', icon: 'rutina', nombre: 'Tríada', desc: '3 hábitos activos', dif: 1, valor: (t) => t.habitos, meta: 3 },
  { id: 'habitos6', grupo: 'sistema', icon: 'organizar', nombre: 'Sistema completo', desc: '6 hábitos activos', dif: 2, valor: (t) => t.habitos, meta: 6 },
  { id: 'diaCargado', grupo: 'sistema', icon: 'bolt', nombre: 'Día cargado', desc: '5 hábitos en un mismo día', dif: 2, valor: (t) => t.maxEnUnDia, meta: 5 },
  { id: 'nota1', grupo: 'sistema', icon: 'escribir', nombre: 'Primera nota', desc: 'Escribe una nota', dif: 1, valor: (t) => t.notas, meta: 1 },
  { id: 'nota10', grupo: 'sistema', icon: 'note', nombre: 'Cuaderno', desc: '10 notas escritas', dif: 2, valor: (t) => t.notas, meta: 10 },
];

// ------------------------------------------------------------ celebración ---

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Un único AudioContext: los navegadores limitan cuántos se pueden abrir.
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tocar(notas, { tipo = 'sine', volumen = 0.18, duracion = 0.25, paso = 0.09 } = {}) {
  const ac = ctx();
  const now = ac.currentTime;
  notas.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    const inicio = now + i * paso;
    gain.gain.setValueAtTime(0, inicio);
    gain.gain.linearRampToValueAtTime(volumen, inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, inicio + duracion);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(inicio);
    osc.stop(inicio + duracion);
  });
}

// Una rampa de frecuencia: la base de todo lo que suena a máquina.
function barrido(f0, f1, { tipo = 'sawtooth', volumen = 0.08, dur = 0.4, retraso = 0, curva = 'exp', filtro = null } = {}) {
  const ac = ctx();
  const t = ac.currentTime + retraso;
  const osc = ac.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(f0, t);
  if (curva === 'exp') osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  else osc.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volumen, t + Math.min(0.05, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let ultimo = osc;
  if (filtro) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(filtro[0], t);
    lp.frequency.exponentialRampToValueAtTime(filtro[1], t + dur);
    lp.Q.value = 6;
    osc.connect(lp);
    ultimo = lp;
  }
  ultimo.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Ruido blanco reutilizable: regenerarlo en cada pulsación sería gastar CPU en
// el gesto más frecuente de la app.
let bufferRuido = null;
function ruido() {
  const ac = ctx();
  if (!bufferRuido) {
    const largo = Math.floor(ac.sampleRate * 0.5);
    bufferRuido = ac.createBuffer(1, largo, ac.sampleRate);
    const datos = bufferRuido.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
  }
  return bufferRuido;
}

function chasquido({ freq, q, volumen, dur, retraso = 0, tipo = 'bandpass' }) {
  const ac = ctx();
  const t = ac.currentTime + retraso;
  const src = ac.createBufferSource();
  src.buffer = ruido();
  const f = ac.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(volumen, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

// El clic físico: un chasquido de ruido filtrado tan corto que se percibe como
// tacto, no como nota. Va por debajo del sonido de la acción — se siente el
// botón y se oye lo que hizo, sin que uno tape al otro. Cada zona de la app
// tiene su textura para que el oído sepa dónde está sin mirar.
const CLICS = {
  // Botón blando de goma: el gesto principal, marcar un hábito.
  suave:   { freq: 1500, q: 1.2, volumen: 0.026, dur: 0.028, tono: 620,  tvol: 0.014, tdur: 0.030 },
  // Pestañas: agudo y limpio, como una uña sobre cristal.
  cristal: { freq: 4200, q: 2.2, volumen: 0.020, dur: 0.016, tono: 2400, tvol: 0.007, tdur: 0.018 },
  // Work Mode: tecla mecánica, con cuerpo y algo de peso.
  tecla:   { freq: 950,  q: 1.0, volumen: 0.034, dur: 0.038, tono: 300,  tvol: 0.020, tdur: 0.045 },
  // Botones de panel: madera, mate y con caja.
  hueco:   { freq: 800,  q: 3.0, volumen: 0.028, dur: 0.036, tono: 400,  tvol: 0.016, tdur: 0.040 },
  // Destructivo: golpe seco y grave, sin brillo.
  seco:    { freq: 320,  q: 0.8, volumen: 0.030, dur: 0.050, tono: 150,  tvol: 0.018, tdur: 0.055 },
  // Selectores y micro-controles: un tic diminuto, casi un roce.
  micro:   { freq: 5600, q: 3.0, volumen: 0.016, dur: 0.012, tono: 0,    tvol: 0,     tdur: 0 },
  // Calendario: papel, mullido y sin filo.
  papel:   { freq: 2200, q: 0.7, volumen: 0.018, dur: 0.024, tono: 0,    tvol: 0,     tdur: 0 },
};

function clic(nombre = 'suave') {
  const c = CLICS[nombre] || CLICS.suave;
  chasquido({ freq: c.freq, q: c.q, volumen: c.volumen, dur: c.dur });
  // El cuerpo tonal es lo que separa un chasquido de un botón: unos
  // milisegundos de nota grave debajo del ruido y la mano cree haber pulsado
  // algo con mecanismo dentro.
  if (!c.tono) return;
  const ac = ctx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(c.tono, t);
  osc.frequency.exponentialRampToValueAtTime(c.tono * 0.6, t + c.tdur);
  const g = ac.createGain();
  g.gain.setValueAtTime(c.tvol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + c.tdur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + c.tdur + 0.02);
}

// Escala pentatónica: cada hábito suena en su propio grado, así el orden en que
// se completan forma una melodía en vez de un pitido repetido.
const PENTATONICA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

const sonidoHabito = (i) => {
  const base = PENTATONICA[i % PENTATONICA.length];
  tocar([base, base * 1.5], { tipo: 'sine', duracion: 0.22, paso: 0.07, volumen: 0.16 });
};
// Desmarcar también merece respuesta: dos notas descendentes, cortas y suaves,
// para que se note que se deshizo sin sonar a error.
const sonidoDeshacer = () => tocar([440, 349.23], { tipo: 'sine', volumen: 0.09, duracion: 0.16, paso: 0.06 });
const sonidoHito = () => tocar([659.25, 783.99, 987.77, 1318.51], { tipo: 'square', volumen: 0.09, duracion: 0.22 });
const sonidoPerfecto = () => tocar([523.25, 659.25, 783.99, 1046.5, 1318.51], { tipo: 'triangle', volumen: 0.2, duracion: 0.34, paso: 0.11 });
const sonidoNivel = () => tocar([392, 523.25, 659.25, 783.99, 1046.5], { tipo: 'triangle', volumen: 0.22, duracion: 0.45, paso: 0.1 });

// Sonidos de interfaz. Van mucho más bajos que los de completar un hábito: son
// acuse de recibo, no celebración, y se usan decenas de veces por sesión.
const sonidoTic = () => tocar([880], { tipo: 'sine', volumen: 0.05, duracion: 0.06, paso: 0 });
const sonidoSeg = () => tocar([740], { tipo: 'triangle', volumen: 0.06, duracion: 0.09, paso: 0 });
const sonidoAbrir = () => tocar([523.25, 659.25, 880], { tipo: 'triangle', volumen: 0.08, duracion: 0.15, paso: 0.045 });
const sonidoCerrar = () => tocar([659.25, 440], { tipo: 'sine', volumen: 0.07, duracion: 0.13, paso: 0.05 });
const sonidoGuardar = () => tocar([659.25, 830.61, 1046.5], { tipo: 'sine', volumen: 0.1, duracion: 0.2, paso: 0.055 });
const sonidoBorrar = () => tocar([233.08, 174.61], { tipo: 'sawtooth', volumen: 0.05, duracion: 0.17, paso: 0.06 });
const sonidoNav = (dir) => tocar(dir > 0 ? [587.33, 698.46] : [698.46, 587.33], { tipo: 'sine', volumen: 0.06, duracion: 0.1, paso: 0.045 });
const sonidoSelec = () => tocar([1046.5], { tipo: 'sine', volumen: 0.05, duracion: 0.07, paso: 0 });
const sonidoPincel = () => tocar([440, 554.37], { tipo: 'sine', volumen: 0.05, duracion: 0.1, paso: 0.035 });
const sonidoError = () => tocar([311.13, 233.08], { tipo: 'square', volumen: 0.06, duracion: 0.19, paso: 0.07 });
const sonidoEstrella = (activa) => (activa
  ? tocar([1046.5, 1318.51, 1567.98], { tipo: 'triangle', volumen: 0.08, duracion: 0.15, paso: 0.04 })
  : tocar([783.99, 523.25], { tipo: 'sine', volumen: 0.06, duracion: 0.12, paso: 0.05 }));

// Work Mode no es una pestaña más: es cambiar de modo. Suena a sistema que
// arranca — el aire que entra, el motor que sube, el anclaje en quinta abierta
// y una cola de armónicos que termina de dibujarse. Cinco capas en poco más de
// medio segundo.
function sonidoWorkMode() {
  // 1. Barrido de aire: prepara el oído, todavía sin altura definida.
  chasquido({ tipo: 'highpass', freq: 900, q: 0.6, volumen: 0.030, dur: 0.26 });
  // 2. Motor: dos sierras desafinadas que suben con el filtro abriéndose.
  barrido(150, 620, { tipo: 'sawtooth', volumen: 0.055, dur: 0.30, filtro: [500, 4200] });
  barrido(151.5, 626, { tipo: 'sawtooth', volumen: 0.038, dur: 0.30, filtro: [500, 4200] });
  // 3. Anclaje: quinta abierta al final del barrido, el «clac» de sistema listo.
  tocar([146.83, 220, 293.66, 440], { tipo: 'sawtooth', volumen: 0.045, duracion: 0.34, paso: 0 });
  // 4. Sub: le da el peso de tráiler sin ensuciar los agudos.
  barrido(110, 46, { tipo: 'sine', volumen: 0.085, dur: 0.55, retraso: 0.26 });
  // 5. Cola de datos: tres destellos agudos apagándose, como un HUD que acaba
  //    de cargar.
  setTimeout(() => tocar([1174.66, 1760, 2637], { tipo: 'triangle', volumen: 0.035, duracion: 0.30, paso: 0.055 }), 300);
}

// Qué suena al pulsar cada control. Lo específico va primero: el primer
// selector que coincide gana.
// Qué textura de clic le toca a cada control. Va aparte del sonido de la
// acción: aquí solo se decide cómo se siente el botón bajo el dedo.
function clicDelControl(el) {
  if (el.closest('.tab-work')) return 'tecla';
  if (el.closest('.topbar, .seg, .tab')) return 'cristal';
  if (el.closest('.act-borrar, .nota-borrar, .btn.danger, .nota-tag-x, .nt-quitar, .wt-borrar, .wt-paso-x, .wt-log-x')) return 'seco';
  if (el.closest('.color-dot, .icon-option, .nt-fuente, .nt-tamano, .nt-resaltador, .nota-destacar, .nota-tag-add')) return 'micro';
  if (el.closest('.day')) return 'papel';
  if (el.closest('.habit-card, .day-habit, .wt-paso-check')) return 'suave';
  if (el.closest('.btn, .panel, .editor, .modal')) return 'hueco';
  return 'suave';
}

function sonidoDelControl(el) {
  // Estos ya suenan desde su propio manejador, con la nota que les toca.
  if (el.closest('.habit-card, .day-habit, .wt-paso-check')) return;

  // Entrar en Work Mode es cambiar de modo, no navegar: se gana su propio
  // sonido y va antes que la regla general de la barra.
  if (el.closest('.tab-work')) return sonidoWorkMode();

  // El resto de la barra superior (pestañas y chip de nivel) comparte el
  // arpegio de «Empezar hoy»: es el sonido de abrir algo.
  if (el.closest('.topbar')) return sonidoAbrir();

  if (el.closest('.act-borrar, .nota-borrar, .btn.danger, .nota-tag-x, .nt-quitar, .wt-borrar, .wt-paso-x, .wt-log-x')) return sonidoBorrar();
  // Desplegar una tarea abre algo; plegarla lo cierra.
  if (el.closest('.wt-toggle')) return el.closest('.work-task').classList.contains('abierta') ? sonidoCerrar() : sonidoAbrir();
  if (el.closest('.wt-editar')) return sonidoAbrir();
  if (el.closest('#habito-guardar')) return sonidoGuardar();
  if (el.closest('#reto-reiniciar')) return sonidoAbrir();
  if (el.closest('.btn.ghost')) return sonidoCerrar();
  if (el.closest('.btn.primary, .nota-tag-add')) return sonidoAbrir();
  if (el.closest('#mes-anterior, .act-bajar')) return sonidoNav(-1);
  if (el.closest('#mes-siguiente, .act-subir')) return sonidoNav(1);
  if (el.closest('.seg')) return sonidoSeg();
  if (el.closest('.nota-destacar')) return sonidoEstrella(!el.closest('.nota-destacar').classList.contains('activa'));
  if (el.closest('.color-dot, .icon-option, .nt-fuente, .nt-tamano, .nt-resaltador')) return sonidoPincel();
  if (el.closest('.day')) return sonidoSelec();
  return sonidoTic();
}

// Un único oyente para toda la app: las vistas se repintan enteras y colgar el
// sonido de cada botón obligaría a volver a atarlo en cada render.
let ultimoSonidoUI = 0;
document.addEventListener('click', (e) => {
  const control = e.target.closest('button');
  if (!control || control.disabled) return;
  // Algunos clics disparan otro clic (el chip de nivel abre la pestaña
  // Progreso); sin esta ventana sonarían dos veces pisándose.
  const ahora = performance.now();
  if (ahora - ultimoSonidoUI < 90) return;
  ultimoSonidoUI = ahora;
  // El clic va siempre y para todos los botones; el sonido de la acción se
  // apila encima cuando lo hay.
  clic(clicDelControl(control));
  sonidoDelControl(control);
}, true);

function confeti(x, y, { grande = false, color = null } = {}) {
  const canvas = document.getElementById('confetti-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const c = canvas.getContext('2d');
  const colores = color ? [color, '#ffffff', '#fbbf24'] : ['#22c55e', '#4ade80', '#fbbf24', '#f472b6', '#38bdf8'];
  const suave = reducedMotion();
  const cantidad = suave ? (grande ? 16 : 8) : (grande ? 140 : 42);
  const fuerza = grande ? 13 : 8;

  const particulas = Array.from({ length: cantidad }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * fuerza,
    vy: Math.random() * -fuerza - 2,
    size: Math.random() * 6 + 3,
    color: colores[Math.floor(Math.random() * colores.length)],
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 12,
    vida: 64,
  }));

  function frame() {
    c.clearRect(0, 0, canvas.width, canvas.height);
    let vivas = false;
    for (const p of particulas) {
      if (p.vida <= 0) continue;
      vivas = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.32;
      p.vx *= 0.99;
      p.rot += p.vr;
      p.vida -= 1;
      c.save();
      c.translate(p.x, p.y);
      c.rotate((p.rot * Math.PI) / 180);
      c.fillStyle = p.color;
      c.globalAlpha = Math.max(p.vida / 64, 0);
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      c.restore();
    }
    if (vivas) requestAnimationFrame(frame);
    else c.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

// Onda que sale del punto exacto donde se pulsó: el clic se siente físico.
function ripple(el, evento) {
  if (reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const tamano = Math.max(r.width, r.height) * 1.15;
  const x = evento && evento.clientX ? evento.clientX : r.left + r.width / 2;
  const y = evento && evento.clientY ? evento.clientY : r.top + r.height / 2;
  const onda = document.createElement('span');
  onda.className = 'ripple';
  onda.style.width = `${tamano}px`;
  onda.style.height = `${tamano}px`;
  onda.style.left = `${x - r.left - tamano / 2}px`;
  onda.style.top = `${y - r.top - tamano / 2}px`;
  el.appendChild(onda);
  setTimeout(() => onda.remove(), 620);
}

function popup(x, y, texto, bonus) {
  const el = document.createElement('div');
  el.className = 'point-popup' + (bonus ? ' bonus' : '');
  el.textContent = texto;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1050);
}

// ------------------------------------------------------- luz ambiental ------
// El fondo responde al día: cuantos más hábitos hechos, más luz, y cada hábito
// completado enciende una mancha desenfocada de su propio color. Es material de
// fondo, no información: nunca tapa ni compite con el contenido.

// Posiciones fijas (en % del viewport) y tamaño en vmax. Fijas a propósito: si
// se sortearan, las luces saltarían de sitio en cada repintado y el fondo
// dejaría de sentirse como un espacio estable.
const POSICIONES_LUZ = [
  { x: 14, y: 12, t: 62 },
  { x: 86, y: 24, t: 54 },
  { x: 30, y: 74, t: 58 },
  { x: 72, y: 88, t: 50 },
  { x: 50, y: 40, t: 66 },
  { x: 6, y: 56, t: 46 },
  { x: 94, y: 66, t: 48 },
  { x: 44, y: 6, t: 44 },
];

function hexARGB(hex) {
  const limpio = String(hex || '').replace('#', '');
  if (limpio.length !== 6) return null;
  const n = parseInt(limpio, 16);
  return Number.isNaN(n) ? null : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Mezcla de los colores encendidos hoy: es el tinte que toma el halo del fondo.
function tinteDelDia(hechos) {
  const rgbs = hechos.map((h) => hexARGB(h.color)).filter(Boolean);
  if (rgbs.length === 0) return '34, 197, 94';   // verde de acento por defecto
  const suma = rgbs.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
  const n = rgbs.length;
  return `${Math.round(suma.r / n)}, ${Math.round(suma.g / n)}, ${Math.round(suma.b / n)}`;
}

function renderAmbiente() {
  const capa = document.getElementById('ambiente');
  const hoy = todayISO();
  const total = habits().length;
  const hechos = habits().filter((h) => isDone(hoy, h.id));
  const pct = total === 0 ? 0 : hechos.length / total;

  // Dos variables y el CSS hace el resto: el halo del fondo se abre con el
  // progreso y se tiñe del color de lo que ya está hecho.
  // En día perfecto el halo pasa a dorado, igual que los bordes: el estado se
  // lee como una sola cosa y no como el promedio deslavado de varios colores.
  // Las luces sí conservan el color de su hábito: son el detalle, no el marco.
  const raiz = document.documentElement;
  raiz.style.setProperty('--progreso', pct.toFixed(3));
  raiz.style.setProperty('--tinte-dia', esDiaPerfecto(hoy) ? '251, 191, 36' : tinteDelDia(hechos));

  // Se reutilizan los nodos que ya están: solo entran las luces nuevas y solo
  // salen las que se apagaron. Repintar todo haría parpadear el fondo entero
  // cada vez que se marca un hábito.
  const vivas = new Set(hechos.map((h) => h.id));
  for (const luz of capa.querySelectorAll('.luz')) {
    if (vivas.has(luz.dataset.habit)) continue;
    if (luz.classList.contains('saliendo')) continue;
    luz.classList.add('saliendo');
    setTimeout(() => luz.remove(), 900);
  }

  hechos.forEach((habit, i) => {
    // Comparando el dataset, sin construir un selector con el id dentro.
    const previa = [...capa.querySelectorAll('.luz:not(.saliendo)')]
      .some((l) => l.dataset.habit === habit.id);
    if (previa) return;

    const pos = POSICIONES_LUZ[i % POSICIONES_LUZ.length];
    const luz = document.createElement('span');
    luz.className = 'luz entrando';
    luz.dataset.habit = habit.id;
    luz.style.setProperty('--luz-color', habit.color);
    luz.style.setProperty('--luz-x', `${pos.x}%`);
    luz.style.setProperty('--luz-y', `${pos.y}%`);
    luz.style.setProperty('--luz-tam', `${pos.t}vmax`);
    // Cada luz deriva a su propio ritmo; si compartieran fase el fondo entero
    // latiría al unísono, que es justo lo que hay que evitar.
    luz.style.setProperty('--luz-fase', `${-(i * 7)}s`);
    capa.appendChild(luz);
    // La clase de entrada se quita en el siguiente fotograma para que la
    // animación arranque desde el estado inicial y no desde el final.
    requestAnimationFrame(() => luz.classList.remove('entrando'));
  });
}

// Día perfecto: mientras dure, los bordes de todos los controles pasan a dorado.
// Es un solo interruptor porque todos leen los mismos tokens de cristal.
function marcarDiaPerfecto() {
  document.body.classList.toggle('dia-perfecto', esDiaPerfecto(todayISO()));
}

function flashDiaPerfecto() {
  const flash = document.getElementById('perfect-day-flash');
  flash.classList.remove('flashing');
  void flash.offsetWidth;
  flash.classList.add('flashing');
}

function mostrarSubidaNivel(nivel) {
  const overlay = document.getElementById('levelup-overlay');
  document.getElementById('levelup-num').textContent = nivel;
  document.getElementById('levelup-sub').textContent = 'Sigue así, la constancia se nota.';
  overlay.hidden = false;
  sonidoNivel();
  confeti(window.innerWidth / 2, window.innerHeight / 2, { grande: true });
  setTimeout(() => { overlay.hidden = true; }, 2600);
}

let toastTimer = null;
let toastSalida = null;

// tipo: '' | 'ok' | 'error'. Entra y sale animado; si llega otro mensaje
// mientras uno está visible, se reinicia en vez de cortarse en seco.
function toast(mensaje, tipo = '') {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  clearTimeout(toastSalida);

  el.textContent = mensaje;
  el.className = `toast${tipo ? ` ${tipo}` : ''}`;
  el.hidden = false;
  if (tipo === 'error') sonidoError();
  void el.offsetWidth;          // reinicia la animación de entrada
  el.classList.add('visible');

  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    toastSalida = setTimeout(() => { el.hidden = true; }, 280);
  }, 2200);
}

// ----------------------------------------------------------- nivel / XP -----

function renderNivel({ animar = false } = {}) {
  const xp = calcularXP();
  const { nivel, dentro, necesita, pct } = nivelDesdeXP(xp);

  document.getElementById('level-badge').textContent = nivel;
  document.getElementById('level-num').textContent = nivel;
  // Sin espacios alrededor de la barra: en el chip compacto de la cabecera,
  // "50 / 220 XP" ocupaba casi el doble que "50/220" sin decir nada más. El
  // total completo sigue estando en el tooltip del chip.
  document.getElementById('level-xp').textContent = `${dentro}/${necesita}`;
  document.getElementById('level-chip').title =
    `Nivel ${nivel} · ${dentro} de ${necesita} XP para el siguiente — ver detalle`;
  document.getElementById('xp-fill').style.width = `${pct}%`;

  if (animar) {
    const chip = document.getElementById('level-chip');
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }

  if (state.nivelPrevio !== null && nivel > state.nivelPrevio) {
    setTimeout(() => mostrarSubidaNivel(nivel), 500);
  }
  state.nivelPrevio = nivel;
}

// ------------------------------------------------------------- vista Hoy ----

function mensajeDelDia(hechos, total, racha) {
  if (total === 0) return 'Crea tu primer hábito para empezar.';
  if (hechos === 0) return racha > 1 ? `No dejes caer la racha de ${racha} días.` : 'Empieza por uno. El primero es el que arrastra al resto.';
  if (hechos === total) return '¡Día perfecto! Los tienes todos.';
  const faltan = total - hechos;
  if (faltan === 1) return 'Te queda uno. Ciérralo.';
  if (hechos >= total / 2) return `Vas más de la mitad, te faltan ${faltan}.`;
  return `Buen arranque, te faltan ${faltan}.`;
}

function renderHero() {
  const hoy = todayISO();
  const total = habits().length;
  const hechos = doneCount(hoy);
  const pct = total === 0 ? 0 : hechos / total;
  const racha = rachaGlobal();

  // Tiene que coincidir con el r del <circle> y con stroke-dasharray del CSS.
  const CIRC = 2 * Math.PI * 62;
  document.getElementById('ring-fill').style.strokeDashoffset = CIRC * (1 - pct);
  document.getElementById('ring-count').textContent = `${hechos}/${total}`;

  document.getElementById('hero-date').textContent = new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  document.getElementById('hero-message').textContent = mensajeDelDia(hechos, total, racha);

  const chips = document.getElementById('hero-chips');
  chips.innerHTML = '';
  if (racha > 0) {
    chips.insertAdjacentHTML('beforeend',
      `<span class="chip flame">${iconSVG('fire', 16)}<span class="num">${racha}</span> ${racha === 1 ? 'día seguido' : 'días seguidos'}</span>`);
  }
  const t = totales();
  if (t.perfectos > 0) {
    chips.insertAdjacentHTML('beforeend',
      `<span class="chip good">${iconSVG('star', 16)}<span class="num">${t.perfectos}</span> ${t.perfectos === 1 ? 'día perfecto' : 'días perfectos'}</span>`);
  }
  chips.insertAdjacentHTML('beforeend',
    `<span class="chip">${iconSVG('bolt', 16)}<span class="num">${calcularXP()}</span> XP</span>`);
  const ld = calcularLuckyDollars(t);
  chips.insertAdjacentHTML('beforeend',
    `<span class="chip lucky" title="${moneda(ld.porHabitos)} de hábitos + ${moneda(ld.porLogros)} de logros">${iconSVG('trebol', 16)}<span class="num">${moneda(ld.total)}</span> Lucky Dollars</span>`);

  const dots = document.getElementById('week-dots');
  dots.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const iso = formatISO(addDays(new Date(), -i));
    const p = total === 0 ? 0 : doneCount(iso) / total;
    const nivel = p === 0 ? 0 : p <= 0.25 ? 1 : p <= 0.5 ? 2 : p < 1 ? 3 : 4;
    dots.insertAdjacentHTML('beforeend',
      `<span class="week-dot p${nivel}" title="${iso}: ${doneCount(iso)}/${total}"></span>`);
  }
}

// Tira de los últimos 7 días (el de más a la derecha es hoy). Los datos son
// binarios, así que segmentos encendidos/apagados se leen mejor que barras de
// altura variable.
function tiraSemanalHTML(habitId) {
  let html = '<div class="habit-strip" title="Últimos 7 días">';
  for (let i = 6; i >= 0; i--) {
    const fecha = addDays(new Date(), -i);
    const iso = formatISO(fecha);
    const hecho = isDone(iso, habitId);
    const dia = DIAS_SEMANA[weekdayIndex(fecha)];
    html += `<span class="habit-pill${hecho ? ' on' : ''}" title="${dia} ${iso}: ${hecho ? 'hecho' : 'sin hacer'}"></span>`;
  }
  return html + '</div>';
}

function renderHoy() {
  renderHero();

  const grid = document.getElementById('habit-grid');
  const vacio = document.getElementById('hoy-vacio');
  grid.innerHTML = '';
  vacio.hidden = habits().length > 0;

  const hoy = todayISO();

  habits().forEach((habit, index) => {
    const hecho = isDone(hoy, habit.id);
    const r = habit.rango;
    const actual = r && r.estrenado ? r.racha : 0;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'habit-card' + (hecho ? ' done' : '');
    card.style.setProperty('--habit', habit.color);
    card.setAttribute('aria-pressed', String(hecho));
    card.innerHTML = `
      <div class="habit-top">
        <span class="habit-icon">${iconSVG(habit.icon, 28)}</span>
        ${r && r.estrenado
          ? `<span class="habit-rango" title="${escapeHTML(tituloRango(r))}">${rangoSVG(r, 24)}</span>`
          : ''}
        <span class="habit-check">${iconSVG('check', 16)}</span>
      </div>
      <div class="habit-name">${escapeHTML(habit.name)}</div>
      <div class="habit-foot">
        <span class="habit-streak${actual > 0 ? ' on' : ''}">${iconSVG('fire', 15)}<span class="num">${actual}</span> ${actual === 1 ? 'día' : 'días'}</span>
        ${r && r.estrenado ? `<span class="habit-rr num">${r.enDivision}<span>/100</span></span>` : ''}
      </div>
      ${tiraSemanalHTML(habit.id)}
    `;

    // La entrada escalonada solo la primera vez: repetirla en cada marcado
    // convertiría un gesto rápido en una espera.
    if (!state.hoyPintado) card.style.setProperty('--i', index);

    card.addEventListener('click', (e) => alternarHabito(card, habit, index, e));
    grid.appendChild(card);
  });

  grid.classList.toggle('entrando', !state.hoyPintado);
  state.hoyPintado = true;
}

async function alternarHabito(card, habit, index, evento) {
  const fecha = todayISO();
  const estaba = isDone(fecha, habit.id);
  const ahora = !estaba;
  const total = habits().length;
  const antes = doneCount(fecha);

  // Acuse de recibo inmediato: estado, onda y sonido salen en el mismo
  // fotograma que la pulsación, sin esperar al servidor ni al repintado. Antes
  // los tres iban después del `await` y del render completo, y en ese hueco la
  // pulsación se sentía muerta.
  card.classList.toggle('done', ahora);
  card.setAttribute('aria-pressed', String(ahora));
  ripple(card, evento);
  if (ahora) sonidoHabito(index);
  else sonidoDeshacer();

  try {
    await markHabit(fecha, habit.id, ahora);
  } catch (err) {
    card.classList.toggle('done', estaba);
    card.setAttribute('aria-pressed', String(estaba));
    toast(`No se pudo guardar: ${err.message}`, 'error');
    return;
  }

  // Repintar sustituye las tarjetas, así que primero se refresca todo y
  // después se celebra sobre la tarjeta nueva; si no, la animación se perdía.
  renderTodo({ animarNivel: ahora });
  const viva = document.querySelectorAll('#habit-grid .habit-card')[index] || card;

  if (ahora) {
    const rect = viva.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;

    confeti(cx, rect.top + rect.height / 2, { color: habit.color });
    popup(cx, rect.top, `+${XP_POR_HABITO} XP · +${LD_POR_HABITO} LD`);
    viva.classList.add('celebrating');
    setTimeout(() => viva.classList.remove('celebrating'), 520);

    const { actual } = rachaDe(habit.id);
    if ([3, 7, 14, 30, 60, 100, 200, 365].includes(actual)) {
      setTimeout(() => {
        sonidoHito();
        popup(cx, rect.top - 26, `${actual} días seguidos`, true);
      }, 240);
    }

    if (antes < total && doneCount(fecha) === total) {
      setTimeout(() => {
        sonidoPerfecto();
        flashDiaPerfecto();
        confeti(window.innerWidth / 2, window.innerHeight / 2, { grande: true });
        popup(window.innerWidth / 2, window.innerHeight / 2 - 40, `+${XP_DIA_PERFECTO} XP · ¡Día perfecto!`, true);
      }, 340);
    }
  } else {
    viva.classList.add('deshaciendo');
    setTimeout(() => viva.classList.remove('deshaciendo'), 340);
  }
}

// ------------------------------------------------------------ Identity Shift
// El reto son 30 días perfectos. Arranca solo el día en que se completan por
// primera vez todos los hábitos, y hasta entonces la rueda está en espera.
// Una rueda: un anillo por hábito (el 1 es el de dentro) y un sector por día.
// Verde = hecho, rojo = se dejó pasar, apagado = todavía no llega. Es solo de
// lectura: para marcar están las tarjetas de Hoy y el detalle del Historial.

const RETO_DIAS = 30;

// null mientras no haya un primer día perfecto: el reto todavía no empezó.
function retoInicio() {
  const reto = state.data.challenge || {};
  return /^\d{4}-\d{2}-\d{2}$/.test(reto.startDate || '') ? reto.startDate : null;
}

// Día 1 = la fecha de inicio.
function retoFecha(n) {
  const inicio = retoInicio();
  return inicio ? formatISO(addDays(parseISO(inicio), n - 1)) : null;
}

// En qué día del reto cae hoy. 0 si aún no ha empezado, y puede pasar de 30 si
// la ventana ya terminó.
function retoDiaHoy() {
  const inicio = retoInicio();
  if (!inicio) return 0;
  return Math.round((parseISO(todayISO()) - parseISO(inicio)) / 86400000) + 1;
}

// 0° arriba y en el sentido de las agujas del reloj, como el reto en papel.
function puntoPolar(r, grados) {
  const rad = ((grados - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

// Trozo de anillo entre dos radios y dos ángulos: la casilla de la rueda.
function sectorAnular(rInt, rExt, g1, g2) {
  const [x1, y1] = puntoPolar(rExt, g1);
  const [x2, y2] = puntoPolar(rExt, g2);
  const [x3, y3] = puntoPolar(rInt, g2);
  const [x4, y4] = puntoPolar(rInt, g1);
  const largo = g2 - g1 > 180 ? 1 : 0;
  const n = (v) => v.toFixed(2);
  return `M${n(x1)} ${n(y1)}A${rExt} ${rExt} 0 ${largo} 1 ${n(x2)} ${n(y2)}`
    + `L${n(x3)} ${n(y3)}A${rInt} ${rInt} 0 ${largo} 0 ${n(x4)} ${n(y4)}Z`;
}

function renderReto() {
  const panel = document.getElementById('reto-panel');
  const lista = habits();
  panel.hidden = lista.length === 0;
  if (lista.length === 0) return;

  const hoy = todayISO();
  const inicio = retoInicio();
  const diaHoy = retoDiaHoy();

  // El grosor de cada anillo se reparte el radio disponible, con tope para que
  // con pocos hábitos no salgan anillos gigantes.
  const R0 = 58;
  const grosor = Math.min(26, (188 - R0) / lista.length);
  const RExt = R0 + grosor * lista.length;
  const rNum = RExt + 16;
  const borde = rNum + 14;
  const paso = 360 / RETO_DIAS;
  const hueco = 0.9;              // grados de aire entre casillas

  let celdas = '';
  let numeros = '';
  let arcosPerfectos = '';
  let perfectos = 0;
  const porHabito = lista.map(() => 0);

  for (let dia = 1; dia <= RETO_DIAS; dia += 1) {
    const iso = retoFecha(dia);
    const g1 = (dia - 1) * paso + hueco / 2;
    const g2 = dia * paso - hueco / 2;
    let hechosDelDia = 0;

    lista.forEach((habit, i) => {
      // Sin fecha de inicio no hay nada que juzgar: la rueda queda en espera.
      const hecho = Boolean(iso) && isDone(iso, habit.id);
      const estado = !iso || iso > hoy ? 'futuro'
        : hecho ? 'hecho'
        : iso === hoy ? 'pendiente'
        : 'fallado';
      if (hecho) { hechosDelDia += 1; porHabito[i] += 1; }

      const d = sectorAnular(R0 + grosor * i + 0.8, R0 + grosor * (i + 1) - 0.8, g1, g2);
      celdas += `<path class="reto-cell ${estado}" d="${d}" style="--habit:${habit.color}">`
        + `<title>${escapeHTML(habit.name)} · día ${dia}${iso ? ` — ${iso}` : ''}</title></path>`;
    });

    // Un día solo cuenta si están TODOS los hábitos: eso es un día perfecto.
    if (iso && iso <= hoy && hechosDelDia === lista.length) {
      perfectos += 1;
      arcosPerfectos += `<path class="reto-perfecto" d="${sectorAnular(RExt + 2, RExt + 5, g1, g2)}"></path>`;
    }

    const [nx, ny] = puntoPolar(rNum, (dia - 0.5) * paso);
    numeros += `<text class="reto-num${dia === diaHoy ? ' hoy' : ''}" x="${nx.toFixed(2)}" y="${ny.toFixed(2)}">${dia}</text>`;
  }

  let marcaHoy = '';
  if (diaHoy >= 1 && diaHoy <= RETO_DIAS) {
    marcaHoy = `<path class="reto-marca-hoy" d="${sectorAnular(R0 - 4, RExt + 4, (diaHoy - 1) * paso, diaHoy * paso)}"></path>`;
  }

  const etiquetaDia = !inicio ? 'en espera'
    : diaHoy > RETO_DIAS ? 'terminado'
    : `día ${diaHoy} de ${RETO_DIAS}`;

  const centro = `
    <circle class="reto-centro-fondo" cx="0" cy="0" r="${R0 - 7}"></circle>
    <text class="reto-centro-num" x="0" y="-8">${perfectos}<tspan class="reto-centro-de">/${RETO_DIAS}</tspan></text>
    <text class="reto-centro-txt" x="0" y="12">días perfectos</text>
    <text class="reto-centro-pie" x="0" y="27">${etiquetaDia}</text>`;

  document.getElementById('reto-rueda').innerHTML = `
    <svg class="reto-svg" viewBox="${-borde} ${-borde} ${borde * 2} ${borde * 2}"
         role="img" aria-label="Identity Shift: ${perfectos} de ${RETO_DIAS} días perfectos">
      ${celdas}${arcosPerfectos}${marcaHoy}${numeros}${centro}
    </svg>`;

  document.getElementById('reto-leyenda').innerHTML = lista.map((habit, i) => `
    <li class="reto-hab" style="--habit:${habit.color}">
      <span class="reto-hab-n">${i + 1}</span>
      <span class="reto-hab-icono">${iconSVG(habit.icon, 18)}</span>
      <span class="reto-hab-nombre">${escapeHTML(habit.name)}</span>
      <span class="reto-hab-cuenta"><b class="num">${porHabito[i]}</b>/${RETO_DIAS}</span>
    </li>`).join('');

  const completo = perfectos === RETO_DIAS;
  document.getElementById('reto-stats').innerHTML = `
    ${completo ? `<span class="chip good">${iconSVG('trophy', 16)}¡Reto completado!</span>` : ''}
    <span class="chip good">${iconSVG('star', 16)}<span class="num">${perfectos}</span>/${RETO_DIAS} días perfectos</span>
    ${inicio && diaHoy <= RETO_DIAS
      ? `<span class="chip">${iconSVG('calendar', 16)}<span class="num">${Math.max(0, RETO_DIAS - Math.max(diaHoy, 0))}</span> por delante</span>`
      : ''}`;

  const automatico = (state.data.challenge || {}).auto !== false;
  const fechaLarga = (iso) => parseISO(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('reto-sub').textContent = inicio
    ? `Inicio: ${fechaLarga(inicio)}${automatico ? ' (tu primer día perfecto)' : ' (fijado a mano)'}`
    : 'Empieza solo el día que completes todos tus hábitos.';

  document.getElementById('reto-ayuda').textContent =
    `Un día cuenta cuando completas los ${lista.length}.`;

  // Si la fecha se fijó a mano, el mismo botón sirve para volver al automático.
  const boton = document.getElementById('reto-reiniciar');
  boton.dataset.modo = automatico ? 'fijar' : 'auto';
  boton.innerHTML = automatico
    ? `${iconSVG('fire', 17)}Empezar hoy`
    : `${iconSVG('calendar', 17)}Volver a automático`;
}

// -------------------------------------------------------- vista Historial ---

function renderHistorial() {
  const year = state.historialMonth.getFullYear();
  const month = state.historialMonth.getMonth();

  document.getElementById('mes-actual').textContent = state.historialMonth.toLocaleDateString('es', {
    month: 'long', year: 'numeric',
  });

  document.getElementById('historial-mes').hidden = state.historialModo !== 'mes';
  document.getElementById('historial-matriz').hidden = state.historialModo !== 'matriz';

  if (state.historialModo === 'mes') renderCalendario(year, month);
  else renderMatriz(year, month);
}

function renderCalendario(year, month) {
  const cabecera = document.getElementById('weekday-row');
  cabecera.innerHTML = DIAS_SEMANA.map((d) => `<span class="weekday">${d}</span>`).join('');

  const grid = document.getElementById('calendar');
  grid.innerHTML = '';

  const total = habits().length;
  const hoy = todayISO();
  const primerDia = new Date(year, month, 1);
  const huecos = weekdayIndex(primerDia);
  const diasDelMes = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < huecos; i++) {
    grid.insertAdjacentHTML('beforeend', '<div class="day empty"></div>');
  }

  for (let dia = 1; dia <= diasDelMes; dia++) {
    const iso = formatISO(new Date(year, month, dia));
    const hechos = doneCount(iso);
    const pct = total === 0 ? 0 : Math.round((hechos / total) * 100);
    const futuro = iso > hoy;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day'
      + (iso === hoy ? ' hoy' : '')
      + (futuro ? ' futuro' : '')
      + (esDiaPerfecto(iso) ? ' perfecto' : '')
      + (iso === state.diaSeleccionado ? ' selected' : '');
    btn.disabled = futuro;
    btn.title = futuro ? iso : `${iso} — ${hechos}/${total}`;
    btn.innerHTML = `
      <span class="day-ring" style="--pct:${pct}"></span>
      <span class="day-num">${dia}</span>
    `;
    btn.addEventListener('click', () => {
      state.diaSeleccionado = state.diaSeleccionado === iso ? null : iso;
      renderCalendario(year, month);
      renderDetalleDia();
    });
    grid.appendChild(btn);
  }

  renderDetalleDia();
}

function renderDetalleDia() {
  const panel = document.getElementById('day-detail');
  const iso = state.diaSeleccionado;

  if (!iso) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const fecha = parseISO(iso);
  panel.hidden = false;
  panel.innerHTML = `
    <div class="day-detail-head">
      <span class="day-detail-title">${fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span class="chip">${doneCount(iso)}/${habits().length} completados</span>
    </div>
    <div class="day-detail-list" id="day-detail-list"></div>
  `;

  const lista = panel.querySelector('#day-detail-list');
  for (const habit of habits()) {
    const hecho = isDone(iso, habit.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'day-habit' + (hecho ? ' done' : '');
    row.style.setProperty('--habit', habit.color);
    row.setAttribute('aria-pressed', String(hecho));
    row.innerHTML = `
      <span class="dh-icon">${iconSVG(habit.icon, 21)}</span>
      <span class="dh-name">${escapeHTML(habit.name)}</span>
      <span class="dh-check">${iconSVG('check', 14)}</span>
    `;
    row.addEventListener('click', async (e) => {
      // Igual que en las tarjetas de Hoy: el estado y el sonido no esperan al
      // servidor. Si el guardado falla, se deshace y se avisa.
      row.classList.toggle('done', !hecho);
      row.setAttribute('aria-pressed', String(!hecho));
      if (hecho) sonidoDeshacer();
      else sonidoHabito(habits().indexOf(habit));

      try {
        await markHabit(iso, habit.id, !hecho);
      } catch (err) {
        row.classList.toggle('done', hecho);
        row.setAttribute('aria-pressed', String(hecho));
        toast(`No se pudo guardar: ${err.message}`, 'error');
        return;
      }
      if (!hecho) confeti(e.clientX, e.clientY, { color: habit.color });
      renderTodo();
    });
    lista.appendChild(row);
  }
}

function renderMatriz(year, month) {
  const grid = document.getElementById('matrix');
  grid.innerHTML = '';

  const lista = habits();
  grid.style.gridTemplateColumns = `40px repeat(${lista.length}, minmax(22px, 108px))`;

  grid.insertAdjacentHTML('beforeend', '<div class="mx-corner"></div>');
  for (const habit of lista) {
    const head = document.createElement('div');
    head.className = 'mx-head';
    head.style.setProperty('--habit', habit.color);
    head.title = habit.name;
    head.innerHTML = `${iconSVG(habit.icon, 19)}<span class="mx-head-name">${escapeHTML(habit.name)}</span>`;
    grid.appendChild(head);
  }

  const hoy = todayISO();
  const diasDelMes = new Date(year, month + 1, 0).getDate();
  for (let dia = 1; dia <= diasDelMes; dia++) {
    const iso = formatISO(new Date(year, month, dia));
    grid.insertAdjacentHTML('beforeend',
      `<div class="mx-day${iso === hoy ? ' hoy' : ''}">${dia}</div>`);
    for (const habit of lista) {
      const hecho = isDone(iso, habit.id);
      const cell = document.createElement('div');
      cell.className = 'mx-cell' + (hecho ? ' done' : '') + (iso > hoy ? ' futuro' : '');
      cell.style.setProperty('--habit', habit.color);
      cell.title = `${habit.name} — ${iso}`;
      grid.appendChild(cell);
    }
  }
}

// --------------------------------------------------------- vista Progreso ---

function mejorDiaSemana() {
  const suma = Array(7).fill(0);
  const cuenta = Array(7).fill(0);
  for (const iso of fechasConRegistro()) {
    const i = weekdayIndex(parseISO(iso));
    suma[i] += doneCount(iso);
    cuenta[i] += 1;
  }
  let mejor = -1;
  let mejorMedia = -1;
  for (let i = 0; i < 7; i++) {
    if (cuenta[i] === 0) continue;
    const media = suma[i] / cuenta[i];
    if (media > mejorMedia) { mejorMedia = media; mejor = i; }
  }
  return mejor === -1 ? null : { dia: DIAS_SEMANA_LARGO[mejor], media: mejorMedia };
}

function renderProgreso() {
  const t = totales();
  const xp = calcularXP();
  const { nivel } = nivelDesdeXP(xp);
  const mejorDia = mejorDiaSemana();
  const ld = calcularLuckyDollars(t);

  const tiles = [
    { clase: 'gold', icon: 'star', label: 'Nivel', valor: nivel, sub: `${xp} XP acumulados` },
    { clase: 'green', icon: 'fire', label: 'Mejor racha', valor: t.mejorRacha, sub: t.mejorRacha === 1 ? 'día' : 'días' },
    { clase: 'blue', icon: 'sealcheck', label: 'Completados', valor: t.completados, sub: `en ${t.diasActivos} ${t.diasActivos === 1 ? 'día' : 'días'}` },
    { clase: 'violet', icon: 'trophy', label: 'Días perfectos', valor: t.perfectos, sub: 'con todo hecho' },
    { clase: 'green', icon: 'calendar', label: 'Mejor día', valor: mejorDia ? mejorDia.dia.slice(0, 3) : '—', sub: mejorDia ? `${mejorDia.media.toFixed(1)} hábitos de media` : 'sin datos aún' },
    { clase: 'gold', icon: 'bolt', label: 'Racha actual', valor: rachaGlobal(), sub: 'días con actividad' },
    { clase: 'lucky', icon: 'trebol', label: 'Lucky Dollars', valor: moneda(ld.total), sub: `${moneda(ld.porHabitos)} de hábitos · ${moneda(ld.porLogros)} de logros` },
  ];

  document.getElementById('stat-tiles').innerHTML = tiles.map((t2, i) => `
    <div class="tile ${t2.clase}" style="--i: ${i}">
      <div class="tile-head">${iconSVG(t2.icon, 17)}${t2.label}</div>
      <div class="tile-value">${t2.valor}</div>
      <div class="tile-sub">${t2.sub}</div>
    </div>
  `).join('');

  renderLogros(t);
  renderHeatmap();
  renderStatsPorHabito();
}

// Logros agrupados por tema. Los bloqueados muestran cuánto falta, así el
// panel deja de ser una pared de iconos apagados y pasa a ser una hoja de ruta.
function renderLogros(t) {
  const conseguidos = LOGROS.filter((l) => l.valor(t) >= l.meta);
  const porCobrar = LOGROS.reduce((n, l) => n + (l.valor(t) >= l.meta ? 0 : premioLogro(l)), 0);
  document.getElementById('logros-cuenta').textContent =
    `${conseguidos.length} de ${LOGROS.length} · quedan ${moneda(porCobrar)} LD por cobrar`;

  document.getElementById('badges').innerHTML = GRUPOS_LOGROS.map((g) => {
    const delGrupo = LOGROS.filter((l) => l.grupo === g.id);
    if (delGrupo.length === 0) return '';
    const hechos = delGrupo.filter((l) => l.valor(t) >= l.meta).length;

    const tarjetas = delGrupo.map((l) => {
      const valor = Math.min(l.valor(t), l.meta);
      const abierto = valor >= l.meta;
      const pct = Math.round((valor / l.meta) * 100);
      const premio = premioLogro(l);
      return `
        <div class="badge${abierto ? ' unlocked' : ''} dif-${l.dif}"
             title="${NOMBRE_DIFICULTAD[l.dif]} · ${abierto ? `cobrado: ${moneda(premio)} LD` : `${valor} de ${l.meta} · paga ${moneda(premio)} LD`}">
          <span class="badge-icon">${iconSVG(l.icon, 30)}</span>
          <span class="badge-name">${l.nombre}</span>
          <span class="badge-desc">${l.desc}</span>
          <span class="badge-premio">${iconSVG('trebol', 14)}<span class="num">${moneda(premio)}</span> LD</span>
          ${abierto
            ? `<span class="badge-done">${iconSVG('check', 15)}Conseguido</span>`
            : `<span class="badge-progress">
                 <span class="badge-track"><span class="badge-fill" style="width:${pct}%"></span></span>
                 <span class="badge-num num">${valor}/${l.meta}</span>
               </span>`}
        </div>
      `;
    }).join('');

    return `
      <section class="badge-grupo">
        <h3 class="badge-grupo-title">${g.nombre}<span class="badge-grupo-count num">${hechos}/${delGrupo.length}</span></h3>
        <div class="badges-grid">${tarjetas}</div>
      </section>
    `;
  }).join('');
}

// Heatmap anual: columnas = semanas, filas = lunes..domingo, igual que GitHub.
// Además de las celdas se pintan las etiquetas de mes arriba y los días a la
// izquierda; sin ellas la cuadrícula no se podía leer.
function renderHeatmap() {
  const cont = document.getElementById('heatmap');
  const filaMeses = document.getElementById('hm-months');
  const colDias = document.getElementById('hm-days');
  cont.innerHTML = '';
  filaMeses.innerHTML = '';
  cont.closest('.heatmap-grid').style.setProperty('--hm-semanas', SEMANAS_HEATMAP);

  const total = habits().length;
  const hoy = new Date();
  // Retrocede hasta el lunes de hace 52 semanas para que las columnas cuadren.
  const finSemana = addDays(hoy, 6 - weekdayIndex(hoy));
  const inicio = addDays(finSemana, -(SEMANAS_HEATMAP * 7) + 1);

  // Etiquetas de día: solo lunes, miércoles y viernes, como en GitHub. Con las
  // siete el texto no cabe entre celdas de 12px.
  colDias.innerHTML = DIAS_SEMANA
    .map((d, i) => `<span class="hm-day">${i % 2 === 0 && i < 6 ? d : ''}</span>`)
    .join('');

  // Etiquetas de mes: una por columna en la que empieza un mes nuevo. El primer
  // mes del rango casi siempre viene partido y ocupa una o dos columnas; si su
  // nombre no cabe antes del siguiente se descarta, porque se montarían.
  const etiquetas = [];
  let mesPrevio = -1;
  for (let semana = 0; semana < SEMANAS_HEATMAP; semana++) {
    const primerDia = addDays(inicio, semana * 7);
    if (primerDia.getMonth() === mesPrevio) continue;
    mesPrevio = primerDia.getMonth();
    etiquetas.push({ semana, nombre: primerDia.toLocaleDateString('es', { month: 'short' }).replace('.', '') });
  }

  filaMeses.innerHTML = etiquetas
    .filter((e, i) => {
      const siguiente = etiquetas[i + 1];
      return siguiente ? siguiente.semana - e.semana >= 3 : SEMANAS_HEATMAP - e.semana >= 3;
    })
    .map((e) => `<span class="hm-month" style="grid-column:${e.semana + 1}">${e.nombre}</span>`)
    .join('');

  let diasActivos = 0;

  for (let semana = 0; semana < SEMANAS_HEATMAP; semana++) {
    for (let dia = 0; dia < 7; dia++) {
      const fecha = addDays(inicio, semana * 7 + dia);
      const iso = formatISO(fecha);
      const futuro = fecha > hoy;
      const hechos = doneCount(iso);
      if (!futuro && hechos > 0) diasActivos += 1;
      const p = total === 0 ? 0 : hechos / total;
      const nivel = futuro || p === 0 ? '' : p <= 0.25 ? 'l1' : p <= 0.5 ? 'l2' : p < 1 ? 'l3' : 'l4';
      const fechaLarga = fecha.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
      cont.insertAdjacentHTML('beforeend',
        `<span class="hm-cell ${nivel}${futuro ? ' futuro' : ''}" title="${fechaLarga}: ${futuro ? 'por venir' : `${hechos}/${total}`}"></span>`);
    }
  }

  const resumen = document.getElementById('heatmap-resumen');
  resumen.textContent = total === 0
    ? 'Crea tu primer hábito para empezar a llenar el año.'
    : `${diasActivos} ${diasActivos === 1 ? 'día activo' : 'días activos'} en las últimas ${SEMANAS_HEATMAP} semanas.`;

  // En pantallas estrechas la cuadrícula se desplaza: hay que dejarla al final,
  // que es donde está hoy, en vez de en un lunes de hace un año.
  const scroll = document.getElementById('heatmap-scroll');
  requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });
}

// La escalera completa, con las nueve ligas a la vista. Enseñar solo dónde
// estás no dice nada; enseñar hasta dónde llega la cosa es lo que hace que
// Bronce II se sienta como el principio de algo y no como una etiqueta.
// Las que ya se han tocado alguna vez van encendidas, el resto esperando.
//
// Es lo primero de Progreso a propósito: los rangos son el marcador del sitio,
// y los logros —que son una lista larga y estática— sepultaban la escalera bajo
// tres pantallazos de scroll.
function renderEscalera() {
  const cont = document.getElementById('escalera');
  const pie = document.getElementById('escalera-pie');
  if (!cont) return;

  const rangos = habits().map((h) => h.rango).filter((r) => r && r.estrenado);
  const techo = rangos.length ? Math.max(...rangos.map((r) => r.liga)) : -1;
  // Cuántos hábitos hay parados en cada liga, para poner el contador encima.
  const cuantos = LIGAS.map((_, i) => rangos.filter((r) => r.liga === i).length);

  cont.innerHTML = LIGAS.map((nombre, i) => `
    <div class="peldaño liga-${i}${i <= techo ? ' alcanzado' : ''}${i === techo ? ' cima' : ''}">
      <span class="peldaño-cara">
        ${rangoSVG({ nombre, division: nombre === 'Radiante' ? '' : 'III', liga: i }, 52)}
        ${cuantos[i] ? `<span class="peldaño-cuenta num" title="${cuantos[i]} ${cuantos[i] === 1 ? 'hábito' : 'hábitos'} aquí">${cuantos[i]}</span>` : ''}
      </span>
      <span class="peldaño-nombre">${nombre}</span>
    </div>`).join('');

  if (techo === -1) {
    pie.textContent = 'Marca un hábito una vez y empiezas por Hierro I. Radiante son unos siete meses sin fallar.';
  } else if (techo === LIGAS.length - 1) {
    pie.textContent = 'Estás en la cima. Ahí arriba un fallo cuesta más de lo que da un día bueno: mantenerse es el juego.';
  } else {
    pie.textContent = `Lo más alto que llevas es ${LIGAS[techo]}. Lo siguiente es ${LIGAS[techo + 1]}.`;
  }
}

function renderStatsPorHabito() {
  renderEscalera();
  const cont = document.getElementById('habit-stats');
  cont.innerHTML = '';

  if (habits().length === 0) {
    cont.innerHTML = '<p class="empty-state">Sin hábitos todavía.</p>';
    return;
  }

  for (const habit of habits()) {
    // Igual que en la lista de Hábitos: las cifras que entienden la pauta son
    // las del servidor. rachaDe() cuenta calendario y aquí eso ya no vale.
    const r = habit.rango;
    const actual = r && r.estrenado ? r.racha : 0;
    const maxima = r && r.estrenado ? r.maxima : 0;
    const pct = r && r.estrenado ? r.constancia : 0;

    // Últimas 4 semanas: cuántos días de cada 7 se completó.
    const semanas = [];
    for (let s = 3; s >= 0; s--) {
      let n = 0;
      for (let d = 0; d < 7; d++) {
        const iso = formatISO(addDays(new Date(), -(s * 7 + d)));
        if (isDone(iso, habit.id)) n += 1;
      }
      semanas.push(n);
    }

    const row = document.createElement('div');
    row.className = 'hs-row';
    row.style.setProperty('--habit', habit.color);
    row.innerHTML = `
      <div class="hs-title">${iconSVG(habit.icon, 21)}${escapeHTML(habit.name)}</div>
      <div class="hs-numbers">
        <span class="hs-stat flame">${iconSVG('fire', 16)}<b>${actual}</b></span>
        <span class="hs-stat">${iconSVG('trophy', 16)}máx <b>${maxima}</b></span>
        <span class="hs-stat" title="De los días que tocaban">${iconSVG('sealcheck', 16)}<b>${pct}%</b></span>
        <span class="hs-weeks" title="Últimas 4 semanas">
          ${semanas.map((n, i) => `<span class="hs-week${i === 3 ? ' last' : ''}" style="height:${4 + n * 3}px" title="${n}/7"></span>`).join('')}
        </span>
      </div>
      ${barraRango(r)}
    `;
    cont.appendChild(row);
  }
}

// ------------------------------------------------------------ vista Notas ---

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Fechas cercanas se leen mejor en relativo que con la fecha completa.
function formatNoteTimestamp(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const hoy = new Date();
  const mismoDia = (a, b) => formatISO(a) === formatISO(b);
  if (mismoDia(d, hoy)) return `Hoy, ${hora}`;
  if (mismoDia(d, addDays(hoy, -1))) return `Ayer, ${hora}`;
  const mismoAno = d.getFullYear() === hoy.getFullYear();
  const fecha = d.toLocaleDateString('es', mismoAno
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' });
  return `${fecha}, ${hora}`;
}

function mostrarGuardado(el, texto = 'Guardado') {
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), 1500);
}

// ---------------------------------------------------- notas: contenido HTML --

const TAGS_HTML_OK = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'br', 'div', 'p', 'span',
  'ul', 'ol', 'li', 'blockquote', 'code',
]);

// El editor es contenteditable, así que lo que se guarda es HTML. Antes de
// mandarlo al servidor se poda contra la misma lista blanca que usa el backend:
// lo que no está permitido pierde la etiqueta pero conserva el texto.
function limpiarHTML(html) {
  const doc = new DOMParser().parseFromString(`<div id="raiz">${html}</div>`, 'text/html');
  const raiz = doc.getElementById('raiz');

  const limpiar = (nodo) => {
    for (const hijo of [...nodo.childNodes]) {
      if (hijo.nodeType === Node.TEXT_NODE) continue;
      if (hijo.nodeType !== Node.ELEMENT_NODE) { hijo.remove(); continue; }
      limpiar(hijo);   // primero los hijos: así desenvolver es seguro
      const tag = hijo.tagName.toLowerCase();
      if (!TAGS_HTML_OK.has(tag)) {
        desenvolver(hijo);
        continue;
      }
      const clases = (hijo.getAttribute('class') || '')
        .split(/\s+/).filter((c) => /^hl(-[a-z]+)?$/.test(c));
      for (const attr of [...hijo.attributes]) hijo.removeAttribute(attr.name);
      if (clases.length) hijo.setAttribute('class', clases.join(' '));
    }
  };

  limpiar(raiz);
  return raiz.innerHTML;
}

// Quita la etiqueta pero deja dentro lo que había.
function desenvolver(el) {
  const padre = el.parentNode;
  if (!padre) return;
  while (el.firstChild) padre.insertBefore(el.firstChild, el);
  padre.removeChild(el);
}

function htmlAtexto(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------ notas: formato rico --

function seleccionEnEditor(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

// Si el cursor se fue a otra parte, lo devuelve al final de la nota para que el
// botón siempre haga algo en vez de fallar en silencio.
function asegurarFoco(editor) {
  if (seleccionEnEditor(editor)) return;
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function ejecutarComando(editor, comando) {
  asegurarFoco(editor);
  document.execCommand(comando, false, null);
}

function aplicarResaltado(editor, clave) {
  asegurarFoco(editor);
  const range = seleccionEnEditor(editor);
  if (!range || range.collapsed) return false;

  const mark = document.createElement('mark');
  mark.className = `hl hl-${clave}`;
  try {
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  } catch (err) {
    return false;
  }

  // Resaltar encima de otro resaltado deja marcas anidadas: gana la de fuera.
  mark.querySelectorAll('mark').forEach(desenvolver);
  editor.normalize();

  const sel = window.getSelection();
  const nuevo = document.createRange();
  nuevo.selectNodeContents(mark);
  sel.removeAllRanges();
  sel.addRange(nuevo);
  return true;
}

function quitarResaltado(editor) {
  asegurarFoco(editor);
  const range = seleccionEnEditor(editor);
  if (!range) return false;
  const marcas = [...editor.querySelectorAll('mark')]
    .filter((m) => range.collapsed ? m.contains(range.startContainer) : range.intersectsNode(m));
  if (marcas.length === 0) return false;
  marcas.forEach(desenvolver);
  editor.normalize();
  return true;
}

// ------------------------------------------------------------ notas: tarjeta -

// Color estable por etiqueta: la misma etiqueta siempre se ve igual.
function colorEtiqueta(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return PALETA_TAGS[hash % PALETA_TAGS.length];
}

function chipEtiqueta(tag, { borrable = false } = {}) {
  const seguro = escapeHTML(tag);
  return `
    <span class="nota-tag" style="--tag: ${colorEtiqueta(tag)}" data-tag="${seguro}">
      <span class="nota-tag-txt">#${seguro}</span>
      ${borrable ? `<button class="nota-tag-x" type="button" title="Quitar etiqueta" aria-label="Quitar ${seguro}">${iconSVG('close', 13)}</button>` : ''}
    </span>`;
}

function panelFuentes(activa) {
  return NOTE_FONTS.map((g) => `
    <div class="nt-grupo-titulo">${g.grupo}</div>
    <div class="nt-fuentes">
      ${g.fuentes.map((f) => `
        <button class="nt-fuente nota-font-${f.key} ${f.key === activa ? 'activa' : ''}" type="button" data-font="${f.key}">
          <span class="nt-fuente-muestra">Aa</span>
          <span class="nt-fuente-nombre">${f.label}</span>
        </button>`).join('')}
    </div>`).join('');
}

function renderNoteCard(note) {
  const card = document.createElement('article');
  card.className = 'nota-entry';
  card.dataset.id = note.id;

  const fuenteActual = NOTE_FONT_LABELS.get(note.font) || 'Sistema';

  card.innerHTML = `
    <header class="nota-cabecera">
      <button class="nota-destacar ${note.pinned ? 'activa' : ''}" type="button"
              title="${note.pinned ? 'Quitar de destacadas' : 'Destacar nota'}"
              aria-pressed="${note.pinned}">${iconSVG('star', 20)}</button>
      <span class="nota-fecha">${formatNoteTimestamp(note.updatedAt)}</span>
      <span class="nota-guardado-indicador"></span>
      <button class="icon-btn nota-borrar" type="button" title="Borrar nota" aria-label="Borrar nota">${iconSVG('trash', 17)}</button>
    </header>

    <div class="nota-toolbar">
      <div class="nt-grupo">
        <button class="nt-btn" type="button" data-cmd="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
        <button class="nt-btn" type="button" data-cmd="italic" title="Cursiva (Ctrl+I)"><i>I</i></button>
        <button class="nt-btn" type="button" data-cmd="underline" title="Subrayado (Ctrl+U)"><u>U</u></button>
        <button class="nt-btn" type="button" data-cmd="strikeThrough" title="Tachado"><s>S</s></button>
      </div>

      <div class="nt-grupo nt-grupo-lienzo">
        <button class="nt-btn nt-layout" type="button"
                title="Cambiar entre texto corrido y lienzo libre">${iconSVG('organizar', 16)}<span class="nt-layout-txt"></span></button>
        <button class="nt-btn nt-add-texto" type="button" title="Añadir un cuadro de texto suelto">${iconSVG('plus', 16)}Texto</button>
      </div>

      <div class="nt-pop" data-pop="resaltar">
        <button class="nt-btn nt-pop-btn" type="button" title="Resaltar (Ctrl+Shift+H)" aria-label="Resaltar">
          <span class="nt-swatch hl-${state.notas.resaltador}">A</span>
        </button>
        <div class="nt-panel">
          <div class="nt-panel-titulo">Resaltar la selección</div>
          <div class="nt-resaltadores">
            ${HIGHLIGHTS.map((h) => `<button class="nt-resaltador hl-${h.key}" type="button" data-hl="${h.key}" title="${h.nombre}">Aa</button>`).join('')}
          </div>
          <button class="nt-quitar" type="button" data-hl="">Quitar resaltado</button>
        </div>
      </div>

      <div class="nt-pop" data-pop="fuente">
        <button class="nt-btn nt-pop-btn nota-font-${note.font}" type="button" title="Tipografía">
          <span class="nt-fuente-actual">${escapeHTML(fuenteActual)}</span>
        </button>
        <div class="nt-panel nt-panel-fuentes">${panelFuentes(note.font)}</div>
      </div>

      <div class="nt-pop" data-pop="tamano">
        <button class="nt-btn nt-pop-btn" type="button" title="Tamaño del texto">
          <span class="nt-tamano-actual">${NOTE_SIZES.find((s) => s.key === note.size)?.label || 'Mediano'}</span>
        </button>
        <div class="nt-panel">
          <div class="nt-panel-titulo">Tamaño</div>
          <div class="nt-tamanos">
            ${NOTE_SIZES.map((s) => `<button class="nt-tamano ${s.key === note.size ? 'activa' : ''}" type="button" data-size="${s.key}">${s.label}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="nt-pop" data-pop="colores">
        <button class="nt-btn nt-pop-btn" type="button" title="Colores" aria-label="Colores">
          <span class="nt-color-muestra" style="background: ${note.bg || note.color}"></span>
        </button>
        <div class="nt-panel">
          <div class="nt-panel-titulo">Color del texto</div>
          <div class="nota-colores">
            ${NOTE_TEXT_COLORS.map((c) => `<button class="color-dot" type="button" data-text-color="${c.hex}" style="background:${c.hex}" title="${c.nombre}" aria-label="Texto ${c.nombre}"></button>`).join('')}
          </div>
          <div class="nt-panel-titulo">Color de la nota</div>
          <div class="nota-colores">
            ${NOTE_BG_COLORS.map((c) => `<button class="color-dot ${c.hex ? '' : 'sin-color'}" type="button" data-bg-color="${c.hex}" style="background:${c.hex || 'transparent'}" title="${c.nombre}" aria-label="Nota ${c.nombre}"></button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <input class="nota-titulo" type="text" maxlength="120" placeholder="Título de la nota"
           aria-label="Título de la nota" value="${escapeHTML(note.title || '')}">

    <div class="nota-editor" contenteditable="true" role="textbox" aria-multiline="true"
         data-placeholder="Escribe lo que quieras…"></div>

    <!-- Lienzo: mismas notas, pero con las piezas colocadas donde tú quieras.
         Se rellena desde pintarLienzo(). -->
    <div class="nota-lienzo" hidden>
      <p class="lienzo-pista">Pega una imagen o añade un texto. Cada pieza se mueve por el asa de arriba y se ensancha por el canto derecho.</p>
    </div>

    <footer class="nota-tags">
      <div class="nota-tags-lista"></div>
      <button class="nota-tag-add" type="button">${iconSVG('plus', 14)} etiqueta</button>
      <input class="nota-tag-input" list="tags-existentes" type="text" maxlength="24" placeholder="nombre y Enter" hidden>
    </footer>
  `;

  const editor = card.querySelector('.nota-editor');
  const indicador = card.querySelector('.nota-guardado-indicador');
  const toolbar = card.querySelector('.nota-toolbar');

  // ---- estilo de la nota (fuente, tamaño, colores) ----
  function aplicarEstilo() {
    editor.className = `nota-editor nota-font-${note.font} nota-size-${note.size}`;
    editor.style.color = note.color;
    card.classList.toggle('tinte', Boolean(note.bg));
    card.style.setProperty('--nota-color', note.bg || 'transparent');
    card.classList.toggle('destacada', Boolean(note.pinned));
    const botonFuente = card.querySelector('[data-pop="fuente"] .nt-pop-btn');
    botonFuente.className = `nt-btn nt-pop-btn nota-font-${note.font}`;
    card.querySelector('.nt-fuente-actual').textContent = NOTE_FONT_LABELS.get(note.font) || 'Sistema';
    card.querySelector('.nt-tamano-actual').textContent =
      NOTE_SIZES.find((s) => s.key === note.size)?.label || 'Mediano';
    card.querySelector('.nt-color-muestra').style.background = note.bg || note.color;
  }

  editor.innerHTML = note.content || '';
  aplicarEstilo();
  pintarTags();
  // aplicarLayout() se llama más abajo, después de declarar el lienzo: aquí
  // arriba todavía está en la zona muerta del `const` y reventaría.

  // ---- guardado ----
  const guardar = async (patch, aviso) => {
    try {
      Object.assign(note, await updateNote(note.id, patch));
      mostrarGuardado(indicador, aviso);
    } catch (err) {
      mostrarGuardado(indicador, 'No se pudo guardar');
    }
  };

  const guardarContenido = () => guardar({ content: limpiarHTML(editor.innerHTML) });
  const guardarContenidoDebounced = debounce(guardarContenido, 700);

  // ---- a qué texto le hablan los botones de formato ----
  // En texto corrido solo hay un sitio donde escribir. En lienzo hay tantos como
  // piezas de texto, así que la barra tiene que actuar sobre la última en la que
  // estuviste: sin esto, negrita y resaltado apuntaban siempre al editor de
  // flujo, que en lienzo está oculto, y no hacían nada.
  let superficieActiva = editor;
  const superficie = () => {
    if (note.layout !== 'lienzo') return editor;
    // Si la pieza que estaba enfocada ya no existe (la borraste), se cae a la
    // primera que haya; si no hay ninguna, no hay nada que formatear.
    if (superficieActiva !== editor && lienzo.contains(superficieActiva)) return superficieActiva;
    return lienzo.querySelector('.li-txt');
  };

  // Guarda por el camino que corresponda a la superficie que se tocó.
  const guardarSuperficie = (destino) => {
    if (destino === editor) return guardarContenidoDebounced();
    const pieza = destino.closest('.lienzo-item');
    const item = note.items.find((i) => i.id === pieza.dataset.id);
    if (item) item.content = limpiarHTML(destino.innerHTML);
    return guardarItemsDebounced();
  };

  // ---- título ----
  const titulo = card.querySelector('.nota-titulo');
  const guardarTitulo = () => guardar({ title: titulo.value.trim() });
  titulo.addEventListener('input', debounce(guardarTitulo, 700));
  titulo.addEventListener('blur', guardarTitulo);
  // Enter en el título baja al cuerpo, que es lo que se espera al escribir.
  titulo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    (note.layout === 'lienzo' ? lienzo : editor).focus();
  });

  // ---- lienzo: piezas colocadas libremente ----
  const lienzo = card.querySelector('.nota-lienzo');
  const guardarItems = () => guardar({ items: note.items });
  const guardarItemsDebounced = debounce(guardarItems, 700);

  function aplicarLayout() {
    const enLienzo = note.layout === 'lienzo';
    editor.hidden = enLienzo;
    lienzo.hidden = !enLienzo;
    card.classList.toggle('en-lienzo', enLienzo);
    card.querySelector('.nt-layout-txt').textContent = enLienzo ? 'Lienzo' : 'Corrido';
    card.querySelector('.nt-layout').classList.toggle('activa', enLienzo);
    card.querySelector('.nt-add-texto').hidden = !enLienzo;
    if (enLienzo) pintarLienzo();
  }

  function pintarLienzo() {
    // La pista se conserva; solo se reemplazan las piezas.
    lienzo.querySelectorAll('.lienzo-item').forEach((el) => el.remove());

    for (const item of note.items) {
      const el = document.createElement('div');
      el.className = `lienzo-item ${item.kind}`;
      el.dataset.id = item.id;
      el.style.left = `${item.x}%`;
      el.style.top = `${item.y}px`;
      el.style.width = `${item.w}%`;
      el.dataset.ancho = `${Math.round(item.w)}%`;
      el.innerHTML = `
        <div class="li-asa" title="Arrastra para mover">${iconSVG('drag', 15)}</div>
        <button class="icon-btn li-x" type="button" title="Quitar" aria-label="Quitar pieza">${iconSVG('close', 13)}</button>
        <button class="li-ancho" type="button" title="Arrastra para cambiar el ancho" aria-label="Cambiar el ancho"></button>
        ${item.kind === 'imagen'
          ? `<img class="li-img" src="${escapeHTML(item.src)}" alt="Imagen de la nota" draggable="false">`
          : `<div class="li-txt" contenteditable="true" data-placeholder="Escribe aquí…">${item.content || ''}</div>`}
      `;
      lienzo.appendChild(el);
      cablearItem(el, item);
      // Una imagen no ocupa su alto definitivo hasta que se descarga.
      const img = el.querySelector('.li-img');
      if (img) img.addEventListener('load', ajustarAlto);
    }

    lienzo.querySelector('.lienzo-pista').hidden = note.items.length > 0;
    ajustarAlto();
  }

  // El lienzo crece con la pieza más baja: si no, se recortarían. Se mide lo
  // que hay pintado en vez de estimarlo por el tipo de pieza: un párrafo de
  // ocho líneas y una captura alta no miden lo que diga una constante, y el
  // sobrante se perdía por el recorte del contenedor.
  function ajustarAlto() {
    let masAbajo = 0;
    for (const el of lienzo.querySelectorAll('.lienzo-item')) {
      masAbajo = Math.max(masAbajo, el.offsetTop + el.offsetHeight);
    }
    lienzo.style.minHeight = `${Math.max(220, masAbajo + 40)}px`;
  }

  function cablearItem(el, item) {
    // Cada vez que se guarda, el servidor devuelve las piezas normalizadas y
    // `note.items` pasa a apuntar a objetos nuevos. Si estos manejadores
    // mutaran el objeto que capturaron al pintarse, estarían escribiendo en una
    // copia huérfana y el cambio no se guardaría nunca. Se busca por id.
    const vivo = () => note.items.find((i) => i.id === item.id) || item;

    el.querySelector('.li-x').addEventListener('click', () => {
      note.items = note.items.filter((i) => i.id !== item.id);
      pintarLienzo();
      guardarItems();
    });

    const texto = el.querySelector('.li-txt');
    if (texto) {
      // La barra de formato apunta a la última pieza que tocaste.
      texto.addEventListener('focus', () => { superficieActiva = texto; });
      texto.addEventListener('keyup', actualizarEstadoBotones);
      texto.addEventListener('mouseup', actualizarEstadoBotones);
      // El mismo atajo de resaltado que en texto corrido: una pieza del lienzo
      // es texto de la nota y se comporta igual.
      texto.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'h') return;
        e.preventDefault();
        if (aplicarResaltado(texto, state.notas.resaltador)) guardarSuperficie(texto);
      });
      texto.addEventListener('input', () => {
        vivo().content = limpiarHTML(texto.innerHTML);
        // Escribir hace crecer la pieza hacia abajo; el lienzo la sigue.
        ajustarAlto();
        guardarItemsDebounced();
      });
      texto.addEventListener('blur', () => {
        vivo().content = limpiarHTML(texto.innerHTML);
        guardarItems();
      });
    }

    // Arrastre 1:1 desde el asa. Se respeta el punto por donde se agarró: si la
    // pieza saltara a centrarse bajo el cursor, se rompería la sensación de
    // estar moviendo una cosa y no de estar dando una orden.
    const asa = el.querySelector('.li-asa');
    asa.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      asa.setPointerCapture(e.pointerId);
      const caja = lienzo.getBoundingClientRect();
      const pieza = el.getBoundingClientRect();
      const agarreX = e.clientX - pieza.left;
      const agarreY = e.clientY - pieza.top;
      el.classList.add('moviendo');

      const mover = (ev) => {
        // El x va en % del ancho del lienzo para que la nota aguante cambios de
        // tamaño de ventana; el y en píxeles, porque crece hacia abajo.
        const actual = vivo();
        const x = ((ev.clientX - agarreX - caja.left) / caja.width) * 100;
        const y = ev.clientY - agarreY - caja.top;
        actual.x = Math.min(100 - actual.w, Math.max(0, x));
        actual.y = Math.max(0, y);
        el.style.left = `${actual.x}%`;
        el.style.top = `${actual.y}px`;
      };

      const soltar = () => {
        el.classList.remove('moviendo');
        asa.removeEventListener('pointermove', mover);
        asa.removeEventListener('pointerup', soltar);
        asa.removeEventListener('pointercancel', soltar);
        // Basta con recalcular el alto: la pieza ya está donde toca porque
        // `mover` la fue colocando. Repintar el lienzo entero aquí borraba y
        // recreaba todas las piezas, y con ellas el cursor de la que estuvieras
        // escribiendo.
        ajustarAlto();
        guardarItems();
      };

      asa.addEventListener('pointermove', mover);
      asa.addEventListener('pointerup', soltar);
      asa.addEventListener('pointercancel', soltar);
    });

    // Tirador de ancho. Mismo gesto que el asa pero en un solo eje: el ancho va
    // en % del lienzo, igual que la x, para que la pieza guarde su proporción
    // con la nota al cambiar el tamaño de la ventana.
    const tirador = el.querySelector('.li-ancho');
    tirador.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tirador.setPointerCapture(e.pointerId);
      const caja = lienzo.getBoundingClientRect();
      const anchoInicial = vivo().w;
      const desdeX = e.clientX;
      el.classList.add('midiendo');
      el.dataset.ancho = `${Math.round(anchoInicial)}%`;

      const medir = (ev) => {
        const actual = vivo();
        const delta = ((ev.clientX - desdeX) / caja.width) * 100;
        // Mínimo 5% —el mismo suelo que aplica el servidor— y tope en el borde
        // derecho del lienzo, para no dejar la pieza fuera de su propia nota.
        actual.w = Math.min(100 - actual.x, Math.max(5, anchoInicial + delta));
        el.style.width = `${actual.w}%`;
        el.dataset.ancho = `${Math.round(actual.w)}%`;
        ajustarAlto();   // al estrechar, el texto ocupa más líneas
      };

      const soltarTirador = () => {
        el.classList.remove('midiendo');
        tirador.removeEventListener('pointermove', medir);
        tirador.removeEventListener('pointerup', soltarTirador);
        tirador.removeEventListener('pointercancel', soltarTirador);
        ajustarAlto();
        guardarItems();
      };

      tirador.addEventListener('pointermove', medir);
      tirador.addEventListener('pointerup', soltarTirador);
      tirador.addEventListener('pointercancel', soltarTirador);
    });

    // El tirador es un botón y recibe foco, así que tiene que responder al
    // teclado: un control enfocable que solo obedece al ratón es peor que uno
    // que no se enfoca. Las flechas mueven de 5 en 5 puntos de ancho.
    tirador.addEventListener('keydown', (e) => {
      const paso = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
      if (paso === undefined) return;
      e.preventDefault();
      const actual = vivo();
      actual.w = Math.min(100 - actual.x, Math.max(5, actual.w + paso));
      el.style.width = `${actual.w}%`;
      el.dataset.ancho = `${Math.round(actual.w)}%`;
      ajustarAlto();
      guardarItemsDebounced();
    });
  }

  // Coloca la pieza nueva debajo de todo, para que no tape a las que ya están.
  function anadirItem(item) {
    const abajo = note.items.reduce((m, i) => Math.max(m, i.y), 0);
    note.items = [...note.items, { id: `it${Date.now().toString(36)}`, x: 8, y: note.items.length ? abajo + 90 : 16, ...item }];
    if (note.layout !== 'lienzo') note.layout = 'lienzo';
    aplicarLayout();
    return guardar({ layout: note.layout, items: note.items });
  }

  // Ya están declarados el lienzo y sus funciones: es el momento de pintar la
  // disposición que traía guardada la nota.
  aplicarLayout();

  card.querySelector('.nt-layout').addEventListener('click', async () => {
    note.layout = note.layout === 'lienzo' ? 'flujo' : 'lienzo';
    aplicarLayout();
    await guardar({ layout: note.layout }, note.layout === 'lienzo' ? 'Lienzo' : 'Texto corrido');
  });

  card.querySelector('.nt-add-texto').addEventListener('click', () => {
    anadirItem({ kind: 'texto', w: 45, content: '' });
  });

  // Pegar una imagen en cualquier parte de la nota la añade como pieza suelta.
  // Si la nota estaba en texto corrido, pasa a lienzo: es el único modo donde
  // una imagen puede tener posición propia.
  card.addEventListener('paste', async (e) => {
    const archivos = [...(e.clipboardData ? e.clipboardData.items : [])]
      .filter((i) => i.type && i.type.startsWith('image/'));
    if (archivos.length === 0) return;    // texto: lo maneja el editor

    e.preventDefault();
    e.stopPropagation();
    try {
      for (const it of archivos) {
        const src = await subirImagen(await leerComoDataURL(it.getAsFile()));
        await anadirItem({ kind: 'imagen', w: 45, src });
      }
      mostrarGuardado(indicador, archivos.length === 1 ? 'Imagen añadida' : `${archivos.length} imágenes`);
    } catch (err) {
      mostrarGuardado(indicador, err.message);
    }
  }, true);

  editor.addEventListener('input', guardarContenidoDebounced);
  editor.addEventListener('blur', guardarContenido);

  // Pegar trae HTML ajeno (fuentes, fondos, enlaces). Se pega solo el texto.
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, texto);
  });

  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (aplicarResaltado(editor, state.notas.resaltador)) guardarContenidoDebounced();
    }
  });

  // ---- barra de formato ----
  // mousedown por defecto quita la selección del editor; sin esto los botones
  // de negrita o resaltado no tendrían nada sobre lo que actuar. Los paneles
  // llevan el suyo porque mientras están abiertos cuelgan del <body>.
  toolbar.addEventListener('mousedown', (e) => e.preventDefault());
  card.querySelectorAll('.nt-panel').forEach((panel) => {
    panel.addEventListener('mousedown', (e) => e.preventDefault());
  });

  toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const destino = superficie();
      if (!destino) return mostrarGuardado(indicador, 'Añade un texto primero');
      ejecutarComando(destino, btn.dataset.cmd);
      actualizarEstadoBotones();
      guardarSuperficie(destino);
    });
  });

  toolbar.querySelectorAll('[data-hl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const destino = superficie();
      if (!destino) return mostrarGuardado(indicador, 'Añade un texto primero');
      const clave = btn.dataset.hl;
      let cambio;
      if (clave) {
        state.notas.resaltador = clave;
        card.querySelector('.nt-swatch').className = `nt-swatch hl-${clave}`;
        cambio = aplicarResaltado(destino, clave);
      } else {
        cambio = quitarResaltado(destino);
      }
      cerrarPopovers();
      if (cambio) guardarSuperficie(destino);
      else mostrarGuardado(indicador, 'Selecciona texto primero');
    });
  });

  toolbar.querySelectorAll('[data-font]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      note.font = btn.dataset.font;
      toolbar.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('activa', b === btn));
      aplicarEstilo();
      cerrarPopovers();
      await guardar({ font: note.font });
    });
  });

  toolbar.querySelectorAll('[data-size]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      note.size = btn.dataset.size;
      toolbar.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('activa', b === btn));
      aplicarEstilo();
      cerrarPopovers();
      await guardar({ size: note.size });
    });
  });

  toolbar.querySelectorAll('[data-text-color]').forEach((dot) => {
    if (dot.dataset.textColor.toLowerCase() === (note.color || '').toLowerCase()) dot.classList.add('selected');
    dot.addEventListener('click', async () => {
      toolbar.querySelectorAll('[data-text-color]').forEach((d) => d.classList.toggle('selected', d === dot));
      note.color = dot.dataset.textColor;
      aplicarEstilo();
      await guardar({ color: note.color });
    });
  });

  toolbar.querySelectorAll('[data-bg-color]').forEach((dot) => {
    if (dot.dataset.bgColor.toLowerCase() === (note.bg || '').toLowerCase()) dot.classList.add('selected');
    dot.addEventListener('click', async () => {
      toolbar.querySelectorAll('[data-bg-color]').forEach((d) => d.classList.toggle('selected', d === dot));
      note.bg = dot.dataset.bgColor;
      aplicarEstilo();
      await guardar({ bg: note.bg });
    });
  });

  card.querySelectorAll('.nt-pop-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = btn.closest('.nt-pop');
      const abierto = pop.classList.contains('abierto');
      cerrarPopovers();
      if (!abierto) abrirPopover(pop, btn);
    });
  });

  // Marca B/I/U según dónde esté el cursor.
  function actualizarEstadoBotones() {
    toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
      let activo = false;
      try { activo = document.queryCommandState(btn.dataset.cmd); } catch (err) { activo = false; }
      btn.classList.toggle('activa', activo);
    });
  }
  editor.addEventListener('keyup', actualizarEstadoBotones);
  editor.addEventListener('mouseup', actualizarEstadoBotones);
  editor.addEventListener('focus', () => {
    superficieActiva = editor;
    actualizarEstadoBotones();
  });

  // ---- destacar ----
  card.querySelector('.nota-destacar').addEventListener('click', async () => {
    note.pinned = !note.pinned;
    aplicarEstilo();
    await guardar({ pinned: note.pinned });
    toast(note.pinned ? 'Nota destacada' : 'Nota sin destacar');
    renderNotas();
  });

  // ---- etiquetas ----
  function pintarTags() {
    const lista = card.querySelector('.nota-tags-lista');
    lista.innerHTML = note.tags.map((t) => chipEtiqueta(t, { borrable: true })).join('');
    lista.querySelectorAll('.nota-tag-x').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tag = btn.closest('.nota-tag').dataset.tag;
        note.tags = note.tags.filter((t) => t !== tag);
        await guardar({ tags: note.tags });
        renderNotas();
      });
    });
  }

  const addBtn = card.querySelector('.nota-tag-add');
  const tagInput = card.querySelector('.nota-tag-input');

  addBtn.addEventListener('click', () => {
    addBtn.hidden = true;
    tagInput.hidden = false;
    tagInput.value = '';
    tagInput.focus();
  });

  const cerrarTagInput = () => {
    tagInput.hidden = true;
    addBtn.hidden = false;
  };

  tagInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { cerrarTagInput(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const tag = tagInput.value.trim().replace(/^#/, '');
    if (!tag) { cerrarTagInput(); return; }
    if (note.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      cerrarTagInput();
      toast('Esa etiqueta ya está');
      return;
    }
    note.tags = [...note.tags, tag];
    cerrarTagInput();
    await guardar({ tags: note.tags });
    renderNotas();
  });
  tagInput.addEventListener('blur', cerrarTagInput);

  // ---- borrar (confirmación en línea, no bloquea la página) ----
  card.querySelector('.nota-borrar').addEventListener('click', () => {
    if (card.querySelector('.nota-confirmar')) return;
    const barra = document.createElement('div');
    barra.className = 'nota-confirmar';
    barra.innerHTML = `
      <span>¿Borrar esta nota?</span>
      <button class="btn danger btn-si" type="button">Sí, borrar</button>
      <button class="btn ghost btn-no" type="button">Cancelar</button>`;
    card.appendChild(barra);
    barra.querySelector('.btn-si').addEventListener('click', async () => {
      await deleteNote(note.id);
      card.classList.add('saliendo');
      setTimeout(() => { renderNotas(); toast('Nota borrada'); }, reducedMotion() ? 0 : 180);
    });
    barra.querySelector('.btn-no').addEventListener('click', () => barra.remove());
  });

  return card;
}

// Chrome pinta los descendientes posicionados de un contenedor multicolumna
// dentro del fragmento de su columna, así que un panel dejado en la tarjeta
// queda por debajo del texto de la propia nota. Mientras está abierto se cuelga
// del <body> y se coloca a mano; al cerrarlo vuelve a su sitio.
function abrirPopover(pop, btn) {
  const panel = pop._panel || pop.querySelector('.nt-panel');
  pop._panel = panel;
  pop.classList.add('abierto');
  panel.classList.add('abierto');
  document.body.appendChild(panel);

  const r = btn.getBoundingClientRect();
  const margen = 8;

  panel.style.left = '0px';
  panel.style.top = '0px';
  const ancho = panel.offsetWidth;
  const alto = panel.offsetHeight;

  const left = Math.max(margen, Math.min(r.left, window.innerWidth - ancho - margen));
  const cabeAbajo = r.bottom + 6 + alto <= window.innerHeight - margen;
  const top = cabeAbajo
    ? r.bottom + 6
    : Math.max(margen, r.top - 6 - alto);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  // El panel crece desde el botón que lo abrió, no desde su propio centro: así
  // la relación entre control y contenido se ve, en vez de tener que deducirla.
  const origenX = Math.max(0, Math.min(r.left + r.width / 2 - left, ancho));
  panel.style.transformOrigin = `${origenX}px ${cabeAbajo ? '0px' : `${alto}px`}`;
}

function cerrarPopovers() {
  document.querySelectorAll('.nt-pop.abierto').forEach((pop) => {
    pop.classList.remove('abierto');
    if (pop._panel) {
      pop._panel.classList.remove('abierto');
      pop.appendChild(pop._panel);   // devuelve el panel a su tarjeta
    }
  });
  // Si la lista se repintó con un panel fuera, ese panel se quedaría huérfano.
  document.querySelectorAll('body > .nt-panel').forEach((p) => p.remove());
}

// ------------------------------------------------------------ notas: lista ---

function todasLasEtiquetas() {
  const cuenta = new Map();
  for (const nota of state.data.notes) {
    for (const tag of nota.tags || []) {
      cuenta.set(tag, (cuenta.get(tag) || 0) + 1);
    }
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function notasFiltradas() {
  const { buscar, tag, orden } = state.notas;
  const texto = buscar.trim().toLowerCase();

  let notas = [...state.data.notes];
  if (tag) notas = notas.filter((n) => (n.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()));
  if (texto) {
    notas = notas.filter((n) => {
      // Se busca también en el título y en las piezas del lienzo: una nota que
      // solo tiene texto suelto colocado a mano no aparecería de otra forma.
      const cuerpo = [
        n.title || '',
        htmlAtexto(n.content),
        ...(n.items || []).filter((i) => i.kind === 'texto').map((i) => htmlAtexto(i.content || '')),
      ].join(' ').toLowerCase();
      const etiquetas = (n.tags || []).join(' ').toLowerCase();
      return cuerpo.includes(texto) || etiquetas.includes(texto);
    });
  }

  // Con título, ordena por título; sin él, por el principio del cuerpo.
  const claveAlfabetica = (n) => (n.title || htmlAtexto(n.content) || '').trim();
  const porFecha = (campo) => (a, b) => new Date(b[campo]) - new Date(a[campo]);
  if (orden === 'alfabetico') {
    notas.sort((a, b) => claveAlfabetica(a).localeCompare(claveAlfabetica(b), 'es'));
  } else {
    notas.sort(porFecha(orden === 'creadas' ? 'createdAt' : 'updatedAt'));
  }

  // Las destacadas siempre arriba, conservando el orden elegido dentro de cada grupo.
  return [...notas.filter((n) => n.pinned), ...notas.filter((n) => !n.pinned)];
}

function renderFiltroTags() {
  const cont = document.getElementById('notas-filtro-tags');
  const etiquetas = todasLasEtiquetas();
  const datalist = document.getElementById('tags-existentes');
  datalist.innerHTML = etiquetas.map(([t]) => `<option value="${escapeHTML(t)}"></option>`).join('');

  if (etiquetas.length === 0) {
    cont.innerHTML = '';
    cont.hidden = true;
    return;
  }
  cont.hidden = false;
  cont.innerHTML = `
    <button class="tag-filtro ${state.notas.tag ? '' : 'activa'}" type="button" data-tag="">Todas</button>
    ${etiquetas.map(([t, n]) => `
      <button class="tag-filtro ${state.notas.tag === t ? 'activa' : ''}" type="button"
              data-tag="${escapeHTML(t)}" style="--tag: ${colorEtiqueta(t)}">
        #${escapeHTML(t)}<span class="tag-cuenta">${n}</span>
      </button>`).join('')}`;

  cont.querySelectorAll('.tag-filtro').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      state.notas.tag = (!tag || state.notas.tag === tag) ? null : tag;
      renderNotas();
    });
  });
}

function renderNotas() {
  const cont = document.getElementById('notas-container');
  const resumen = document.getElementById('notas-resumen');
  cerrarPopovers();
  cont.innerHTML = '';

  renderFiltroTags();

  const total = state.data.notes.length;
  const notas = notasFiltradas();
  const destacadas = state.data.notes.filter((n) => n.pinned).length;
  const filtrando = Boolean(state.notas.tag) || state.notas.buscar.trim() !== '';

  if (total === 0) {
    resumen.textContent = '';
    cont.innerHTML = '<p class="empty-state">Todavía no tienes notas. Usa «Nueva nota» para escribir la primera.</p>';
    return;
  }

  resumen.textContent = filtrando
    ? `${notas.length} de ${total} ${total === 1 ? 'nota' : 'notas'}`
    : `${total} ${total === 1 ? 'nota' : 'notas'}${destacadas ? ` · ${destacadas} destacada${destacadas === 1 ? '' : 's'}` : ''}`;

  if (notas.length === 0) {
    cont.innerHTML = '<p class="empty-state">Ninguna nota coincide con la búsqueda.</p>';
    return;
  }

  notas.forEach((nota, i) => {
    const card = renderNoteCard(nota);
    if (!state.notasPintadas) card.style.setProperty('--i', i);
    cont.appendChild(card);
  });

  cont.classList.toggle('entrando', !state.notasPintadas);
  state.notasPintadas = true;
}

// ------------------------------------------------------- vista Work Mode ----
// Las tareas de trabajo no son hábitos: no se repiten, tienen final y lo que
// importa es el proceso. Cada tarjeta sostiene las tres cosas que pidió el
// diseño — seguir (estado, prioridad, fecha), guiar (pasos) y documentar
// (bitácora) — y se despliega para no convertir la lista en un muro.

const WORK_ESTADOS = [
  { id: 'pendiente', nombre: 'Pendiente' },
  { id: 'en-curso', nombre: 'En curso' },
  { id: 'bloqueada', nombre: 'Bloqueada' },
  { id: 'hecha', nombre: 'Hecha' },
];

const WORK_PRIORIDADES = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'media', nombre: 'Media' },
  { id: 'baja', nombre: 'Baja' },
];

const nombreEstado = (id) => (WORK_ESTADOS.find((e) => e.id === id) || WORK_ESTADOS[0]).nombre;

async function apiWork(url, metodo, cuerpo) {
  const res = await api(url, cuerpo === undefined ? { method: metodo } : jsonBody(metodo, cuerpo));
  // Casi todas las rutas devuelven la tarea entera ya normalizada: se sustituye
  // en el estado local en vez de recargarlo todo.
  if (res && res.task) {
    const i = tareas().findIndex((t) => t.id === res.task.id);
    if (i !== -1) state.data.work[i] = res.task;
  }
  return res;
}

// Días que faltan (o que han pasado) hasta la fecha límite.
function diasHasta(iso) {
  if (!iso) return null;
  const hoy = parseISO(todayISO());
  return Math.round((parseISO(iso) - hoy) / 86400000);
}

function textoVencimiento(iso) {
  const d = diasHasta(iso);
  if (d === null) return null;
  if (d === 0) return { texto: 'Vence hoy', clase: 'urge' };
  if (d === 1) return { texto: 'Vence mañana', clase: 'pronto' };
  if (d < 0) return { texto: `${Math.abs(d)} ${Math.abs(d) === 1 ? 'día' : 'días'} de retraso`, clase: 'tarde' };
  if (d <= 3) return { texto: `Faltan ${d} días`, clase: 'pronto' };
  return { texto: parseISO(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }), clase: '' };
}

function progresoTarea(t) {
  const total = t.steps.length;
  const hechos = t.steps.filter((s) => s.done).length;
  return { total, hechos, pct: total === 0 ? 0 : Math.round((hechos / total) * 100) };
}

// El filtro «Abiertas» es el que se ve al entrar: lo que queda por hacer. Las
// hechas se consultan aparte, no estorban el día a día.
function tareasFiltradas() {
  const { filtro, buscar } = state.work;
  const q = buscar.trim().toLowerCase();

  let lista = tareas().filter((t) => {
    if (filtro === 'todas') return true;
    if (filtro === 'abiertas') return t.status !== 'hecha';
    return t.status === filtro;
  });

  if (q) {
    // Busca también dentro de los pasos y de la bitácora: muchas veces uno
    // recuerda una frase que escribió, no el título de la tarea.
    lista = lista.filter((t) => [
      t.title, t.detail, t.area,
      ...t.steps.map((s) => s.text),
      ...t.log.map((e) => e.text),
    ].join(' ').toLowerCase().includes(q));
  }

  const pesoEstado = { 'en-curso': 0, 'bloqueada': 1, 'pendiente': 2, 'hecha': 3 };
  const pesoPrioridad = { alta: 0, media: 1, baja: 2 };
  return lista.sort((a, b) => {
    if (pesoEstado[a.status] !== pesoEstado[b.status]) return pesoEstado[a.status] - pesoEstado[b.status];
    // Con fecha límite manda la fecha; sin ella, la prioridad.
    const da = diasHasta(a.due);
    const db = diasHasta(b.due);
    if (da !== null && db !== null && da !== db) return da - db;
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    if (pesoPrioridad[a.priority] !== pesoPrioridad[b.priority]) return pesoPrioridad[a.priority] - pesoPrioridad[b.priority];
    return a.order - b.order;
  });
}

function renderWork() {
  const todas = tareas();
  const porEstado = (id) => todas.filter((t) => t.status === id).length;
  const enCurso = porEstado('en-curso');
  const abiertas = todas.filter((t) => t.status !== 'hecha').length;

  // El punto rojo de la pestaña: solo aparece cuando hay algo abierto, y late
  // cuando hay algo en curso. Si no hay nada, no distrae.
  const badge = document.getElementById('work-badge');
  badge.hidden = abiertas === 0;
  badge.textContent = abiertas;
  badge.classList.toggle('latiendo', enCurso > 0);

  const titulo = document.getElementById('work-title');
  const sub = document.getElementById('work-sub');
  if (todas.length === 0) {
    titulo.textContent = 'Sin tareas todavía';
    sub.textContent = 'Aquí va solo lo del trabajo: qué hay que hacer, por dónde vas y qué pasó en cada paso.';
  } else if (enCurso > 0) {
    titulo.textContent = `${enCurso} ${enCurso === 1 ? 'tarea en curso' : 'tareas en curso'}`;
    sub.textContent = 'Sigue por donde lo dejaste: abre la tarea y marca el siguiente paso.';
  } else if (abiertas > 0) {
    titulo.textContent = `${abiertas} ${abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}`;
    sub.textContent = 'Nada en curso ahora mismo. Marca un paso de cualquier tarea para arrancarla.';
  } else {
    titulo.textContent = 'Todo hecho';
    sub.textContent = 'No queda nada abierto. La bitácora de cada tarea guarda cómo se hizo.';
  }

  const retrasadas = todas.filter((t) => t.status !== 'hecha' && diasHasta(t.due) !== null && diasHasta(t.due) < 0).length;
  const pasosHechos = todas.reduce((n, t) => n + t.steps.filter((s) => s.done).length, 0);
  const pasosTotal = todas.reduce((n, t) => n + t.steps.length, 0);

  const fichas = [
    { clase: 'curso', icon: 'bolt', label: 'En curso', valor: enCurso, sub: 'ahora mismo' },
    { clase: 'espera', icon: 'rutina', label: 'Pendientes', valor: porEstado('pendiente'), sub: 'sin empezar' },
    { clase: 'freno', icon: 'close', label: 'Bloqueadas', valor: porEstado('bloqueada'), sub: retrasadas > 0 ? `${retrasadas} con retraso` : 'esperando algo' },
    { clase: 'fin', icon: 'sealcheck', label: 'Hechas', valor: porEstado('hecha'), sub: pasosTotal > 0 ? `${pasosHechos}/${pasosTotal} pasos` : 'sin pasos aún' },
  ];

  const cc = calcularChambaCoins();
  const desglose = [
    `${moneda(cc.porPasos)} de pasos`,
    cc.porTareas > 0 ? `${moneda(cc.porTareas)} de ${cc.cerradas} ${cc.cerradas === 1 ? 'tarea cerrada' : 'tareas cerradas'}` : '',
    cc.aTiempo > 0 ? `${moneda(cc.aTiempo)} por llegar a tiempo` : '',
  ].filter(Boolean).join(' · ');

  document.getElementById('work-stats').innerHTML = fichas.map((f) => `
    <div class="work-tile ${f.clase}">
      <div class="work-tile-head">${iconSVG(f.icon, 17)}${f.label}</div>
      <div class="work-tile-value num">${f.valor}</div>
      <div class="work-tile-sub">${escapeHTML(f.sub)}</div>
    </div>
  `).join('') + `
    <div class="work-tile cartera">
      <div class="work-tile-head">${iconSVG('reloj', 17)}Chamba Coins</div>
      <div class="work-tile-value num">${moneda(cc.total)}</div>
      <div class="work-tile-sub">${escapeHTML(desglose)}</div>
    </div>`;

  renderWorkLista();
  // La cartera se repinta aquí y no en renderTodo() porque los saldos también
  // cambian por cosas del trabajo (marcar un paso, cerrar una tarea), y esas no
  // pasan por renderTodo. Todo lo que mueve dinero termina llamando a
  // renderWork, así que este es el único sitio que los cubre todos.
  renderCartera();
}

function renderWorkLista() {
  const cont = document.getElementById('work-lista');
  const lista = tareasFiltradas();

  // Si el servidor viejo sigue corriendo, `work` ni siquiera existe en los
  // datos. Sin este aviso se ve el mismo «no hay tareas» que cuando la lista
  // está vacía de verdad, y no hay forma de saber que falta reiniciar.
  if (state.data.work === undefined) {
    cont.innerHTML = `<p class="empty-state">
      El servidor que está corriendo todavía no conoce Work Mode.<br>
      Ciérralo y vuelve a arrancarlo con <code>node server.js</code>, y recarga esta página.
    </p>`;
    return;
  }

  if (lista.length === 0) {
    const hayAlguna = tareas().length > 0;
    cont.innerHTML = `<p class="empty-state">${hayAlguna
      ? 'Ninguna tarea encaja con este filtro o esta búsqueda.'
      : 'Todavía no hay tareas de trabajo. Crea la primera con <b>Nueva tarea</b>.'}</p>`;
    return;
  }

  cont.innerHTML = lista.map(tarjetaTarea).join('');
  cablearTarjetas(cont);
}

function tarjetaTarea(t) {
  const { total, hechos, pct } = progresoTarea(t);
  const abierta = state.work.abierta === t.id;
  const vence = textoVencimiento(t.due);
  const notas = t.log.filter((e) => e.kind === 'nota').length;

  const meta = [
    t.area ? `<span class="wt-chip area">${iconSVG('organizar', 15)}${escapeHTML(t.area)}</span>` : '',
    `<span class="wt-chip prio-${t.priority}">${iconSVG('trend', 15)}${(WORK_PRIORIDADES.find((p) => p.id === t.priority) || {}).nombre}</span>`,
    vence ? `<span class="wt-chip vence ${vence.clase}">${iconSVG('calendar', 15)}${escapeHTML(vence.texto)}</span>` : '',
    total > 0 ? `<span class="wt-chip">${iconSVG('check', 15)}<span class="num">${hechos}/${total}</span> pasos</span>` : '',
    notas > 0 ? `<span class="wt-chip">${iconSVG('note', 15)}<span class="num">${notas}</span></span>` : '',
    // Lo que paga cerrarla (o lo que ya pagó): la recompensa se ve antes de
    // hacer el trabajo, que es cuando sirve de algo.
    `<span class="wt-chip moneda" title="${escapeHTML(explicarPremio(t))}">${iconSVG('reloj', 15)}<span class="num">${moneda(premioTotalTarea(t))}</span> CC</span>`,
  ].filter(Boolean).join('');

  return `
    <article class="work-task estado-${t.status}${abierta ? ' abierta' : ''}" data-id="${t.id}">
      <div class="wt-head">
        <button class="wt-toggle" type="button" aria-expanded="${abierta}">
          <span class="wt-estado-pill">${nombreEstado(t.status)}</span>
          <span class="wt-titulo">${escapeHTML(t.title)}</span>
          <span class="wt-meta">${meta}</span>
        </button>
        <div class="wt-acciones">
          <select class="wt-estado-sel" aria-label="Estado de ${escapeHTML(t.title)}">
            ${WORK_ESTADOS.map((e) => `<option value="${e.id}"${e.id === t.status ? ' selected' : ''}>${e.nombre}</option>`).join('')}
          </select>
          <button class="icon-btn wt-editar" type="button" title="Editar tarea" aria-label="Editar">${iconSVG('edit', 18)}</button>
          <button class="icon-btn wt-borrar" type="button" title="Borrar tarea" aria-label="Borrar">${iconSVG('trash', 18)}</button>
        </div>
      </div>

      ${total > 0 ? `
        <div class="wt-progreso" title="${hechos} de ${total} pasos">
          <div class="wt-track"><div class="wt-fill" style="width:${pct}%"></div></div>
          <span class="wt-pct num">${pct}%</span>
        </div>` : ''}

      <div class="wt-cuerpo"${abierta ? '' : ' hidden'}>
        ${t.detail ? `<p class="wt-detalle">${escapeHTML(t.detail).replace(/\n/g, '<br>')}</p>` : ''}

        <div class="wt-bloque">
          <h4 class="wt-bloque-titulo">${iconSVG('check', 16)}Proceso
            <span class="wt-bloque-nota">${total === 0 ? 'sin pasos' : `${hechos} de ${total}`}</span>
          </h4>
          <ol class="wt-pasos">
            ${t.steps.map((s) => `
              <li class="wt-paso${s.done ? ' done' : ''}" data-step="${s.id}">
                <button class="wt-paso-check" type="button" role="checkbox" aria-checked="${s.done}"
                        aria-label="${s.done ? 'Desmarcar' : 'Marcar'} ${escapeHTML(s.text)}">${iconSVG('check', 14)}</button>
                <span class="wt-paso-txt">${escapeHTML(s.text)}</span>
                ${s.doneAt ? `<span class="wt-paso-fecha">${formatNoteTimestamp(s.doneAt)}</span>` : ''}
                <button class="icon-btn wt-paso-x" type="button" title="Quitar paso" aria-label="Quitar paso">${iconSVG('close', 14)}</button>
              </li>`).join('')}
          </ol>
          <form class="wt-add wt-add-paso">
            <input type="text" maxlength="200" placeholder="Añadir un paso del proceso…" aria-label="Nuevo paso">
            <button class="btn ghost" type="submit">${iconSVG('plus', 17)}Añadir</button>
          </form>
        </div>

        <div class="wt-bloque">
          <h4 class="wt-bloque-titulo">${iconSVG('note', 16)}Bitácora
            <span class="wt-bloque-nota">${t.log.length} ${t.log.length === 1 ? 'entrada' : 'entradas'}</span>
          </h4>
          <ol class="wt-log">
            ${[...t.log].reverse().map((e) => `
              <li class="wt-log-item ${e.kind}" data-entry="${e.id}">
                <span class="wt-log-marca"></span>
                <div class="wt-log-cuerpo">
                  <p class="wt-log-txt">${escapeHTML(e.text).replace(/\n/g, '<br>')}</p>
                  <span class="wt-log-fecha">${formatNoteTimestamp(e.at)}</span>
                </div>
                ${e.kind === 'nota' ? `<button class="icon-btn wt-log-x" type="button" title="Borrar entrada" aria-label="Borrar entrada">${iconSVG('close', 14)}</button>` : ''}
              </li>`).join('')}
          </ol>
          <form class="wt-add wt-add-log">
            <input type="text" maxlength="2000" placeholder="Documentar qué pasó, qué decidiste, qué falta…" aria-label="Nueva entrada de bitácora">
            <button class="btn ghost" type="submit">${iconSVG('plus', 17)}Anotar</button>
          </form>
        </div>

        <p class="wt-tiempos">
          Creada ${formatNoteTimestamp(t.createdAt)}${t.startedAt ? ` · empezada ${formatNoteTimestamp(t.startedAt)}` : ''}${t.doneAt ? ` · terminada ${formatNoteTimestamp(t.doneAt)}` : ''}
        </p>
      </div>
    </article>
  `;
}

// Un solo sitio para atar los eventos de todas las tarjetas. Tras cualquier
// cambio se vuelve a pintar la lista, así que se re-atan enteros.
function cablearTarjetas(cont) {
  cont.querySelectorAll('.work-task').forEach((card) => {
    const id = card.dataset.id;

    card.querySelector('.wt-toggle').addEventListener('click', () => {
      state.work.abierta = state.work.abierta === id ? null : id;
      renderWorkLista();
    });

    card.querySelector('.wt-estado-sel').addEventListener('change', async (e) => {
      const antes = tareaById(id);
      const cerrando = antes && antes.status !== 'hecha' && e.target.value === 'hecha';
      await guardarTarea(id, () => apiWork(`/api/work/${id}`, 'PATCH', { status: e.target.value }));

      const t = tareaById(id);
      if (cerrando && t) {
        const p = premioTarea(t);
        const ganado = p.base + p.porTamano + p.aTiempo;
        const r = card.getBoundingClientRect();
        sonidoHito();
        confeti(r.left + r.width / 2, r.top + 40, { color: '#ef4444' });
        popup(r.left + r.width / 2, r.top + 20, `+${moneda(ganado)} CC`, true);
        if (p.aTiempo > 0) toast(`Cerrada a tiempo: +${moneda(p.aTiempo)} CC de extra`, 'ok');
      }
    });

    card.querySelector('.wt-editar').addEventListener('click', () => abrirEditorTarea(id));

    card.querySelector('.wt-borrar').addEventListener('click', () => confirmarBorradoTarea(card, id));

    card.querySelectorAll('.wt-paso').forEach((li) => {
      const stepId = li.dataset.step;

      li.querySelector('.wt-paso-check').addEventListener('click', async (e) => {
        const tarea = tareaById(id);
        if (!tarea) return;
        const paso = tarea.steps.find((s) => s.id === stepId);
        if (!paso) return;
        const marcando = !paso.done;
        // Respuesta inmediata: la marca no espera al servidor.
        li.classList.toggle('done', marcando);
        if (marcando) {
          sonidoHabito(0);
          const r = li.getBoundingClientRect();
          popup(e.clientX || r.left + 40, r.top, `+${CC_POR_PASO} CC`);
        } else {
          sonidoDeshacer();
        }
        await guardarTarea(id, () => apiWork(`/api/work/${id}/steps/${stepId}`, 'PATCH', { done: marcando }));

        // Cerrar la tarea es el pago grande: merece su propio aviso.
        const cerrada = tareaById(id);
        if (marcando && cerrada && cerrada.status !== 'hecha' && cerrada.steps.length > 0
            && cerrada.steps.every((s) => s.done)) {
          toast(`Todos los pasos hechos. Márcala como hecha para cobrar ${moneda(premioTarea(cerrada).base + premioTarea(cerrada).porTamano)} CC.`, 'ok');
        }
      });

      li.querySelector('.wt-paso-x').addEventListener('click', async () => {
        await guardarTarea(id, () => apiWork(`/api/work/${id}/steps/${stepId}`, 'DELETE'));
      });
    });

    card.querySelectorAll('.wt-log-x').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const entryId = btn.closest('.wt-log-item').dataset.entry;
        await guardarTarea(id, () => apiWork(`/api/work/${id}/log/${entryId}`, 'DELETE'));
      });
    });

    // Los dos formularios funcionan igual: texto, se envía, se limpia y el foco
    // se queda donde estaba para poder encadenar varios seguidos.
    const enviar = (form, url, campo) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const texto = input.value.trim();
        if (!texto) return;
        input.value = '';
        await guardarTarea(id, () => apiWork(url, 'POST', { text: texto }), campo);
      });
    };
    enviar(card.querySelector('.wt-add-paso'), `/api/work/${id}/steps`, '.wt-add-paso input');
    enviar(card.querySelector('.wt-add-log'), `/api/work/${id}/log`, '.wt-add-log input');
  });
}

// Confirmación en línea, igual que al borrar un hábito: nada de diálogos del
// navegador. Dice en voz alta cuánto se pierde, porque una tarea con bitácora
// larga es justo lo que no quieres borrar por error.
function confirmarBorradoTarea(card, id) {
  const t = tareaById(id);
  if (!t) return;
  const acciones = card.querySelector('.wt-acciones');
  if (acciones.dataset.confirmando === 'si') return;
  acciones.dataset.confirmando = 'si';

  const notas = t.log.filter((e) => e.kind === 'nota').length;
  const perdidas = [
    t.steps.length ? `${t.steps.length} ${t.steps.length === 1 ? 'paso' : 'pasos'}` : '',
    notas ? `${notas} ${notas === 1 ? 'nota' : 'notas'}` : '',
  ].filter(Boolean).join(' y ');

  acciones.innerHTML = `
    <span class="confirm-inline">¿Borrar${perdidas ? ` con sus ${perdidas}` : ''}?
      <button class="btn danger btn-si" type="button">Sí</button>
      <button class="btn ghost btn-no" type="button">No</button>
    </span>`;

  acciones.querySelector('.btn-si').addEventListener('click', async () => {
    try {
      await api(`/api/work/${id}`, { method: 'DELETE' });
    } catch (err) {
      toast(`No se pudo borrar: ${err.message}`, 'error');
      renderWork();
      return;
    }
    state.data.work = tareas().filter((t2) => t2.id !== id);
    if (state.work.abierta === id) state.work.abierta = null;
    toast('Tarea borrada');
    renderWork();
  });

  acciones.querySelector('.btn-no').addEventListener('click', () => renderWorkLista());
}

// Envoltura común: ejecuta la llamada, repinta y, si se pide, devuelve el foco
// al campo que se estaba usando (repintar lo habría perdido).
async function guardarTarea(id, accion, refocar = null) {
  try {
    await accion();
  } catch (err) {
    toast(`No se pudo guardar: ${err.message}`, 'error');
    renderWork();
    return;
  }
  renderWork();
  if (refocar) {
    // Se busca la tarjeta comparando el dataset en vez de construir un selector
    // con el id dentro: así no hace falta escaparlo y no depende de CSS.escape.
    const tarjeta = [...document.querySelectorAll('.work-task')].find((c) => c.dataset.id === id);
    const campo = tarjeta && tarjeta.querySelector(refocar);
    if (campo) campo.focus();
  }
}

// ---- editor de tarea (crear y editar) ----

function abrirEditorTarea(id) {
  const editor = document.getElementById('work-editor');
  const t = id === 'nueva' ? null : tareaById(id);
  if (id !== 'nueva' && !t) return;

  state.work.editando = id;
  editor.hidden = false;

  editor.innerHTML = `
    <div class="editor-title">${t ? 'Editar tarea' : 'Nueva tarea de trabajo'}</div>

    <div class="field">
      <label class="field-label" for="wt-nombre">Qué hay que hacer</label>
      <input id="wt-nombre" type="text" maxlength="120" placeholder="Por ejemplo: Entregar el paquete de anuncios de X"
             value="${t ? escapeHTML(t.title) : ''}">
    </div>

    <div class="field">
      <label class="field-label" for="wt-detalle">Contexto y objetivo</label>
      <textarea id="wt-detalle" rows="3" maxlength="4000"
                placeholder="Qué se considera terminado, qué hace falta, dónde están las cosas…">${t ? escapeHTML(t.detail) : ''}</textarea>
    </div>

    <div class="work-editor-fila">
      <div class="field">
        <label class="field-label" for="wt-area">Área o cliente</label>
        <input id="wt-area" type="text" maxlength="40" placeholder="Cliente, proyecto…" value="${t ? escapeHTML(t.area) : ''}">
      </div>
      <div class="field">
        <label class="field-label" for="wt-prioridad">Prioridad</label>
        <select id="wt-prioridad">
          ${WORK_PRIORIDADES.map((p) => `<option value="${p.id}"${t && t.priority === p.id ? ' selected' : ''}${!t && p.id === 'media' ? ' selected' : ''}>${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="wt-fecha">Fecha límite</label>
        <input id="wt-fecha" type="date" value="${t ? t.due : ''}">
      </div>
    </div>

    ${t ? '' : `
      <div class="field">
        <label class="field-label" for="wt-pasos">Primeros pasos del proceso</label>
        <textarea id="wt-pasos" rows="4" placeholder="Un paso por línea. Se pueden añadir más después."></textarea>
        <p class="field-hint">Cada línea es un paso. Son la guía que vas marcando al avanzar.</p>
      </div>`}

    <div class="editor-actions">
      <button class="btn work-primary" id="wt-guardar" type="button">${t ? 'Guardar cambios' : 'Crear tarea'}</button>
      <button class="btn ghost" id="wt-cancelar" type="button">Cancelar</button>
    </div>
  `;

  const nombre = document.getElementById('wt-nombre');
  nombre.focus();

  document.getElementById('wt-cancelar').addEventListener('click', cerrarEditorTarea);

  document.getElementById('wt-guardar').addEventListener('click', async () => {
    const titulo = nombre.value.trim();
    if (!titulo) {
      toast('Ponle un título a la tarea', 'error');
      nombre.focus();
      return;
    }
    const cuerpo = {
      title: titulo,
      detail: document.getElementById('wt-detalle').value,
      area: document.getElementById('wt-area').value,
      priority: document.getElementById('wt-prioridad').value,
      due: document.getElementById('wt-fecha').value,
    };

    try {
      if (t) {
        await apiWork(`/api/work/${t.id}`, 'PATCH', cuerpo);
        toast('Tarea actualizada', 'ok');
      } else {
        const pasos = document.getElementById('wt-pasos').value
          .split('\n').map((s) => s.trim()).filter(Boolean);
        const res = await api('/api/work', jsonBody('POST', { ...cuerpo, steps: pasos }));
        state.data.work.push(res.task);
        // La recién creada se abre sola: lo siguiente es mirar sus pasos.
        state.work.abierta = res.task.id;
        toast('Tarea creada', 'ok');
      }
    } catch (err) {
      toast(`No se pudo guardar: ${err.message}`, 'error');
      return;
    }
    cerrarEditorTarea();
    renderWork();
  });
}

function cerrarEditorTarea() {
  state.work.editando = null;
  const editor = document.getElementById('work-editor');
  editor.hidden = true;
  editor.innerHTML = '';
}

// ------------------------------------------------------- perfiles ----------
// La app la comparten varias personas por la red de casa. Cada una abre su
// perfil y ve lo suyo —hábitos, historial, notas, logros, trabajo—; lo único
// que comparten es la tabla de la casa. La elección de perfil es de cada
// pantalla, y no hay contraseñas: en una red doméstica esto dice quién eres,
// no lo demuestra.

async function cargarUsuarios() {
  const res = await api('/api/users');
  state.usuarios = res.users;
  return state.usuarios;
}

function olvidarPerfil() {
  recordarSesion('');
  try { localStorage.removeItem(PERFIL_GUARDADO); } catch (e) { /* modo privado */ }
}

function recordarSesion(vale) {
  state.sesion = vale || '';
  try {
    if (state.sesion) localStorage.setItem(SESION_GUARDADA, state.sesion);
    else localStorage.removeItem(SESION_GUARDADA);
  } catch (e) { /* modo privado */ }
}

function sesionRecordada() {
  try { return localStorage.getItem(SESION_GUARDADA) || ''; } catch (e) { return ''; }
}

// La sesión caducó o alguien cambió la contraseña desde otra pantalla. El
// perfil sigue existiendo, así que se vuelve a la puerta con el candado ya
// abierto en el suyo, no a elegir de cero.
function volverAPedirClave() {
  if (!state.usuario) return;
  recordarSesion('');
  // Sin Cancelar: sin sesión no hay nada detrás a lo que volver.
  mostrarSelector({ pidiendo: state.usuario.id });
}

function recordarPerfil(id) {
  try { localStorage.setItem(PERFIL_GUARDADO, id); } catch (e) { /* modo privado */ }
}

function perfilRecordado() {
  try { return localStorage.getItem(PERFIL_GUARDADO); } catch (e) { return null; }
}

// Entrar como alguien. Se limpia lo que era de la sesión anterior antes de
// pintar: sin eso, cambiar de persona arrastraría el filtro de notas de la
// otra, y sobre todo cantaría una subida de nivel falsa al pasar de un perfil
// de nivel 2 a uno de nivel 8.
async function entrarComo(usuario, { clave = null, vale = null } = {}) {
  if (vale !== null) {
    // Volver a un perfil que esta pantalla ya tenía abierto. Se prueba el vale
    // guardado tal cual: si caducó, la primera petición pedirá la contraseña.
    // Es importante no llamar a la puerta aquí, porque una contraseña vacía
    // contaría como intento fallido y recargar cinco veces dejaría fuera.
    recordarSesion(vale);
  } else {
    // Alguien acaba de elegir perfil. Si tiene candado y la contraseña no es
    // esa, esto lanza sin tocar nada de la pantalla: quien estaba, sigue.
    const entrada = await api('/api/sesion', jsonBody('POST', { id: usuario.id, clave: clave || '' }));
    recordarSesion(entrada.sesion);
    usuario = entrada.user || usuario;
  }

  state.usuario = usuario;
  recordarPerfil(state.usuario.id);

  state.nivelPrevio = null;
  state.hoyPintado = false;
  state.diaSeleccionado = null;
  state.notas.buscar = '';
  state.notas.tag = null;
  state.work.abierta = null;
  state.work.editando = null;
  state.casa.editandoPersona = null;
  state.casa.editandoTarea = null;
  const buscarNotas = document.getElementById('notas-buscar');
  if (buscarNotas) buscarNotas.value = '';

  await fetchData();

  ocultarSelector();
  renderPerfilChip();
  renderTodo();
  renderNotas();
  cargarLiga();
  cargarRetos();
  cargarAvisos();
  conectarEventos();
  // Se mira la cadena de las notificaciones entera y se repara lo que se pueda
  // sin molestar a nadie. No se espera: el resto de la app no depende de esto.
  sincronizarPush();
}

function renderPerfilChip() {
  if (!state.usuario) return;
  const chip = document.getElementById('perfil-chip');
  const avatar = document.getElementById('perfil-avatar');
  chip.style.setProperty('--persona', state.usuario.color);
  avatar.textContent = inicial(state.usuario.name);
  document.getElementById('perfil-nombre').textContent = state.usuario.name;
  chip.title = `${state.usuario.name} — cambiar de perfil`;
}

// ---- pantalla de «quién eres» ----

function mostrarSelector({ cambiando = false, pidiendo = null } = {}) {
  const caja = document.getElementById('selector');
  caja.hidden = false;

  const hayGente = state.usuarios.length > 0;
  document.getElementById('selector-title').textContent =
    pidiendo ? 'Tu contraseña' : (cambiando ? 'Cambiar de perfil' : (hayGente ? '¿Quién eres?' : 'Bienvenido a Metanoia'));
  document.getElementById('selector-sub').textContent = hayGente
    ? 'Tus hábitos, tus notas y tus logros son tuyos. Las tareas de la casa son de todos.'
    : 'Crea el primer perfil de la casa. Después podrás añadir a quien viva contigo.';

  // El candado en la tarjeta dice de antemano si va a pedir contraseña: hace
  // falta saberlo antes de tocarla, no después.
  document.getElementById('selector-perfiles').innerHTML = state.usuarios.map((u) => `
    <button class="selector-perfil${state.usuario && state.usuario.id === u.id ? ' actual' : ''}${u.protegido ? ' cerrado' : ''}"
            type="button" data-id="${u.id}" style="--persona:${u.color}">
      <span class="casa-avatar grande">${escapeHTML(inicial(u.name))}</span>
      <span class="selector-perfil-nombre">${escapeHTML(u.name)}</span>
      ${u.protegido ? `<span class="selector-candado" title="Pide contraseña">${iconSVG('candado', 14)}</span>` : ''}
    </button>`).join('');

  document.querySelectorAll('#selector-perfiles .selector-perfil').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = state.usuarios.find((x) => x.id === btn.dataset.id);
      if (u) abrirPerfil(u);
    });
  });

  pintarClave(pidiendo ? state.usuarios.find((u) => u.id === pidiendo) : null);
  marcarPidiendo(pidiendo);
  pintarNuevoPerfil(false);

  // Solo se puede cerrar si ya estabas dentro: en el primer arranque no hay
  // ningún sitio al que volver.
  const previo = document.getElementById('selector-cerrar');
  if (previo) previo.remove();
  if (cambiando && state.usuario) {
    const cerrar = document.createElement('button');
    cerrar.id = 'selector-cerrar';
    cerrar.className = 'btn ghost selector-cerrar';
    cerrar.type = 'button';
    cerrar.textContent = 'Cancelar';
    cerrar.addEventListener('click', ocultarSelector);
    document.querySelector('.selector-caja').appendChild(cerrar);
  }
}

// Deja marcada la tarjeta de quien tiene que escribir la contraseña.
function marcarPidiendo(id) {
  document.querySelectorAll('#selector-perfiles .selector-perfil').forEach((btn) => {
    btn.classList.toggle('pidiendo', !!id && btn.dataset.id === id);
  });
}

function ocultarSelector() {
  document.getElementById('selector').hidden = true;
  pintarClave(null);
}

// Elegir a alguien en la puerta. Con candado se pide la contraseña ahí mismo,
// debajo de las tarjetas; sin candado se entra y ya, como siempre.
async function abrirPerfil(usuario) {
  if (usuario.protegido) {
    pintarClave(usuario);
    marcarPidiendo(usuario.id);
    return;
  }
  pintarClave(null);
  marcarPidiendo(null);
  try {
    await entrarComo(usuario, { clave: '' });
  } catch (err) {
    toast(`No se pudo abrir el perfil: ${err.message}`, 'error');
  }
}

function pintarClave(usuario) {
  const caja = document.getElementById('selector-clave');
  if (!usuario) {
    caja.hidden = true;
    caja.innerHTML = '';
    marcarPidiendo(null);
    return;
  }

  caja.hidden = false;
  caja.innerHTML = `
    <div class="selector-clave-caja" style="--persona:${usuario.color}">
      <p class="selector-clave-quien">${iconSVG('candado', 15)}
        <b>${escapeHTML(usuario.name)}</b> cerró su perfil con contraseña</p>
      <input id="selector-clave-input" class="selector-clave-input" type="password"
             maxlength="72" placeholder="Contraseña" autocomplete="current-password">
      <div class="editor-actions">
        <button class="btn primary" id="selector-clave-entrar" type="button">Entrar</button>
        <button class="btn ghost" id="selector-clave-cancelar" type="button">Cancelar</button>
      </div>
    </div>`;

  const input = document.getElementById('selector-clave-input');
  const boton = document.getElementById('selector-clave-entrar');
  input.focus();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
  boton.addEventListener('click', entrar);
  document.getElementById('selector-clave-cancelar').addEventListener('click', () => pintarClave(null));

  async function entrar() {
    if (!input.value) {
      input.focus();
      return;
    }
    // Se bloquea mientras tanto porque scrypt tarda a propósito: sin esto, dar
    // dos veces al botón manda dos intentos y gasta el doble de los cinco.
    boton.disabled = true;
    try {
      await entrarComo(usuario, { clave: input.value });
    } catch (err) {
      toast(err.message, 'error');
      boton.disabled = false;
      input.select();
      input.focus();
    }
  }
}

// El formulario de perfil nuevo empieza plegado en un botón: en una casa se
// crean tres perfiles una vez y luego no se toca nunca más.
function pintarNuevoPerfil(abierto) {
  const cont = document.getElementById('selector-nuevo');
  const lleno = state.usuarios.length >= 12;

  if (!abierto) {
    cont.innerHTML = lleno
      ? '<p class="field-hint">La casa está llena: no caben más de 12 perfiles.</p>'
      : `<button class="btn ghost" id="selector-crear" type="button">${iconSVG('plus', 18)}Nuevo perfil</button>`;
    const btn = document.getElementById('selector-crear');
    if (btn) btn.addEventListener('click', () => pintarNuevoPerfil(true));
    return;
  }

  const color = colorLibre();
  cont.innerHTML = `
    <div class="selector-form">
      <div class="field">
        <label class="field-label" for="selector-nombre">Nombre</label>
        <input id="selector-nombre" type="text" maxlength="24" placeholder="Tu nombre" autocomplete="off">
      </div>
      <div class="field">
        <span class="field-label">Color</span>
        <div class="swatches" id="selector-colores">
          ${PALETA.map((c) => `<button class="color-dot${c.hex === color ? ' selected' : ''}" type="button"
            data-color="${c.hex}" style="background:${c.hex}" title="${c.nombre}" aria-label="Color ${c.nombre}"></button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="selector-clave-nueva">Contraseña <span class="field-opt">opcional</span></label>
        <input id="selector-clave-nueva" type="password" maxlength="72"
               placeholder="Déjala vacía y tu perfil se abre solo" autocomplete="new-password">
        <p class="field-hint">Sin contraseña, cualquiera de la casa puede abrir tu perfil desde su
          pantalla y leer tus notas. Con contraseña, no. Se puede poner o quitar después.</p>
      </div>
      <div class="editor-actions">
        <button class="btn primary" id="selector-guardar" type="button">Crear perfil</button>
        <button class="btn ghost" id="selector-cancelar" type="button">Cancelar</button>
      </div>
    </div>`;

  let elegido = color;
  cont.querySelectorAll('#selector-colores .color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      cont.querySelectorAll('#selector-colores .color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
      elegido = dot.dataset.color;
    });
  });

  const input = document.getElementById('selector-nombre');
  input.focus();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') crear(); });
  document.getElementById('selector-cancelar').addEventListener('click', () => pintarNuevoPerfil(false));
  document.getElementById('selector-guardar').addEventListener('click', crear);

  async function crear() {
    const nombre = input.value.trim();
    if (!nombre) {
      toast('Ponle un nombre al perfil', 'error');
      input.focus();
      return;
    }
    const clave = document.getElementById('selector-clave-nueva').value;
    if (clave && clave.length < 4) {
      toast('La contraseña necesita al menos 4 caracteres', 'error');
      return;
    }
    let res;
    try {
      res = await api('/api/users', jsonBody('POST', { name: nombre, color: elegido, clave }));
    } catch (err) {
      toast(`No se pudo crear: ${err.message}`, 'error');
      return;
    }
    state.usuarios = res.users;
    // Se entra directo al perfil recién creado: crearlo ya es decir quién eres,
    // y la contraseña acaba de escribirla la misma persona.
    await entrarComo(res.user, { clave });
    toast(`Hola, ${res.user.name}`, 'ok');
  }
}

// ---- canal en vivo ----
// La casa la miran varias pantallas a la vez, así que los cambios llegan solos
// por un stream de eventos. EventSource reconecta por su cuenta si se cae: no
// hay nada que reintentar a mano, solo que contarlo cuando pasa.

let canal = null;

function conectarEventos() {
  if (canal) canal.close();
  canal = new EventSource('/api/eventos');

  canal.addEventListener('open', () => marcarSincronia(true));
  canal.addEventListener('error', () => marcarSincronia(false));

  canal.addEventListener('casa', (e) => {
    const aviso = JSON.parse(e.data);
    marcarSincronia(true);
    if (aviso.origen === CLIENTE) return;   // mi propio eco: ya está pintado
    state.data.casa = aviso.casa;
    renderCasa();
    cargarAvisos({ avisar: true });
    // Que la tabla cambie sola sin decir por qué desconcierta; con el nombre
    // delante, se entiende de un vistazo.
    toast(aviso.quien ? `${aviso.quien} cambió algo en la casa` : 'La casa cambió');
  });

  // La tabla se vuelve a pedir en vez de venir en el aviso: el servidor no sabe
  // qué día es en esta pantalla, y con la casa en UTC-5 una tabla calculada en
  // el servidor cambiaría de semana a las siete de la tarde.
  canal.addEventListener('liga', (e) => {
    const aviso = JSON.parse(e.data);
    marcarSincronia(true);
    if (aviso.origen === CLIENTE) return;
    cargarLiga();
    // Una marca ajena también mueve la clasificación de los retos compartidos:
    // ver que el otro acaba de hacerlo es justo lo que hace que esto compita.
    if (state.retos.length) cargarRetos();
    // Y si lo que se movió fue una marca pública, se dice quién y qué. La tabla
    // sola cambia sin explicar por qué; el nombre del hábito es la noticia.
    if (aviso.marca) {
      cargarAvisos({ avisar: true });
      if (aviso.quien) toast(`${aviso.quien} marcó «${aviso.marca}»`);
    }
  });

  canal.addEventListener('retos', (e) => {
    const aviso = JSON.parse(e.data);
    marcarSincronia(true);
    if (aviso.origen === CLIENTE) return;
    cargarRetos();
    cargarAvisos({ avisar: true });
    if (aviso.quien) toast(`${aviso.quien} movió algo en los retos`);
  });

  canal.addEventListener('usuarios', (e) => {
    const aviso = JSON.parse(e.data);
    marcarSincronia(true);
    if (aviso.origen === CLIENTE) return;
    state.usuarios = aviso.users;
    state.data.casa = aviso.casa;

    // Mi propia ficha puede haber cambiado desde otra pantalla: el nombre, el
    // color o el candado. Sin esto, el editor seguiría creyendo lo de antes.
    const mio = state.usuario && state.usuarios.find((u) => u.id === state.usuario.id);
    if (mio) {
      state.usuario = mio;
      renderPerfilChip();
    }

    // Si alguien borró mi perfil desde otra pantalla, aquí ya no hay sesión.
    if (state.usuario && !state.usuarios.some((u) => u.id === state.usuario.id)) {
      olvidarPerfil();
      toast('Tu perfil ya no existe en esta casa', 'error');
      setTimeout(() => location.reload(), 1500);
      return;
    }
    renderCasa();
  });
}

function marcarSincronia(vivo) {
  if (state.sincronizado === vivo) return;
  state.sincronizado = vivo;
  const punto = document.getElementById('casa-sync');
  if (!punto) return;
  punto.classList.toggle('vivo', vivo);
  punto.textContent = vivo ? 'en vivo' : 'sin conexión';
  punto.title = vivo
    ? 'La tabla se actualiza sola cuando alguien de la casa cambia algo'
    : 'Sin conexión con el servidor: puede que la tabla no esté al día';
}

// -------------------------------------------------------------- la liga -----
// La tabla de la casa en la pantalla de Hoy. Compara rachas de días perfectos y
// no cuentas de marcas: con hábitos distintos por persona, contar marcas premia
// a quien se ponga doce fáciles. Un día perfecto es «hiciste lo tuyo», y eso
// vale lo mismo tengas tres hábitos o diez.
//
// Solo entran los hábitos que su dueño ha hecho públicos. Los privados no
// puntúan, no aparecen y no se cuentan: es lo que permite tener en la misma app
// algo que se compite y algo que no le importa a nadie más.

const PUNTOS_POR_DIFICULTAD = [0, 10, 20, 35, 55, 80];
// La misma escalera que calcula el servidor en RANGOS (server.js). Si las dos
// listas no coinciden, el cliente pinta el nombre del escalón de al lado: aquí
// faltaban Ascendente e Inmortal, y por eso «lo siguiente» después de Diamante
// decía Radiante cuando de verdad quedaban seis divisiones por subir.
const LIGAS = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Ascendente', 'Inmortal', 'Radiante'];

const DIFICULTADES = [
  { valor: 1, nombre: 'Muy fácil' },
  { valor: 2, nombre: 'Fácil' },
  { valor: 3, nombre: 'Normal' },
  { valor: 4, nombre: 'Difícil' },
  { valor: 5, nombre: 'Muy difícil' },
];

// ---- Cada cuánto: una sola pregunta ----
// Antes esto eran dos campos, «Dificultad» y «Cada cuánto», y eran la misma
// pregunta hecha dos veces: lo duro de un hábito ES cuántas veces por semana te
// comprometes a hacerlo. Separados se podían contradecir —«una vez por semana ·
// Muy difícil» cobraba como un compromiso que nadie había hecho—, así que ahora
// se elige la pauta y la dificultad viene con ella.
//
// El espejo de DIFICULTAD_POR_VECES en server.js. Quien manda es el servidor:
// esto solo sirve para poder enseñar el precio antes de guardar.
const DIFICULTAD_POR_VECES = [0, 1, 2, 3, 3, 4, 4, 5];

function vecesPorSemana(pauta) {
  if (!pauta || pauta.tipo === 'diario') return 7;
  if (pauta.tipo === 'dias') return Math.max(1, (pauta.dias || []).length);
  return Math.max(1, pauta.veces);
}

function dificultadDePauta(pauta) {
  return DIFICULTAD_POR_VECES[vecesPorSemana(pauta)] || 1;
}

// Lo que se paga por esta pauta, dicho entero: por marca y a la semana. Las dos
// cifras hacen falta porque no se leen igual —una vez por semana vale mucho por
// marca y poco a la semana— y enseñar solo una invita a elegir mal.
//
// `conNombre` está para no decir «Normal» dos veces seguidas: en el formulario
// el nombre ya va escrito en la opción elegida, y debajo solo hacen falta las
// cifras. Donde no hay desplegable —la ficha de un reto, o los días concretos,
// que no caben en el nombre de una opción— vuelve a hacer falta entero.
function textoExigencia(pauta, { conNombre = true } = {}) {
  const veces = vecesPorSemana(pauta);
  const dif = dificultadDePauta(pauta);
  const semanal = PUNTOS_POR_DIFICULTAD[dif] * 7;
  const cifras = `${Math.round(semanal / veces)} pts por marca · ${semanal} a la semana`;
  return conNombre ? `${DIFICULTADES[dif - 1].nombre} · ${cifras}` : cifras;
}

// El valor del <select> y la pauta son la misma cosa dicha de dos maneras.
function valorDePauta(pauta) {
  if (!pauta || pauta.tipo === 'diario') return 'diario';
  if (pauta.tipo === 'dias') return 'dias';
  return pauta.veces >= 7 ? 'diario' : `semana-${pauta.veces}`;
}

function pautaDeValor(valor, previa) {
  if (valor === 'diario') return { tipo: 'diario' };
  if (valor === 'dias') return { tipo: 'dias', dias: (previa && previa.dias) || [] };
  return { tipo: 'semana', veces: Number(valor.split('-')[1]) || 3 };
}

// Las opciones llevan el precio escrito: elegir cada cuánto es elegir cuánto
// vale, y esconder la segunda mitad de esa frase es lo que hacía falta dos
// campos para decir.
function opcionesPauta(pauta) {
  const puesto = valorDePauta(pauta);
  const marca = (valor) => (valor === puesto ? ' selected' : '');
  const linea = (valor, texto, veces) => {
    const dif = DIFICULTAD_POR_VECES[veces];
    return `<option value="${valor}"${marca(valor)}>${texto} · ${DIFICULTADES[dif - 1].nombre}</option>`;
  };
  return [
    linea('diario', 'Todos los días', 7),
    linea('semana-6', '6 veces por semana', 6),
    linea('semana-5', '5 veces por semana', 5),
    linea('semana-4', '4 veces por semana', 4),
    linea('semana-3', '3 veces por semana', 3),
    linea('semana-2', '2 veces por semana', 2),
    linea('semana-1', '1 vez por semana', 1),
    `<option value="dias"${marca('dias')}>Días concretos de la semana…</option>`,
  ].join('');
}

// Cómo se lee una pauta en una línea.
// La insignia de rango. El nombre completo solo en el sitio donde hay espacio;
// donde no lo hay, la liga y la división bastan para reconocerlo de un vistazo,
// que es para lo que sirve un rango.
// Lo que dice la insignia al pasar el ratón. Está aparte porque lo usan la
// tarjeta de Hoy, la lista de Hábitos y la barra de Progreso, y tres versiones
// distintas de la misma frase es como empiezan a contradecirse.
// La línea de progreso del rango: dónde estás dentro de tu división y qué
// falta para la siguiente. La barra de arriba (constancia) mide el pasado; esta
// mide lo que tienes ahora mismo y se puede perder, que no es lo mismo.
// La barra del rango: dónde estás, cuánto llevas dentro de esta división y
// hacia qué vas. Los puntos van a la izquierda porque son lo que has ganado, y
// el rango siguiente a la derecha porque es hacia donde se avanza: la barra
// entre los dos se lee como el camino de uno al otro.
function barraRango(rango) {
  if (!rango || !rango.estrenado) {
    return '<div class="hs-rango sin-estrenar"><span>Sin estrenar — márcalo una vez y empieza la escalera</span></div>';
  }
  const cima = rango.nombre === 'Radiante';
  const pct = cima ? 100 : rango.enDivision;
  // Una sola línea que se lee de izquierda a derecha: dónde estoy, cuánto
  // llevo, cuánto queda y hacia qué. La barra en medio es literalmente el
  // camino entre la insignia de la izquierda y la de la derecha.
  return `
    <div class="hs-rango liga-${rango.liga}${rango.abandonado ? ' abandonado' : ''}">
      <span class="hs-rango-cara" title="${escapeHTML(tituloRango(rango))}">${rangoSVG(rango, 30)}</span>
      <span class="hs-rango-nombre">${escapeHTML(rango.division ? `${rango.nombre} ${rango.division}` : rango.nombre)}
        ${rango.abandonado ? '<b class="hs-rango-alerta">abandonado</b>' : ''}</span>
      <span class="hs-rango-rr num">${cima ? rango.rr : rango.enDivision}<span> pts</span></span>
      <span class="bar-track rango-track"><span class="bar-fill rango-fill" style="width:${pct}%"></span></span>
      ${pintarSiguiente(rango)}
    </div>`;
}

// Hacia dónde va este hábito: la insignia del escalón siguiente, apagada hasta
// que se llega. En Radiante no hay siguiente, y decirlo es parte del premio.
function pintarSiguiente(rango) {
  if (rango.nombre === 'Radiante') {
    return '<span class="hs-siguiente cima"><span class="hs-siguiente-txt">nada por encima</span></span>';
  }
  const divisiones = Math.floor(rango.rr / 100) + 1;
  const liga = Math.min(Math.floor(divisiones / 3), LIGAS.length - 1);
  const division = liga === LIGAS.length - 1 ? '' : ['I', 'II', 'III'][divisiones % 3];
  const proximo = { nombre: LIGAS[liga], division, liga };
  return `
    <span class="hs-siguiente" title="Siguiente: ${escapeHTML(LIGAS[liga])} ${division}">
      ${rangoSVG(proximo, 26)}
      <span class="hs-siguiente-txt">${escapeHTML(LIGAS[liga])} ${division}</span>
    </span>`;
}

function tituloRango(rango) {
  if (!rango || !rango.estrenado) return 'Sin estrenar';
  const texto = rango.division ? `${rango.nombre} ${rango.division}` : rango.nombre;
  if (rango.plazaOcupada) return `${texto} · la plaza de Radiante la tiene otro`;
  if (rango.nombre === 'Radiante') return `Radiante · ${rango.rr} RR`;
  return `${texto} · ${rango.enDivision}/100 para subir`;
}

function insigniaRango(rango, { corta = false } = {}) {
  if (!rango || !rango.estrenado) {
    return corta ? '' : '<span class="rango sin-estrenar">Sin estrenar</span>';
  }
  const texto = rango.division ? `${rango.nombre} ${rango.division}` : rango.nombre;
  return `<span class="rango liga-${rango.liga}${rango.abandonado ? ' abandonado' : ''}" title="${escapeHTML(tituloRango(rango))}">
    ${rangoSVG(rango, 15)}${escapeHTML(texto)}${corta ? '' : `<b class="num">${rango.enDivision}</b>`}</span>`;
}

function textoPauta(pauta) {
  if (!pauta || pauta.tipo === 'diario') return 'Todos los días';
  if (pauta.tipo === 'semana') return `${pauta.veces} ${pauta.veces === 1 ? 'vez' : 'veces'} por semana`;
  return pauta.dias.map((d) => DIAS_SEMANA[d]).join(', ');
}

// El rango lo calcula el servidor sobre el historial entero, así que después
// de marcar hay que volver a pedirlo. Se piden solo los hábitos: el resto de
// la respuesta ya está en pantalla y volver a pintarlo parpadearía.
async function refrescarRangos() {
  try {
    const payload = await api(`/api/data?hoy=${todayISO()}`);
    state.data.habits = payload.habits;
  } catch (err) {
    return;   // el rango es un adorno: si falla, no se rompe nada
  }
  if (document.querySelector('#view-habitos.active')) renderHabitos();
}

async function cargarLiga() {
  try {
    const res = await api(`/api/liga?hoy=${todayISO()}`);
    state.liga = res.liga;
  } catch (err) {
    // La tabla es un extra: si falla, la pantalla de Hoy sigue sirviendo.
    state.liga = [];
  }
  renderLiga();
}

// Las tres frases posibles bajo un nombre, y son tres cosas distintas: no
// haber publicado nada no es lo mismo que tener el día libre, y confundirlas
// hace que la tabla parezca rota cuando en realidad está vacía.
function estadoDeHoy(p) {
  if (p.publicos === 0) return 'sin hábitos públicos';
  // Lo abandonado va delante de todo lo demás: es la única cifra de esta tabla
  // que empeora sola, y enterarse tarde es justo lo que hay que evitar.
  if (p.abandonados > 0) {
    return `${p.abandonados} ${p.abandonados === 1 ? 'hábito abandonado' : 'hábitos abandonados'}`;
  }
  if (p.hoyTocan === 0) return 'hoy no le toca nada';
  return `hoy ${p.hoyHechos}/${p.hoyTocan}`;
}

function renderLiga() {
  const cont = document.getElementById('liga');
  const caja = document.getElementById('liga-caja');
  if (!cont || !caja) return;

  // Con una sola persona no hay con quién competir y la tabla sobra.
  const hayCon = state.liga.length > 1;
  const hayPublicos = state.liga.some((p) => p.publicos > 0);
  caja.hidden = !hayCon;
  if (!hayCon) return;

  if (!hayPublicos) {
    cont.innerHTML = `<p class="liga-vacia">Nadie ha hecho público ningún hábito todavía.
      Abre uno desde <b>Hábitos</b> y empieza a contar aquí.</p>`;
    return;
  }

  cont.innerHTML = state.liga.map((p, i) => {
    const soyYo = state.usuario && state.usuario.id === p.id;
    const hoyListo = p.hoyTocan > 0 && p.hoyHechos === p.hoyTocan;
    return `
      <div class="liga-fila${soyYo ? ' yo' : ''}" style="--persona:${p.color}">
        <span class="liga-puesto num">${i + 1}</span>
        <span class="casa-avatar">${escapeHTML(inicial(p.name))}</span>
        <span class="liga-quien">
          <b>${escapeHTML(p.name)}${soyYo ? '<span class="casa-persona-yo">tú</span>' : ''}${p.mejorRango
            ? `<span class="rango liga-${p.mejorRango.liga} chico">${escapeHTML(p.mejorRango.division ? `${p.mejorRango.nombre} ${p.mejorRango.division}` : p.mejorRango.nombre)}</span>`
            : ''}</b>
          <span class="liga-hoy${hoyListo ? ' listo' : ''}${p.abandonados > 0 ? ' alerta' : ''}">${estadoDeHoy(p)}</span>
        </span>
        <span class="liga-dato">
          <b class="num">${p.racha}</b>
          <span>${p.racha === 1 ? 'día perfecto' : 'días perfectos'}</span>
        </span>
        <span class="liga-dato">
          <b class="num">${p.puntos}</b>
          <span>pts. esta semana</span>
        </span>
      </div>`;
  }).join('');
}

// -------------------------------------------------------------- avisos ------
// Lo que pasó mientras no mirabas. La bandeja vive en el servidor porque es de
// tu perfil, no de esta pantalla: te retan desde el móvil de otro y tienes que
// enterarte abras donde abras.
//
// Encima de la bandeja, y solo si el navegador deja, va la notificación del
// sistema. Sobre http:// en la red de casa Chrome la bloquea —la API pide
// contexto seguro y 192.168.x no lo es—, así que la bandeja es lo que siempre
// funciona y la notificación es el extra donde se pueda.

// El icono dice de qué va el aviso antes de leerlo. Los tres tipos que existen
// hoy: alguien marcó algo suyo, algo se movió en los retos, algo se movió en la
// casa. Lo que no esté en la tabla cae en el icono de la casa, que es el más
// genérico de los tres.
const ICONO_AVISO = { marca: 'check', reto: 'meta', casa: 'limpiar' };

// ---- notificaciones de verdad ----
// Tres piezas tienen que estar en su sitio para que llegue un aviso con la app
// cerrada: contexto seguro (por eso el servidor va en HTTPS), un service worker
// registrado, y una suscripción al servicio de push del navegador guardada en
// el servidor. Si falta cualquiera, queda la bandeja, que siempre funciona.

let registroSW = null;
// Por qué se negó el navegador a registrar el trabajador de fondo, si es que se
// negó. Guardarlo es lo que permite decir el motivo en vez de «no funciona».
let motivoSW = '';

// El estado real de las notificaciones en este aparato. Se calcula probando la
// cadena entera, no preguntando por el permiso: la app daba por buenas las
// notificaciones porque el permiso estaba dado y el sitio era https, y las dos
// cosas eran ciertas mientras no llegaba ni un aviso. Lo que faltaba —el
// trabajador de fondo, la suscripción— no se miraba nunca.
let estadoPush = { paso: 'mirando' };
// Si el navegador se negó a darse de alta en su propio servicio de push. Es un
// no distinto de todos los demás: hay permiso, hay trabajador de fondo y el
// certificado vale; lo que falta es que el navegador quiera hablar con su
// servicio. Brave lo trae apagado de fábrica y es el caso común.
let pushRechazado = '';
// Cuándo entró el último aviso en este navegador, según el propio trabajador de
// fondo. Es el único dato que separa «no llegó» de «llegó y no lo viste»: si el
// sistema tiene apagados los avisos del navegador, se los traga sin decir nada
// y desde la página todo parece correcto.
let ultimoPushRecibido = 0;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.metanoia === 'push-recibido') ultimoPushRecibido = Date.now();
  });
}
// El resultado de la última prueba, para dejarlo escrito en el panel. Un toast
// dura dos segundos y esta frase hay que poder leerla dos veces.
let veredictoPrueba = '';
// Y si de la prueba salió que conviene rehacer la suscripción, el botón de
// activar vuelve a aparecer aunque el estado diga «listo». Una suscripción
// muerta no se anuncia: el servicio de push sigue aceptando los envíos durante
// un buen rato y solo se nota en que no llega nada.
let pruebaPideRenovar = false;
// Brave se identifica con una API propia. Merece la pena preguntarlo porque el
// arreglo está en un sitio concreto de sus ajustes y decirlo ahorra la búsqueda.
let esBrave = false;
async function mirarSiEsBrave() {
  try { esBrave = Boolean(navigator.brave && await navigator.brave.isBrave()); }
  catch (e) { esBrave = false; }
}

// La llave pública viene en base64url y pushManager la quiere en bytes.
function llaveABytes(base64url) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

async function registrarSW() {
  if (registroSW) return registroSW;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    registroSW = await navigator.serviceWorker.register('/sw.js');
    // Sin esto, la primera visita registra el worker pero todavía no lo tiene
    // activo, y suscribirse justo después falla sin decir por qué.
    await navigator.serviceWorker.ready;
    motivoSW = '';
    return registroSW;
  } catch (e) {
    // Aquí es donde se rompía todo. Con un certificado que el navegador no se
    // cree, aceptar el aviso deja ver la página —y window.isSecureContext
    // incluso responde que sí— pero esta llamada falla con un SecurityError.
    // Sin trabajador de fondo no hay suscripción, y sin suscripción no llega
    // ningún aviso. Se guarda el motivo para poder decirlo.
    motivoSW = (e && e.message) || String(e);
    registroSW = null;
    return null;
  }
}

// ¿Está este aparato suscrito ya? Se pregunta al navegador, no al servidor: el
// que sabe si esta instalación tiene suscripción viva es él.
async function suscripcionDeEsteAparato() {
  if (!registroSW || !registroSW.pushManager) return null;
  try {
    return await registroSW.pushManager.getSubscription();
  } catch (e) {
    return null;
  }
}

// Dónde se rompe la cadena, mirándola entera y en orden. El orden importa: el
// trabajador de fondo se comprueba ANTES que el permiso porque no lo necesita,
// y así en un aparato donde nunca va a funcionar no se gasta la única
// oportunidad de preguntar que da el navegador.
async function calcularPaso() {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'sin-soporte';
  if (!window.isSecureContext) return 'inseguro';
  if (!(await registrarSW())) return 'sin-confianza';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission !== 'granted') return 'sin-permiso';
  if (await suscripcionDeEsteAparato()) return 'listo';
  // Sin suscripción hay dos historias distintas: que todavía no se haya
  // intentado, y que se intentara y el navegador dijera que no.
  return pushRechazado ? 'push-bloqueado' : 'sin-suscripcion';
}

async function revisarPush() {
  estadoPush = { paso: await calcularPaso() };
  renderAvisos();
  return estadoPush.paso;
}

// Suscribirse y dejarlo guardado. No pide permiso: se llama cuando ya está
// dado, así que puede correr sola al abrir la app.
async function suscribirYGuardar() {
  const reg = await registrarSW();
  if (!reg) throw new Error(motivoSW || 'Sin trabajador de fondo');
  let sus = await suscripcionDeEsteAparato();
  if (!sus) {
    const { llave } = await api('/api/push/llave');
    try {
      sus = await reg.pushManager.subscribe({
        // Sin esto Chrome se niega: no quiere suscripciones que no puedan
        // enseñar nada al usuario.
        userVisibleOnly: true,
        applicationServerKey: llaveABytes(llave),
      });
      pushRechazado = '';
    } catch (e) {
      // El navegador no ha podido darse de alta en su servicio. Se guarda para
      // que el panel pueda decir esto y no «falta suscribirse», que sonaría a
      // que basta con volver a pulsar.
      pushRechazado = (e && e.message) || String(e);
      throw e;
    }
  }
  return api('/api/push/suscribir', jsonBody('POST', sus.toJSON()));
}

// Al abrir la app. Repara sola lo que se pueda reparar sin molestar a nadie: si
// el permiso ya está dado y solo falta la suscripción —lo que pasa la primera
// vez tras instalar la autoridad de la casa, o cuando el navegador caduca la
// suya— se rehace en silencio.
async function sincronizarPush() {
  await mirarSiEsBrave();
  await revisarPush();
  if (estadoPush.paso === 'sin-suscripcion') {
    await suscribirYGuardar().catch(() => {});
    await revisarPush();
  } else if (estadoPush.paso === 'listo') {
    // El navegador rota las suscripciones por su cuenta: se reenvía la de ahora
    // para que el servidor no se quede hablándole a una dirección muerta.
    const sus = await suscripcionDeEsteAparato();
    if (sus) await api('/api/push/suscribir', jsonBody('POST', sus.toJSON())).catch(() => {});
  }
}

// El camino entero desde un clic. Se llama al abrir la campana y desde el botón
// de la hora del hábito.
// Tirar la suscripción de este aparato y sacar una nueva. Es lo único que
// arregla una suscripción muerta, que no da error: el servicio de push la sigue
// aceptando y el aviso se pierde por el camino sin que nadie proteste.
async function renovarSuscripcion() {
  const vieja = await suscripcionDeEsteAparato();
  if (vieja) {
    // Se le dice también al servidor, o se queda hablando a un buzón cerrado.
    await api('/api/push/borrar', jsonBody('POST', { endpoint: vieja.endpoint })).catch(() => {});
    await vieja.unsubscribe().catch(() => {});
  }
  return suscribirYGuardar();
}

async function activarNotificaciones() {
  // Cualquier intento de activar deja obsoleto el resultado de la prueba
  // anterior: se borra antes de nada para que no se quede en el panel diciendo
  // lo que pasaba hace dos minutos. Pero primero se apunta si esa prueba pedía
  // rehacer la suscripción, que es lo que decide qué hace este botón.
  const renovar = pruebaPideRenovar;
  veredictoPrueba = '';
  pruebaPideRenovar = false;
  const paso = estadoPush.paso === 'mirando' ? await calcularPaso() : estadoPush.paso;
  if (paso === 'listo') {
    if (!renovar) { toast('Ya están activas en este aparato', 'ok'); return; }
    try {
      await renovarSuscripcion();
      veredictoPrueba = 'Suscripción rehecha. Dale a Probar otra vez.';
      await revisarPush();
      toast('Suscripción rehecha', 'ok');
    } catch (err) {
      await revisarPush();
      toast(`No se pudo rehacer: ${err.message}`, 'error');
    }
    return;
  }
  if (paso !== 'sin-permiso' && paso !== 'sin-suscripcion') {
    // Los demás casos no se arreglan pidiendo permiso: hace falta hacer algo
    // fuera de la app, y el panel ya explica qué. Preguntar igualmente solo
    // gastaría la única vez que el navegador deja preguntar.
    toast(textoDePaso(paso).corto, 'error');
    await revisarPush();
    return;
  }

  // El permiso, lo primero y sin ningún await por delante: el navegador solo
  // atiende la pregunta mientras el clic sigue siendo reciente, y una espera en
  // medio la convierte en una petición que se descarta en silencio.
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) { /* lo dirá el estado */ }
  }
  if (Notification.permission !== 'granted') {
    await revisarPush();
    toast(estadoPush.paso === 'bloqueado'
      ? 'Quedaron bloqueadas para esta dirección en este navegador'
      : 'Sin permiso no puedo avisarte', 'error');
    return;
  }

  try {
    await suscribirYGuardar();
    await revisarPush();
    toast('Notificaciones activadas en este aparato', 'ok');
  } catch (err) {
    await revisarPush();
    // Si el navegador se negó, el estado ya sabe decirlo mejor que el error:
    // «Registration failed - push service error» no le dice nada a nadie.
    const dicho = textoDePaso(estadoPush.paso).corto;
    toast(estadoPush.paso === 'push-bloqueado' ? dicho : `No se pudo suscribir: ${err.message}`, 'error');
  }
}

// Manda un aviso de prueba y espera a ver si vuelve. Tres respuestas posibles y
// cada una manda a un sitio distinto: al servidor, al navegador, o a los
// ajustes del sistema. Antes decía «Mandada» y se lavaba las manos, que es
// justo lo que convierte esto en una tarde de adivinanzas.
async function probarNotificacion() {
  veredictoPrueba = '';
  pruebaPideRenovar = false;
  ultimoPushRecibido = 0;
  let cuenta;
  try {
    cuenta = await api('/api/push/probar', jsonBody('POST', {}));
  } catch (err) {
    await revisarPush();
    toast(err.message, 'error');
    return;
  }

  if (!cuenta.aceptados) {
    // Salió de casa pero el servicio de push la rechazó: la suscripción de este
    // aparato ya no vale. El servidor ya ha tirado las caducadas, así que basta
    // con volver a activarlas.
    veredictoPrueba = cuenta.caducados
      ? 'La suscripción de este aparato había caducado. Ya la he tirado: dale a Activar otra vez.'
      : 'El servicio de avisos del navegador rechazó el envío. Vuelve a activarlas en este aparato.';
    await revisarPush();
    toast('No se pudo entregar', 'error');
    return;
  }

  toast('Mandada, esperando a que vuelva…', 'ok');
  for (let i = 0; i < 30 && !ultimoPushRecibido; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }

  // Se vuelve a mirar la cadena antes de dar el veredicto: la propia prueba
  // puede haber destapado que la suscripción ya no está, y el panel tiene que
  // contar lo que hay ahora, no lo que había al empezar.
  await revisarPush();

  if (ultimoPushRecibido) {
    veredictoPrueba = 'El aviso llegó a este navegador. Si no lo has visto en pantalla, '
      + 'quien lo está callando es el sistema: en Windows, Configuración → Sistema → '
      + 'Notificaciones, busca tu navegador y enciéndelo.';
    toast('Llegó al navegador', 'ok');
  } else {
    veredictoPrueba = 'Salió de casa y el servicio de Google la aceptó, pero el navegador no la '
      + 'ha recibido en quince segundos. Puede ser que la suscripción de este aparato ya no '
      + 'valga —una muerta se acepta igual y solo se nota en que no llega nada—, o que el '
      + 'navegador estuviera cerrado del todo. Dale a Activar para rehacerla y prueba otra vez.';
    pruebaPideRenovar = true;
    toast('No llegó al navegador', 'error');
  }
  renderAvisos();
}

// Qué decirle a quien abre la bandeja, según dónde esté rota la cadena. Cada
// caso tiene una salida distinta y decir «no funciona» a secas no ayuda a
// ninguno. `corto` es la misma frase donde no cabe la larga.
function textoDePaso(paso) {
  switch (paso) {
    case 'sin-soporte':
      return { corto: 'Este navegador no sabe hacer notificaciones.',
        texto: 'Este navegador no sabe hacer notificaciones.' };
    case 'inseguro':
      return { corto: 'Estás entrando por http.',
        texto: 'Estás entrando por http. Abre la app por https y el navegador dejará avisarte.' };
    case 'sin-confianza':
      return { corto: 'Falta instalar el certificado de la casa en este aparato.',
        texto: 'Este aparato no se cree el certificado de la casa. La app se ve igual, pero '
          + 'el navegador bloquea los avisos por detrás. Se arregla instalando la autoridad, '
          + 'una vez por aparato.',
        instalar: true, avisa: true };
    case 'bloqueado':
      return { corto: 'Bloqueaste los avisos para esta dirección.',
        texto: 'Bloqueaste las notificaciones para esta dirección. Se cambia en el candado de la barra del navegador.' };
    case 'push-bloqueado':
      // No se puede enlazar a brave://settings desde una página —el navegador no
      // deja que la web le abra sus propios ajustes— así que se escribe la ruta
      // para copiarla. Es lo único honesto que se puede ofrecer aquí.
      return esBrave
        ? { corto: 'Brave trae apagado el servicio de push de Google.',
          texto: 'Brave trae apagado el servicio de push de Google, y sin él no puede recibir '
            + 'avisos de nadie. Se enciende en brave://settings/privacy → «Usar los servicios '
            + 'de Google para la mensajería push». Hay que reiniciar Brave después.',
          avisa: true }
        : { corto: 'El navegador no pudo darse de alta en su servicio de avisos.',
          texto: 'El navegador no ha podido darse de alta en su servicio de notificaciones. '
            + 'Suele ser un ajuste de privacidad del propio navegador, una extensión que lo '
            + 'bloquea, o un cortafuegos.',
          avisa: true };
    case 'sin-permiso':
      return { corto: 'Falta dar permiso en este aparato.',
        texto: 'Activa las notificaciones y te aviso aunque tengas la app cerrada.', activar: true, avisa: true };
    case 'sin-suscripcion':
      return { corto: 'Este aparato aún no está suscrito.',
        texto: 'Falta el último paso para que los avisos lleguen con la app cerrada.', activar: true, avisa: true };
    case 'listo':
      return { corto: '', texto: '', listo: true };
    default:
      return { corto: '', texto: '' };
  }
}

// La notificación del sistema, la que sale con la app abierta en otra pestaña.
// Esta solo necesita el permiso: no pasa por el trabajador de fondo, así que
// funciona incluso donde el push está roto. Si tampoco hay permiso no pasa
// nada: el aviso ya está en la bandeja y el punto de la campana ya se encendió.
function notificar(texto) {
  if (document.visibilityState === 'visible') return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('Metanoia', { body: texto, tag: 'metanoia', renotify: false });
  } catch (e) { /* algunos navegadores solo dejan desde un service worker */ }
}

// ¿Llegaría un aviso a este aparato con la app cerrada? Es la pregunta que
// importa para la hora de un hábito, y la respuesta no es «hay permiso».
function puedeNotificar() {
  return estadoPush.paso === 'listo';
}

async function cargarAvisos({ avisar = false } = {}) {
  const antes = state.avisos.length ? state.avisos[0].id : null;
  try {
    const res = await api('/api/avisos');
    state.avisos = res.avisos;
  } catch (err) {
    // La lista no llegó, pero el estado del permiso no depende del servidor y
    // sí depende de que esto se pinte. Si no, el botón de Activar no aparece
    // nunca y no hay forma de encender las notificaciones.
    renderAvisos();
    return;
  }
  // Solo se notifica lo que acaba de llegar, no toda la bandeja al abrir.
  if (avisar && state.avisos.length && state.avisos[0].id !== antes && !state.avisos[0].visto) {
    notificar(state.avisos[0].texto);
  }
  renderAvisos();
}

function sinVer() {
  return state.avisos.filter((a) => !a.visto).length;
}

function renderAvisos() {
  const punto = document.getElementById('campana-punto');
  const lista = document.getElementById('avisos-lista');
  const permiso = document.getElementById('avisos-permiso');
  if (!punto || !lista) return;

  const nuevos = sinVer();
  punto.hidden = nuevos === 0;
  punto.textContent = nuevos > 9 ? '9+' : String(nuevos);
  const estado = textoDePaso(estadoPush.paso);
  const campana = document.getElementById('campana');
  campana.classList.toggle('con-avisos', nuevos > 0);
  // Un punto distinto del de los avisos: aquel dice «hay algo que leer», este
  // dice «hay algo que arreglar». Lo enciende cada caso por su cuenta: hay
  // problemas —el certificado, el push apagado— que no se ven por ningún otro
  // lado, y otros —lo bloqueaste tú— donde insistir sería dar la lata.
  campana.classList.toggle('pide-permiso', Boolean(estado.avisa));
  const caja = document.getElementById('avisos-estado');
  const probar = document.getElementById('avisos-probar');
  const instalar = document.getElementById('avisos-ca');
  // El resultado de la última prueba manda mientras lo que falle siga siendo de
  // ese tramo. Si lo que se rompe es algo más de fondo —el permiso, el
  // certificado— eso va primero: el veredicto de una prueba vieja no ayuda a
  // nadie ahí, y taparlo con él sería mentir.
  const delTramo = estadoPush.paso === 'listo' || estadoPush.paso === 'sin-suscripcion';
  // El botón de activar también sale cuando una prueba se quedó por el camino:
  // ahí la única jugada que le queda a la persona es rehacer la suscripción, y
  // el botón que hace eso es este.
  if (permiso) permiso.hidden = !(estado.activar || (delTramo && pruebaPideRenovar));
  if (probar) probar.hidden = !estado.listo;
  // El enlace a la autoridad solo aparece donde sirve de algo. En cualquier
  // otro momento es una invitación a instalar un certificado porque sí.
  if (instalar) instalar.hidden = !estado.instalar;
  if (caja) {
    const dice = (delTramo && veredictoPrueba) ? veredictoPrueba : estado.texto;
    caja.hidden = !dice;
    caja.textContent = dice;
  }

  if (state.avisos.length === 0) {
    lista.innerHTML = `<p class="avisos-vacio">Nada por ahora. Aquí llega lo que hagan los demás:
      lo que marcan, los retos, quién se apunta y qué se mueve en la casa.</p>`;
    return;
  }

  lista.innerHTML = state.avisos.map((a) => `
    <div class="aviso${a.visto ? '' : ' nuevo'} tipo-${a.tipo}">
      <span class="aviso-icono">${iconSVG(ICONO_AVISO[a.tipo] || 'limpiar', 15)}</span>
      <span class="aviso-texto">${escapeHTML(a.texto)}</span>
      <span class="aviso-cuando">${haceCuanto(a.cuando)}</span>
    </div>`).join('');
}

// «hace 3 h» se lee de un vistazo; una fecha completa hay que interpretarla.
function haceCuanto(iso) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

async function alternarAvisos() {
  const caja = document.getElementById('avisos');
  const campana = document.getElementById('campana');
  const abriendo = caja.hidden;
  caja.hidden = !abriendo;
  campana.setAttribute('aria-expanded', String(abriendo));
  if (!abriendo) return false;

  await cargarAvisos();
  // Abrir la bandeja es haberlos visto. Se marca después de pintarlos para que
  // se note cuáles eran nuevos antes de que se apaguen.
  if (sinVer() > 0) {
    setTimeout(async () => {
      try {
        const res = await api('/api/avisos/vistos', jsonBody('POST', {}));
        state.avisos = res.avisos;
      } catch (err) { /* se quedan en negrita hasta la próxima */ }
      renderAvisos();
    }, 1200);
  }
  return true;
}

// --------------------------------------------------------------- retos ------
// Un reto es la única forma de que dos personas compitan de verdad, porque es
// lo único que garantiza que están haciendo lo mismo con las mismas reglas. El
// hábito que aparece en tu lista al entrar no es tuyo del todo: el nombre, la
// pauta y la dificultad son del reto y no se pueden tocar. Lo único tuyo es el
// color y, sobre todo, si lo haces o no.

async function cargarRetos() {
  try {
    const [retos, tablon] = await Promise.all([
      api(`/api/retos?hoy=${todayISO()}`),
      api(`/api/tablon?hoy=${todayISO()}`),
    ]);
    state.retos = retos.retos;
    state.tablon = tablon.tablon;
  } catch (err) {
    state.retos = [];
    state.tablon = [];
  }
  renderRetos();
}

// Las llamadas que cambian un reto devuelven la lista ya recalculada, así que
// pintar es cuestión de guardarla. El error se dice y no se pinta nada.
async function accionReto(hacer, exito) {
  try {
    const res = await hacer();
    state.retos = res.retos;
    if (res.tablon) state.tablon = res.tablon;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
  renderRetos();
  cargarLiga();
  // Entrar o salir de un reto añade o quita un hábito de la lista, así que
  // aquí no vale con refrescar los rangos: hay que volver a pedir el perfil y
  // repintar. Sin esto, el hábito recién aceptado no aparece hasta recargar.
  try {
    state.data = await api(`/api/data?hoy=${todayISO()}`);
    renderTodo();
  } catch (err) { /* ya está pintado lo que había */ }
  if (exito) toast(exito, 'ok');
  return true;
}

function renderRetos() {
  const caja = document.getElementById('retos-caja');
  const lista = document.getElementById('retos-lista');
  if (!caja || !lista) return;

  // Sin nadie más en casa no hay a quién retar.
  caja.hidden = state.usuarios.length < 2;
  if (caja.hidden) return;

  const mios = state.retos.filter((r) => r.miEstado !== 'fuera');
  const fuera = state.retos.filter((r) => r.miEstado === 'fuera');

  // El tablón se pinta siempre, con retos o sin ellos: cuando no hay ninguno es
  // justo cuando hace falta enseñar a qué se puede uno unir.
  if (state.retos.length === 0) {
    lista.innerHTML = `<p class="liga-vacia">Ningún reto todavía. Con <b>Retar a alguien</b> propones
      un hábito con sus reglas; quien acepte lo tendrá en su lista con la misma pauta y la misma
      dificultad, y la escalera se cuenta aparte para cada uno.</p>`;
  } else {
    lista.innerHTML = [...mios, ...fuera].map((r) => pintarReto(r)).join('');
    engancharReto(lista);
  }
  renderTablon();
}

// ---- el tablón ----
// Unirse a lo que ya hace otro es la puerta de entrada barata a competir: no
// hay que proponer nada ni ponerse de acuerdo. Por debajo se convierte en un
// reto normal, así que a partir de ahí todo funciona igual.
function renderTablon() {
  const caja = document.getElementById('tablon');
  const lista = document.getElementById('tablon-lista');
  if (!caja || !lista) return;

  caja.hidden = state.tablon.length === 0;
  if (caja.hidden) return;

  lista.innerHTML = state.tablon.map((h) => `
    <div class="tablon-fila" data-user="${h.userId}" data-habit="${h.habitId}" style="--persona:${h.color}">
      <span class="tablon-icono">${iconSVG(h.icono, 20)}</span>
      <span class="tablon-datos">
        <b>${escapeHTML(h.nombre)}</b>
        <span class="tablon-regla">${escapeHTML(textoPauta(h.pauta))} ·
          ${DIFICULTADES[h.dificultad - 1].nombre} · ${h.porMarca} pts por marca</span>
      </span>
      <span class="tablon-quien">
        <span class="casa-avatar">${escapeHTML(inicial(h.userName))}</span>
        <span>${h.compitiendo > 1 ? `${h.compitiendo} compitiendo` : escapeHTML(h.userName)}</span>
      </span>
      ${h.rango.estrenado ? `<span class="tablon-rango" title="${escapeHTML(h.userName)}: ${escapeHTML(h.rango.division ? `${h.rango.nombre} ${h.rango.division}` : h.rango.nombre)}">${rangoSVG(h.rango, 22)}</span>` : '<span class="tablon-rango"></span>'}
      <button class="btn ghost tablon-unirme" type="button">Unirme</button>
    </div>`).join('');

  lista.querySelectorAll('.tablon-fila').forEach((fila) => {
    fila.querySelector('.tablon-unirme').addEventListener('click', () => {
      accionReto(
        () => api('/api/tablon/unirme', jsonBody('POST', {
          userId: fila.dataset.user,
          habitId: fila.dataset.habit,
        })),
        'Dentro: a competir');
    });
  });
}

function pintarReto(r) {
  const invitado = r.miEstado === 'invitado';
  const fuera = r.miEstado === 'fuera';

  const filas = r.clasificacion.map((f) => `
    <div class="reto-fila${state.usuario && f.id === state.usuario.id ? ' yo' : ''}" style="--persona:${f.color}">
      <span class="liga-puesto num">${f.puesto}</span>
      <span class="casa-avatar">${escapeHTML(inicial(f.name))}</span>
      <span class="reto-quien">
        <b>${escapeHTML(f.name)}</b>
        <span class="liga-hoy${f.hoyHecho ? ' listo' : ''}">${f.hoyHecho
          ? 'hoy, hecho'
          : (f.hoyToca ? 'hoy le toca' : 'hoy no le toca')}</span>
      </span>
      ${insigniaRango(f.rango)}
      <span class="reto-racha"><b class="num">${f.rango.racha}</b><span>de racha</span></span>
    </div>`).join('');

  return `
    <article class="reto-caja${invitado ? ' invitado' : ''}${fuera ? ' fuera' : ''}" data-id="${r.id}">
      <header class="reto-cab">
        <span class="reto-icono">${iconSVG(r.icono, 20)}</span>
        <span class="reto-titulo">
          <b>${escapeHTML(r.nombre)}</b>
          <span class="reto-reglas">${escapeHTML(textoPauta(r.pauta))} · ${textoExigencia(r.pauta)}</span>
        </span>
        <span class="reto-acciones">
          ${invitado ? `
            <button class="btn primary reto-entrar" type="button">Acepto</button>
            <button class="btn ghost reto-rechazar" type="button">Ahora no</button>`
          : fuera ? '<button class="btn ghost reto-entrar" type="button">Volver</button>'
          : `${r.soyCreador
              ? '<button class="icon-btn reto-cancelar" type="button" title="Cancelar el reto para todos">' + iconSVG('trash', 16) + '</button>'
              : ''}
             <button class="btn ghost reto-salir" type="button">Rendirse</button>`}
        </span>
      </header>

      ${invitado
        ? `<p class="reto-aviso">Si aceptas, «${escapeHTML(r.nombre)}» aparece en tu lista de hábitos
            con estas reglas. No se pueden cambiar: en eso consiste el reto.</p>`
        : ''}
      ${fuera ? '<p class="reto-aviso">Te rendiste. Puedes volver, pero los días que faltaste siguen contando.</p>' : ''}
      ${filas ? `<div class="reto-tabla">${filas}</div>` : ''}
      ${r.invitados.length ? `<p class="reto-pendientes">Falta que acepten: ${escapeHTML(r.invitados.join(', '))}</p>` : ''}
    </article>`;
}

function engancharReto(lista) {
  lista.querySelectorAll('.reto-caja').forEach((caja) => {
    const id = caja.dataset.id;
    const entrar = caja.querySelector('.reto-entrar');
    const salir = caja.querySelector('.reto-salir');
    const rechazar = caja.querySelector('.reto-rechazar');
    const cancelar = caja.querySelector('.reto-cancelar');

    if (entrar) {
      entrar.addEventListener('click', () =>
        accionReto(() => api(`/api/retos/${id}/entrar?hoy=${todayISO()}`, jsonBody('POST', {})), 'Estás dentro'));
    }
    // Rendirse y rechazar son la misma llamada; lo que cambia es lo que
    // significa, y por eso preguntan cosas distintas.
    if (rechazar) {
      rechazar.addEventListener('click', () =>
        accionReto(() => api(`/api/retos/${id}/salir`, jsonBody('POST', {})), ''));
    }
    if (salir) {
      salir.addEventListener('click', () => {
        confirmarEnLinea(caja.querySelector('.reto-acciones'),
          '¿Rendirte? El hábito sale de tu lista y los días que faltes siguen contando si vuelves.',
          () => accionReto(() => api(`/api/retos/${id}/salir`, jsonBody('POST', {})), ''));
      });
    }
    if (cancelar) {
      cancelar.addEventListener('click', () => {
        confirmarEnLinea(caja.querySelector('.reto-acciones'),
          '¿Cancelar el reto para todos? Desaparece de la lista de hábitos de cada uno.',
          () => accionReto(() => api(`/api/retos/${id}`, { method: 'DELETE' }), 'Reto cancelado'));
      });
    }
  });
}

// ---- proponer un reto ----

function pintarEditorReto(abierto) {
  const editor = document.getElementById('reto-editor');
  editor.hidden = !abierto;
  if (!abierto) {
    editor.innerHTML = '';
    return;
  }

  const otros = state.usuarios.filter((u) => !state.usuario || u.id !== state.usuario.id);
  editor.innerHTML = `
    <div class="editor-title">Retar a alguien</div>
    <p class="field-hint">Tú también entras: proponer algo a lo que no te apuntas no es retar.</p>

    <div class="field">
      <label class="field-label" for="reto-nombre">Qué hay que hacer</label>
      <input id="reto-nombre" type="text" maxlength="40" placeholder="Por ejemplo: Correr 5 km" autocomplete="off">
    </div>

    <div class="field">
      <label class="field-label" for="reto-pauta">Cada cuánto</label>
      <select id="reto-pauta">${opcionesPauta({ tipo: 'semana', veces: 3 })}</select>
      <div id="reto-pauta-detalle"></div>
      <p class="field-hint" id="reto-exigencia"></p>
    </div>

    <div class="field">
      <span class="field-label">Icono</span>
      <div class="icon-picker" id="reto-iconos">
        ${HABIT_ICON_CATALOG.map((c) => `
          <button class="icon-option${c.key === 'meta' ? ' selected' : ''}" type="button" data-key="${c.key}" title="${c.label}" aria-label="${c.label}">
            ${iconSVG(c.key, 24)}
          </button>`).join('')}
      </div>
    </div>

    <div class="field">
      <span class="field-label">A quién</span>
      <div class="reto-gente" id="reto-gente">
        ${otros.map((u) => `
          <label class="reto-persona" style="--persona:${u.color}">
            <input type="checkbox" value="${u.id}">
            <span class="casa-avatar">${escapeHTML(inicial(u.name))}</span>
            <span>${escapeHTML(u.name)}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="editor-actions">
      <button class="btn primary" id="reto-guardar" type="button">Lanzar el reto</button>
      <button class="btn ghost" id="reto-cancelar" type="button">Cancelar</button>
    </div>`;

  let icono = 'meta';
  editor.querySelectorAll('#reto-iconos .icon-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      editor.querySelectorAll('#reto-iconos .icon-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      icono = opt.dataset.key;
    });
  });

  // La misma pieza que en el editor de hábitos: elegir cada cuánto es elegir la
  // dificultad, y en un reto eso es el precio que aceptan los demás al entrar.
  let pauta = { tipo: 'semana', veces: 3 };
  const detalle = document.getElementById('reto-pauta-detalle');
  const sel = document.getElementById('reto-pauta');
  const exigencia = document.getElementById('reto-exigencia');

  function pintarExigencia() {
    const dias = pauta.tipo === 'dias';
    exigencia.textContent = dias && !(pauta.dias || []).length
      ? 'Marca al menos un día: sin días, no es una pauta.'
      : `${textoExigencia(pauta, { conNombre: dias })} — lo mismo para todos los que entren.`;
  }

  function pintarDetalle() {
    if (pauta.tipo === 'dias') {
      const puestos = pauta.dias || [];
      detalle.innerHTML = `<div class="casa-dias" id="reto-dias">${DIAS_SEMANA.map((d, i) => `
        <label class="casa-dia-check"><input type="checkbox" value="${i}"${puestos.includes(i) ? ' checked' : ''}><span>${d}</span></label>`).join('')}</div>`;
      detalle.querySelectorAll('#reto-dias input').forEach((ch) => {
        ch.addEventListener('change', () => {
          pauta.dias = [...detalle.querySelectorAll('#reto-dias input:checked')].map((x) => Number(x.value));
          pintarExigencia();
        });
      });
    } else {
      detalle.innerHTML = '';
    }
    pintarExigencia();
  }
  pintarDetalle();
  sel.addEventListener('change', () => {
    pauta = pautaDeValor(sel.value, pauta);
    pintarDetalle();
  });

  const nombre = document.getElementById('reto-nombre');
  nombre.focus();
  document.getElementById('reto-cancelar').addEventListener('click', () => pintarEditorReto(false));

  document.getElementById('reto-guardar').addEventListener('click', async () => {
    const limpio = nombre.value.trim();
    if (!limpio) {
      toast('Ponle un nombre al reto', 'error');
      nombre.focus();
      return;
    }
    const invitados = [...document.querySelectorAll('#reto-gente input:checked')].map((x) => x.value);
    if (invitados.length === 0) {
      toast('Elige a quién retas', 'error');
      return;
    }
    const hecho = await accionReto(
      () => api(`/api/retos?hoy=${todayISO()}`, jsonBody('POST', {
        nombre: limpio,
        icono,
        // Sin `dificultad`: sale de la pauta, en el servidor.
        pauta,
        invitados,
      })),
      `Reto lanzado: «${limpio}»`);
    if (hecho) pintarEditorReto(false);
  });
}

// ------------------------------------------------------------- vista Casa ---
// El reparto de la casa. Los hábitos son de uno y las tareas de trabajo son un
// proceso; aquí lo que importa es QUIÉN. Por eso la pieza central es una tabla:
// una fila por tarea, una columna por día y en cada casilla la persona que se
// encarga. Encima queda solo lo de hoy, que es lo único que se marca — el plan
// se repite cada semana, lo hecho no.

const inicial = (nombre) => (nombre.trim()[0] || '?').toUpperCase();

// El color que se propone al añadir a alguien: el primero de la paleta que no
// lleve ya nadie. Si la casa se queda sin colores libres —doce perfiles, doce
// de treinta y tantos colores— se cae al de siempre, que ya sí puede repetir.
function colorLibre() {
  const usados = new Set(state.usuarios.map((u) => u.color));
  const libre = PALETA.find((c) => !usados.has(c.hex));
  return (libre || PALETA[state.usuarios.length % PALETA.length]).hex;
}

async function apiCasa(url, metodo, cuerpo) {
  const res = await api(url, cuerpo === undefined ? { method: metodo } : jsonBody(metodo, cuerpo));
  // Estas rutas devuelven el bloque entero. Un cambio puede tocar tres sitios a
  // la vez (quitar a alguien borra su perfil y vacía sus casillas), así que se
  // sustituye completo en vez de ir parcheando piezas.
  if (res && res.casa) state.data.casa = res.casa;
  if (res && res.users) state.usuarios = res.users;
  return res;
}

// Envoltura común: ejecuta, avisa si falla y repinta pase lo que pase.
async function guardarCasa(accion, mensaje = '') {
  try {
    await accion();
  } catch (err) {
    toast(`No se pudo guardar: ${err.message}`, 'error');
    renderCasa();
    return false;
  }
  if (mensaje) toast(mensaje, 'ok');
  renderCasa();
  return true;
}

// Las de hora fija van primero y en orden de reloj: así la tabla se lee como se
// vive el día. Las que no tienen hora quedan al final, en el orden en que se
// crearon.
function tareasCasa() {
  return [...casa().chores].sort((a, b) => {
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return a.order - b.order;
  });
}

const diaDeHoy = () => weekdayIndex(new Date());
// Una tarea mensual ocupa una casilla de la semana como cualquier otra —hay que
// poder decir «el baño, los sábados»— pero solo cuenta como «de hoy» la primera
// vez que ese día cae en el mes. Con el día del mes en 1..7 solo puede haber
// pasado una vez, así que la regla entera cabe en una comparación.
const primeraDelMes = (fecha = new Date()) => fecha.getDate() <= 7;

const tocaHoy = (c, fecha = new Date()) =>
  !!c.assign[weekdayIndex(fecha)] && (c.cada !== 'mes' || primeraDelMes(fecha));

const tareasDeHoy = () => tareasCasa().filter((c) => tocaHoy(c));
const casaHecha = (id, fecha = todayISO()) => (casa().done[fecha] || []).includes(id);

function renderCasa() {
  // Si el servidor que corre es anterior a esta sección, `casa` ni siquiera
  // existe en los datos. Sin este aviso se vería una tabla vacía, que es justo
  // lo que se ve cuando todavía no has creado nada.
  if (state.data.casa === undefined) {
    document.getElementById('casa-personas').innerHTML = '';
    document.getElementById('casa-tabla').innerHTML = '';
    document.getElementById('casa-tabla-vacia').hidden = true;
    document.getElementById('casa-pie').hidden = true;
    document.getElementById('casa-hoy').innerHTML = `<p class="empty-state">
      El servidor que está corriendo todavía no conoce la sección Casa.<br>
      Ciérralo y vuelve a arrancarlo con <code>node server.js</code>, y recarga esta página.
    </p>`;
    return;
  }

  const hoy = tareasDeHoy();
  const hechas = hoy.filter((c) => casaHecha(c.id)).length;
  const titulo = document.getElementById('casa-title');
  const sub = document.getElementById('casa-sub');

  if (casa().chores.length === 0) {
    titulo.textContent = 'Sin tareas de casa todavía';
    sub.textContent = 'Añade a quienes viven aquí y las tareas que hay que hacer: la tabla reparte la semana.';
  } else if (hoy.length === 0) {
    titulo.textContent = 'Hoy no toca nada';
    sub.textContent = `Ninguna tarea está asignada para ${DIAS_SEMANA_LARGO[diaDeHoy()].toLowerCase()}. El reparto se hace en la tabla.`;
  } else if (hechas === hoy.length) {
    titulo.textContent = 'La casa está al día';
    sub.textContent = hoy.length === 1
      ? 'La única tarea de hoy ya está hecha.'
      : `Las ${hoy.length} tareas de hoy están hechas.`;
  } else {
    const faltan = hoy.length - hechas;
    titulo.textContent = `${faltan} ${faltan === 1 ? 'tarea' : 'tareas'} por hacer hoy`;
    sub.textContent = 'Cada quien tiene lo suyo aquí abajo. Márcalo cuando esté hecho.';
  }

  renderCasaPersonas();
  renderCasaHoy();
  renderCasaTabla();
}

// ---- personas ----

function renderCasaPersonas() {
  const cont = document.getElementById('casa-personas');
  const people = state.usuarios;
  const { chores } = casa();

  if (people.length === 0) {
    cont.innerHTML = `<p class="casa-vacio">Todavía no vive nadie aquí. Empieza por <b>Añadir persona</b>:
      sin personas las casillas de la tabla no tienen a quién asignar.</p>`;
    return;
  }

  cont.innerHTML = people.map((p) => {
    // Cuántas casillas de la semana lleva encima. Es el dato que hace visible
    // si el reparto está torcido, que es para lo que sirve la tabla.
    const turnos = chores.reduce((n, c) => n + c.assign.filter((a) => a === p.id).length, 0);
    const soyYo = state.usuario && state.usuario.id === p.id;
    // El perfil ajeno con contraseña no se edita ni se quita desde aquí. Los
    // botones no se desactivan: se van, porque un botón apagado invita a
    // insistir y este no va a ceder nunca.
    const ajenoCerrado = p.protegido && !soyYo;
    return `
      <div class="casa-persona${soyYo ? ' yo' : ''}" data-id="${p.id}" style="--persona:${p.color}">
        <span class="casa-avatar">${escapeHTML(inicial(p.name))}</span>
        <span class="casa-persona-datos">
          <b class="casa-persona-nombre">${escapeHTML(p.name)}${soyYo ? '<span class="casa-persona-yo">tú</span>' : ''}${p.protegido ? `<span class="casa-candado" title="Perfil con contraseña">${iconSVG('candado', 12)}</span>` : ''}</b>
          <span class="casa-persona-turnos"><span class="num">${turnos}</span> ${turnos === 1 ? 'turno' : 'turnos'} a la semana</span>
        </span>
        <span class="casa-persona-acciones">
          ${ajenoCerrado ? '<span class="casa-persona-cerrado" title="Tiene contraseña: solo quien la puso puede cambiar o quitar este perfil">solo su dueño</span>' : `
          <button class="icon-btn casa-persona-editar" type="button" title="Editar" aria-label="Editar a ${escapeHTML(p.name)}">${iconSVG('edit', 16)}</button>
          <button class="icon-btn casa-persona-borrar" type="button" title="Quitar" aria-label="Quitar a ${escapeHTML(p.name)}">${iconSVG('trash', 16)}</button>`}
        </span>
      </div>`;
  }).join('');

  cont.querySelectorAll('.casa-persona').forEach((fila) => {
    const id = fila.dataset.id;
    if (!fila.querySelector('.casa-persona-editar')) return;   // perfil cerrado
    fila.querySelector('.casa-persona-editar').addEventListener('click', () => abrirEditorPersona(id));
    // Quitar a alguien borra su perfil entero, no solo su fila de la tabla. La
    // confirmación lo dice con números para que nadie lo descubra después.
    fila.querySelector('.casa-persona-borrar').addEventListener('click', () => {
      const p = personaById(id);
      if (!p) return;
      const r = p.resumen || { habitos: 0, notas: 0, tareas: 0 };
      const suyo = [
        r.habitos ? `${r.habitos} ${r.habitos === 1 ? 'hábito' : 'hábitos'}` : '',
        r.notas ? `${r.notas} ${r.notas === 1 ? 'nota' : 'notas'}` : '',
        r.tareas ? `${r.tareas} ${r.tareas === 1 ? 'tarea de trabajo' : 'tareas de trabajo'}` : '',
      ].filter(Boolean).join(', ');
      const soyYo = state.usuario && state.usuario.id === id;

      confirmarEnLinea(
        fila.querySelector('.casa-persona-acciones'),
        soyYo
          ? `¿Borrar tu propio perfil${suyo ? ` con ${suyo}` : ''}? Volverás a la pantalla de inicio.`
          : `¿Quitar a ${escapeHTML(p.name)}${suyo ? ` y borrar ${suyo}` : ''}? Sus casillas quedan libres.`,
        async () => {
          const ok = await guardarCasa(
            () => apiCasa(`/api/users/${id}`, 'DELETE'),
            soyYo ? '' : `${p.name} ya no está en la casa`);
          if (ok && soyYo) {
            olvidarPerfil();
            location.reload();
          }
        },
      );
    });
  });
}

// Confirmación en línea, el mismo gesto que en hábitos y en Work Mode: la fila
// pregunta en su sitio, sin diálogos del navegador.
function confirmarEnLinea(zona, pregunta, siConfirma) {
  if (zona.dataset.confirmando === 'si') return;
  zona.dataset.confirmando = 'si';
  zona.innerHTML = `
    <span class="confirm-inline">${pregunta}
      <button class="btn danger btn-si" type="button">Sí</button>
      <button class="btn ghost btn-no" type="button">No</button>
    </span>`;
  zona.querySelector('.btn-si').addEventListener('click', siConfirma);
  zona.querySelector('.btn-no').addEventListener('click', () => renderCasa());
}

// ---- hoy en casa ----

function renderCasaHoy() {
  const cont = document.getElementById('casa-hoy');
  const cuenta = document.getElementById('casa-hoy-cuenta');
  const lista = tareasDeHoy();
  const hoy = diaDeHoy();

  cuenta.textContent = lista.length === 0 ? '' : `${lista.filter((c) => casaHecha(c.id)).length}/${lista.length}`;

  if (lista.length === 0) {
    cont.innerHTML = `<p class="casa-vacio">Hoy (${DIAS_SEMANA_LARGO[hoy].toLowerCase()}) no hay nada asignado.</p>`;
    return;
  }

  cont.innerHTML = lista.map((c) => {
    const p = personaById(c.assign[hoy]);
    const hecha = casaHecha(c.id);
    return `
      <button class="casa-hoy-item${hecha ? ' hecha' : ''}" type="button" data-id="${c.id}"
              style="--persona:${p ? p.color : 'var(--text-faint)'}" aria-pressed="${hecha}">
        <span class="casa-hoy-check">${iconSVG('check', 14)}</span>
        <span class="casa-hoy-icono">${iconSVG(c.icon, 19)}</span>
        <span class="casa-hoy-nombre">${escapeHTML(c.name)}</span>
        ${c.time ? `<span class="casa-hoy-hora num">${c.time}</span>` : ''}
        <span class="casa-hoy-quien">${p ? escapeHTML(p.name) : 'sin asignar'}</span>
      </button>`;
  }).join('');

  cont.querySelectorAll('.casa-hoy-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const marcando = !casaHecha(id);
      // Respuesta inmediata: la marca no espera al servidor.
      btn.classList.toggle('hecha', marcando);
      if (marcando) sonidoHabito(0); else sonidoDeshacer();
      await guardarCasa(() => apiCasa('/api/casa/mark', 'POST', { choreId: id, date: todayISO(), done: marcando }));

      // Cerrar el día entero merece decirlo: es el único momento en que la
      // sección tiene algo que celebrar.
      const quedan = tareasDeHoy();
      if (marcando && quedan.length > 0 && quedan.every((c) => casaHecha(c.id))) {
        sonidoHito();
        const r = btn.getBoundingClientRect();
        confeti(r.left + r.width / 2, r.top);
        toast('Todo lo de la casa hecho por hoy', 'ok');
      }
    });
  });
}

// ---- la tabla de la semana ----

function renderCasaTabla() {
  const tabla = document.getElementById('casa-tabla');
  const vacia = document.getElementById('casa-tabla-vacia');
  const pie = document.getElementById('casa-pie');
  const lista = tareasCasa();

  if (lista.length === 0) {
    tabla.innerHTML = '';
    vacia.hidden = false;
    pie.hidden = true;
    return;
  }

  vacia.hidden = true;
  pie.hidden = false;
  const hoy = diaDeHoy();
  tabla.innerHTML = `
    <thead>
      <tr>
        <th class="casa-col-tarea" scope="col">Tarea</th>
        <th class="casa-col-hora" scope="col">Hora</th>
        ${DIAS_SEMANA.map((d, i) => `
          <th class="casa-col-dia${i === hoy ? ' hoy' : ''}" scope="col" title="${DIAS_SEMANA_LARGO[i]}">${d}</th>`).join('')}
        <th class="casa-col-acciones" scope="col" aria-label="Acciones"></th>
      </tr>
    </thead>
    <tbody>${lista.map((c) => filaCasa(c, hoy)).join('')}</tbody>`;

  cablearTablaCasa(tabla);
}

function filaCasa(c, hoy) {
  const celdas = c.assign.map((quien, dia) => {
    const p = personaById(quien);
    // Solo se arrastra lo propio. Mover el turno de otro sin decírselo es la
    // forma más rápida de que la tabla deje de ser de fiar; para eso está el
    // menú, que al menos es un gesto deliberado.
    const mia = !!p && !!state.usuario && p.id === state.usuario.id;
    return `
      <td class="casa-celda${dia === hoy ? ' hoy' : ''}">
        <button class="casa-asignar${p ? ' puesta' : ''}${mia ? ' mia' : ''}" type="button" aria-expanded="false"
                ${mia ? 'draggable="true"' : ''}
                data-chore="${c.id}" data-dia="${dia}"${p ? ` style="--persona:${p.color}"` : ''}
                aria-label="${DIAS_SEMANA_LARGO[dia]}, ${escapeHTML(c.name)}: ${p ? escapeHTML(p.name) : 'libre'}. ${mia ? 'Arrastra para cambiar de día, o toca para reasignar' : 'Cambiar'}">
          ${p
            ? `<span class="casa-avatar mini">${escapeHTML(inicial(p.name))}</span><span class="casa-asignar-nombre">${escapeHTML(p.name)}</span>`
            : iconSVG('plus', 13)}
        </button>
      </td>`;
  }).join('');

  return `
    <tr class="casa-fila" data-id="${c.id}">
      <th class="casa-tarea" scope="row">
        <span class="casa-tarea-in">
          <span class="casa-tarea-icono">${iconSVG(c.icon, 18)}</span>
          <span class="casa-tarea-texto">
            <b>${escapeHTML(c.name)}${c.cada === 'mes'
              ? '<span class="casa-cada" title="Solo la primera vez que ese día cae en el mes">1×/mes</span>'
              : ''}</b>
            ${c.note ? `<span class="casa-tarea-nota">${escapeHTML(c.note)}</span>` : ''}
          </span>
        </span>
      </th>
      <td class="casa-hora num">${c.time || '—'}</td>
      ${celdas}
      <td class="casa-acciones">
        <button class="icon-btn casa-tarea-editar" type="button" title="Editar tarea" aria-label="Editar ${escapeHTML(c.name)}">${iconSVG('edit', 17)}</button>
        <button class="icon-btn casa-tarea-borrar" type="button" title="Borrar tarea" aria-label="Borrar ${escapeHTML(c.name)}">${iconSVG('trash', 17)}</button>
      </td>
    </tr>`;
}

function cablearTablaCasa(tabla) {
  tabla.querySelectorAll('.casa-asignar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Al soltar, el navegador manda un click de propina sobre el origen: sin
      // esta guarda, arrastrar terminaría abriendo el menú de la casilla vieja.
      if (arrastre.recien) return;
      abrirMenuPersonas(btn);
    });
  });

  cablearArrastreCasa(tabla);

  tabla.querySelectorAll('.casa-fila').forEach((fila) => {
    const id = fila.dataset.id;
    fila.querySelector('.casa-tarea-editar').addEventListener('click', () => abrirEditorTareaCasa(id));
    fila.querySelector('.casa-tarea-borrar').addEventListener('click', () => {
      const c = casa().chores.find((t) => t.id === id);
      if (!c) return;
      confirmarEnLinea(
        fila.querySelector('.casa-acciones'),
        `¿Borrar «${escapeHTML(c.name)}»?`,
        () => guardarCasa(() => apiCasa(`/api/casa/chores/${id}`, 'DELETE'), 'Tarea borrada'),
      );
    });
  });
}

// Menú de personas de una casilla. Va en position: fixed y colgado del body
// porque la tabla vive dentro de un contenedor con desplazamiento horizontal,
// y ahí dentro un menú absoluto se recortaría contra el borde.
// ---- arrastrar turnos ----
// Cambiar de día un turno propio es el gesto más frecuente de esta tabla —«hoy
// no puedo, lo hago el jueves»— y hacerlo con el menú son tres toques: abrir,
// quitar, ir a la otra casilla y ponerse. Arrastrando es uno.
//
// Se mueve dentro de la misma fila: arrastrar a otra tarea sería cambiar de
// tarea, no de día, y eso ya es otra cosa. El destino tiene que estar libre;
// soltar encima del turno de otro sería quitárselo por sorpresa.
const arrastre = { chore: null, dia: null, recien: false };

function cablearArrastreCasa(tabla) {
  tabla.querySelectorAll('.casa-asignar.mia').forEach((btn) => {
    btn.addEventListener('dragstart', (e) => {
      arrastre.chore = btn.dataset.chore;
      arrastre.dia = Number(btn.dataset.dia);
      btn.classList.add('arrastrando');
      // Hace falta poner algo o Firefox cancela el arrastre antes de empezar.
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', btn.dataset.chore);
      marcarDestinos(tabla, true);
    });

    btn.addEventListener('dragend', () => {
      btn.classList.remove('arrastrando');
      marcarDestinos(tabla, false);
      arrastre.chore = null;
      // El click de propina llega justo después de dragend, así que la guarda
      // se levanta en el siguiente turno del bucle de eventos.
      arrastre.recien = true;
      setTimeout(() => { arrastre.recien = false; }, 0);
    });
  });

  tabla.querySelectorAll('.casa-asignar').forEach((destino) => {
    destino.addEventListener('dragover', (e) => {
      if (!puedeSoltarse(destino)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      destino.classList.add('encima');
    });

    destino.addEventListener('dragleave', () => destino.classList.remove('encima'));

    destino.addEventListener('drop', async (e) => {
      e.preventDefault();
      destino.classList.remove('encima');
      if (!puedeSoltarse(destino)) return;

      const choreId = arrastre.chore;
      const desde = arrastre.dia;
      const hasta = Number(destino.dataset.dia);
      arrastre.chore = null;

      // Primero se pone en el destino y después se libera el origen: si algo
      // falla por el medio, el turno se ha duplicado, que es mucho mejor que
      // haber desaparecido de la tabla sin que nadie se entere.
      const puesto = await guardarCasa(() => apiCasa('/api/casa/assign', 'POST', {
        choreId, day: hasta, personId: state.usuario.id,
      }));
      if (!puesto) return;
      await guardarCasa(() => apiCasa('/api/casa/assign', 'POST', {
        choreId, day: desde, personId: '',
      }), `Turno movido al ${DIAS_SEMANA_LARGO[hasta].toLowerCase()}`);
    });
  });
}

// Solo casillas libres de la misma tarea.
function puedeSoltarse(destino) {
  return !!arrastre.chore
    && destino.dataset.chore === arrastre.chore
    && Number(destino.dataset.dia) !== arrastre.dia
    && !destino.classList.contains('puesta');
}

function marcarDestinos(tabla, encendido) {
  tabla.querySelectorAll('.casa-asignar').forEach((btn) => {
    btn.classList.toggle('destino', encendido && puedeSoltarse(btn));
    if (!encendido) btn.classList.remove('encima');
  });
}

function abrirMenuPersonas(btn) {
  cerrarMenuCasa();

  const people = state.usuarios;
  if (people.length === 0) {
    toast('Primero añade a alguien con «Añadir persona»');
    return;
  }
  const choreId = btn.dataset.chore;
  const dia = Number(btn.dataset.dia);
  const tarea = casa().chores.find((c) => c.id === choreId);
  if (!tarea) return;

  const menu = document.createElement('div');
  menu.className = 'casa-menu';
  menu.innerHTML = people.map((p) => `
    <button type="button" class="casa-menu-item${tarea.assign[dia] === p.id ? ' activa' : ''}"
            data-persona="${p.id}" style="--persona:${p.color}">
      <span class="casa-avatar mini">${escapeHTML(inicial(p.name))}</span>${escapeHTML(p.name)}
    </button>`).join('') + `
    <button type="button" class="casa-menu-item libre" data-persona="">${iconSVG('close', 13)}Dejar libre</button>`;

  document.body.appendChild(menu);
  btn.setAttribute('aria-expanded', 'true');

  // Centrado bajo la casilla, sin salirse de la ventana por ningún lado; si no
  // cabe debajo se abre hacia arriba.
  const r = btn.getBoundingClientRect();
  const ancho = menu.offsetWidth;
  const alto = menu.offsetHeight;
  menu.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - ancho / 2), window.innerWidth - ancho - 8)}px`;
  menu.style.top = `${r.bottom + 6 + alto > window.innerHeight - 8 ? r.top - alto - 6 : r.bottom + 6}px`;

  menu.querySelectorAll('.casa-menu-item').forEach((opt) => {
    opt.addEventListener('click', async () => {
      cerrarMenuCasa();
      await guardarCasa(() => apiCasa('/api/casa/assign', 'POST', {
        choreId, day: dia, personId: opt.dataset.persona,
      }));
    });
  });

  menu.querySelector('.casa-menu-item').focus();
}

function cerrarMenuCasa() {
  document.querySelectorAll('.casa-menu').forEach((m) => m.remove());
  document.querySelectorAll('.casa-asignar[aria-expanded="true"]')
    .forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

// ---- editor de persona ----

function abrirEditorPersona(id) {
  cerrarEditorTareaCasa();
  const persona = id === 'nueva' ? null : personaById(id);
  if (id !== 'nueva' && !persona) return;

  state.casa.editandoPersona = id;
  const editor = document.getElementById('casa-persona-editor');
  editor.hidden = false;

  const color = persona ? persona.color : colorLibre();
  // La contraseña solo aparece en el perfil propio: la de cada quien la pone
  // esa persona, y el servidor rechaza cualquier otra cosa de todos modos.
  const esMio = !!persona && !!state.usuario && persona.id === state.usuario.id;
  editor.innerHTML = `
    <div class="editor-title">${persona ? 'Editar persona' : 'Añadir a alguien de la casa'}</div>
    ${persona ? '' : '<p class="field-hint">Tendrá su propio perfil: sus hábitos, sus notas y sus logros aparte. La tabla de la casa la comparten.</p>'}

    <div class="field">
      <label class="field-label" for="casa-persona-nombre">Nombre</label>
      <input id="casa-persona-nombre" type="text" maxlength="24" placeholder="Por ejemplo: Juanjo"
             value="${persona ? escapeHTML(persona.name) : ''}">
    </div>

    <div class="field">
      <span class="field-label">Color</span>
      <div class="swatches" id="casa-persona-colores">
        ${PALETA.map((c) => `<button class="color-dot${c.hex === color ? ' selected' : ''}" type="button"
          data-color="${c.hex}" style="background:${c.hex}" title="${c.nombre}" aria-label="Color ${c.nombre}"></button>`).join('')}
      </div>
      <p class="field-hint">El color es cómo se reconoce a cada quien en la tabla.</p>
    </div>

    <div class="editor-actions">
      <button class="btn primary" id="casa-persona-guardar" type="button">${persona ? 'Guardar cambios' : 'Añadir'}</button>
      <button class="btn ghost" id="casa-persona-cancelar" type="button">Cancelar</button>
    </div>

    ${esMio ? `
    <div class="field clave-field">
      <span class="field-label">${iconSVG('candado', 14)} Tu contraseña</span>
      ${persona.protegido ? `
      <input id="clave-actual" class="clave-input" type="password" maxlength="72"
             placeholder="La de ahora" autocomplete="current-password">` : ''}
      <input id="clave-nueva" class="clave-input" type="password" maxlength="72"
             placeholder="${persona.protegido ? 'La nueva' : 'Ponle una (mínimo 4 caracteres)'}" autocomplete="new-password">
      <div class="editor-actions">
        <button class="btn" id="clave-guardar" type="button">${persona.protegido ? 'Cambiar contraseña' : 'Poner contraseña'}</button>
        ${persona.protegido ? '<button class="btn ghost" id="clave-quitar" type="button">Quitar contraseña</button>' : ''}
      </div>
      <p class="field-hint">${persona.protegido
        ? 'Cambiarla cierra tu perfil en las demás pantallas: habrá que volver a entrar en cada una. Si la olvidas no hay quien la recupere; se quita desde aquí y se pone otra.'
        : 'Es opcional. Sin ella, cualquiera de la casa puede abrir tu perfil desde su pantalla y leer tus notas.'}</p>
    </div>` : ''}`;

  let elegido = color;
  editor.querySelectorAll('#casa-persona-colores .color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      editor.querySelectorAll('#casa-persona-colores .color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
      elegido = dot.dataset.color;
    });
  });

  const input = document.getElementById('casa-persona-nombre');
  input.focus();

  if (esMio) {
    document.getElementById('clave-guardar').addEventListener('click', () => guardarClave(false));
    const quitar = document.getElementById('clave-quitar');
    if (quitar) quitar.addEventListener('click', () => guardarClave(true));
  }

  // La contraseña se guarda aparte del nombre y del color a propósito: son dos
  // decisiones distintas y mezclarlas haría que cambiar de color pidiera la
  // contraseña de ahora.
  async function guardarClave(quitando) {
    const actual = document.getElementById('clave-actual');
    const nueva = document.getElementById('clave-nueva');
    const valor = quitando ? '' : nueva.value;
    if (!quitando && valor.length < 4) {
      toast('La contraseña necesita al menos 4 caracteres', 'error');
      nueva.focus();
      return;
    }
    let res;
    try {
      res = await api(`/api/users/${persona.id}/clave`, jsonBody('POST', {
        actual: actual ? actual.value : '',
        nueva: valor,
      }));
    } catch (err) {
      toast(err.message, 'error');
      if (actual) {
        actual.select();
        actual.focus();
      }
      return;
    }
    // El vale viejo acaba de morir en el servidor; este es el nuevo.
    recordarSesion(res.sesion);
    state.usuarios = res.users;
    state.usuario = res.user;
    cerrarEditorPersona();
    renderCasa();
    toast(quitando ? 'Tu perfil ya no pide contraseña' : 'Contraseña guardada', 'ok');
  }

  document.getElementById('casa-persona-cancelar').addEventListener('click', cerrarEditorPersona);

  document.getElementById('casa-persona-guardar').addEventListener('click', async () => {
    const nombre = input.value.trim();
    if (!nombre) {
      toast('Ponle un nombre a la persona', 'error');
      input.focus();
      return;
    }
    const cuerpo = { name: nombre, color: elegido };
    const ok = persona
      ? await guardarCasa(() => apiCasa(`/api/users/${persona.id}`, 'PATCH', cuerpo), 'Persona actualizada')
      : await guardarCasa(() => apiCasa('/api/users', 'POST', cuerpo), `${nombre} ya está en la casa`);
    if (ok) {
      cerrarEditorPersona();
      // Si me acabo de renombrar, el chip de la cabecera dice el nombre viejo.
      if (persona && state.usuario && persona.id === state.usuario.id) {
        state.usuario = state.usuarios.find((u) => u.id === state.usuario.id) || state.usuario;
        renderPerfilChip();
      }
    }
  });
}

function cerrarEditorPersona() {
  state.casa.editandoPersona = null;
  const editor = document.getElementById('casa-persona-editor');
  editor.hidden = true;
  editor.innerHTML = '';
}

// ---- editor de tarea de casa ----

function abrirEditorTareaCasa(id) {
  cerrarEditorPersona();
  const tarea = id === 'nueva' ? null : casa().chores.find((c) => c.id === id);
  if (id !== 'nueva' && !tarea) return;

  state.casa.editandoTarea = id;
  const editor = document.getElementById('casa-tarea-editor');
  editor.hidden = false;

  const icono = tarea ? tarea.icon : 'limpiar';
  editor.innerHTML = `
    <div class="editor-title">${tarea ? 'Editar tarea de casa' : 'Nueva tarea de casa'}</div>

    <div class="field">
      <label class="field-label" for="casa-tarea-nombre">Qué hay que hacer</label>
      <input id="casa-tarea-nombre" type="text" maxlength="60" placeholder="Por ejemplo: Lavar los platos"
             value="${tarea ? escapeHTML(tarea.name) : ''}">
    </div>

    <div class="casa-editor-fila">
      <div class="field">
        <label class="field-label" for="casa-tarea-hora">Hora</label>
        <input id="casa-tarea-hora" type="time" value="${tarea ? tarea.time : ''}">
        <p class="field-hint">Vacía = sin hora fija.</p>
      </div>
      <div class="field">
        <label class="field-label" for="casa-tarea-nota">Detalle</label>
        <input id="casa-tarea-nota" type="text" maxlength="200" placeholder="Qué incluye, dónde están las cosas…"
               value="${tarea ? escapeHTML(tarea.note) : ''}">
      </div>
      <div class="field">
        <label class="field-label" for="casa-tarea-cada">Cada cuánto</label>
        <select id="casa-tarea-cada">
          <option value="semana"${(tarea ? tarea.cada : 'semana') === 'semana' ? ' selected' : ''}>Cada semana</option>
          <option value="mes"${(tarea ? tarea.cada : '') === 'mes' ? ' selected' : ''}>Una vez al mes</option>
        </select>
        <p class="field-hint">Al mes = solo la primera vez que ese día cae en el mes.</p>
      </div>
    </div>

    <div class="field">
      <span class="field-label">Icono</span>
      <div class="icon-picker" id="casa-tarea-iconos">
        ${HABIT_ICON_CATALOG.map((c) => `
          <button class="icon-option${c.key === icono ? ' selected' : ''}" type="button" data-key="${c.key}" title="${c.label}" aria-label="${c.label}">
            ${iconSVG(c.key, 24)}
          </button>`).join('')}
      </div>
    </div>

    ${tarea ? '' : `
      <div class="field">
        <span class="field-label">Quién y qué días</span>
        <div class="casa-reparto">
          <select id="casa-tarea-quien" aria-label="Quién se encarga">
            <option value="">Nadie por ahora</option>
            ${state.usuarios.map((p) => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
          </select>
          <div class="casa-dias" id="casa-tarea-dias">
            ${DIAS_SEMANA.map((d, i) => `
              <label class="casa-dia-check">
                <input type="checkbox" value="${i}"><span>${d}</span>
              </label>`).join('')}
          </div>
        </div>
        <p class="field-hint">Es solo el reparto de arranque: cualquier casilla de la tabla se cambia después con un toque.</p>
      </div>`}

    <div class="editor-actions">
      <button class="btn primary" id="casa-tarea-guardar" type="button">${tarea ? 'Guardar cambios' : 'Crear tarea'}</button>
      <button class="btn ghost" id="casa-tarea-cancelar" type="button">Cancelar</button>
    </div>`;

  let elegido = icono;
  editor.querySelectorAll('#casa-tarea-iconos .icon-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      editor.querySelectorAll('#casa-tarea-iconos .icon-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      elegido = opt.dataset.key;
    });
  });

  const input = document.getElementById('casa-tarea-nombre');
  input.focus();

  document.getElementById('casa-tarea-cancelar').addEventListener('click', cerrarEditorTareaCasa);

  document.getElementById('casa-tarea-guardar').addEventListener('click', async () => {
    const nombre = input.value.trim();
    if (!nombre) {
      toast('Ponle un nombre a la tarea', 'error');
      input.focus();
      return;
    }
    const cuerpo = {
      name: nombre,
      icon: elegido,
      time: document.getElementById('casa-tarea-hora').value,
      note: document.getElementById('casa-tarea-nota').value,
      cada: document.getElementById('casa-tarea-cada').value,
    };

    let ok;
    if (tarea) {
      ok = await guardarCasa(() => apiCasa(`/api/casa/chores/${tarea.id}`, 'PATCH', cuerpo), 'Tarea actualizada');
    } else {
      const quien = document.getElementById('casa-tarea-quien').value;
      const dias = [...document.querySelectorAll('#casa-tarea-dias input:checked')].map((ch) => Number(ch.value));
      // Sin persona elegida la tarea entra en la tabla con todas las casillas
      // libres: existe, y ya se reparte tocándolas.
      cuerpo.assign = Array.from({ length: 7 }, (_, d) => (quien && dias.includes(d) ? quien : ''));
      ok = await guardarCasa(() => apiCasa('/api/casa/chores', 'POST', cuerpo), `«${nombre}» añadida`);
    }
    if (ok) cerrarEditorTareaCasa();
  });
}

function cerrarEditorTareaCasa() {
  state.casa.editandoTarea = null;
  const editor = document.getElementById('casa-tarea-editor');
  editor.hidden = true;
  editor.innerHTML = '';
}

// --------------------------------------------------------- vista Hábitos ----

function renderHabitos() {
  const cont = document.getElementById('habitos-lista');
  cont.innerHTML = '';

  const lista = habits();
  if (lista.length === 0) {
    cont.innerHTML = '<p class="empty-state">Sin hábitos. Crea el primero con «Nuevo hábito».</p>';
  }

  lista.forEach((habit, i) => {
    // Las cifras vienen del servidor porque son las únicas que entienden la
    // pauta. rachaDe() cuenta días de calendario y sigue sirviendo para los
    // hábitos diarios; para lo demás mentiría.
    const r = habit.rango;
    const actual = r && r.estrenado ? r.racha : 0;
    const maxima = r && r.estrenado ? r.maxima : 0;
    const constancia = r && r.estrenado ? r.constancia : 0;

    const row = document.createElement('div');
    row.className = 'habito-row';
    row.style.setProperty('--habit', habit.color);
    row.innerHTML = `
      <span class="habito-swatch">${iconSVG(habit.icon, 24)}</span>
      <div class="habito-info">
        <div class="habito-nombre">${escapeHTML(habit.name)}</div>
        <div class="habito-sub">Racha de ${actual} ${actual === 1 ? 'día' : 'días'} · máximo ${maxima} · ${constancia}% de constancia</div>
        <div class="habito-meta">
          ${insigniaRango(habit.rango)}
          <span class="habito-tag${habit.publico ? ' publico' : ''}">${habit.publico ? 'Público' : 'Privado'}</span>
          <span class="habito-tag">${escapeHTML(textoPauta(habit.pauta))}</span>
          ${habit.recordatorio ? `<span class="habito-tag hora">${iconSVG('campana', 12)} ${habit.recordatorio}</span>` : ''}
          <span class="habito-tag">${DIFICULTADES[(habit.dificultad || 2) - 1].nombre} · ${r && r.porMarca ? r.porMarca : PUNTOS_POR_DIFICULTAD[habit.dificultad || 2]} pts por marca</span>
        </div>
      </div>
      <div class="habito-acciones">
        <button class="icon-btn act-subir" type="button" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${iconSVG('up', 17)}</button>
        <button class="icon-btn act-bajar" type="button" aria-label="Bajar" ${i === lista.length - 1 ? 'disabled' : ''}>${iconSVG('down', 17)}</button>
        <button class="icon-btn act-editar" type="button" aria-label="Editar">${iconSVG('edit', 17)}</button>
        <button class="icon-btn act-borrar" type="button" aria-label="Borrar">${iconSVG('trash', 17)}</button>
      </div>
    `;

    row.querySelector('.act-subir').addEventListener('click', () => mover(i, -1));
    row.querySelector('.act-bajar').addEventListener('click', () => mover(i, 1));
    row.querySelector('.act-editar').addEventListener('click', () => abrirEditor(habit.id));
    row.querySelector('.act-borrar').addEventListener('click', () => confirmarBorrado(row, habit));

    cont.appendChild(row);
  });
}

async function mover(indice, delta) {
  const ids = habits().map((h) => h.id);
  const destino = indice + delta;
  if (destino < 0 || destino >= ids.length) return;
  [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
  try {
    const res = await reordenarHabitos(ids);
    state.data.habits = res.habits;
  } catch (err) {
    toast(`No se pudo reordenar: ${err.message}`);
    return;
  }
  renderTodo();
}

function confirmarBorrado(row, habit) {
  const acciones = row.querySelector('.habito-acciones');
  if (acciones.dataset.confirmando === 'si') return;
  acciones.dataset.confirmando = 'si';
  acciones.innerHTML = `
    <span class="confirm-inline">¿Borrar «${escapeHTML(habit.name)}»?
      <button class="btn danger btn-si" type="button">Sí</button>
      <button class="btn ghost btn-no" type="button">No</button>
    </span>`;
  acciones.querySelector('.btn-si').addEventListener('click', async () => {
    try {
      await borrarHabito(habit.id);
      state.data.habits = state.data.habits.filter((h) => h.id !== habit.id);
    } catch (err) {
      toast(`No se pudo borrar: ${err.message}`);
      return;
    }
    toast('Hábito borrado. Su historial se conserva.');
    renderTodo();
  });
  acciones.querySelector('.btn-no').addEventListener('click', () => renderHabitos());
}

function abrirEditor(id) {
  state.editandoHabito = id;
  const habit = id === 'nuevo' ? null : habitById(id);
  const editor = document.getElementById('habito-editor');
  editor.hidden = false;

  const nombre = habit ? habit.name : '';
  const icono = habit ? habit.icon : HABIT_ICON_CATALOG[0].key;
  const color = habit ? habit.color : PALETA[habits().length % PALETA.length].hex;
  const pauta = habit ? habit.pauta : { tipo: 'diario' };
  const recordatorio = habit ? (habit.recordatorio || '') : '';
  // Nuevo nace público; los que ya existían se quedan como estén.
  const publico = habit ? habit.publico === true : true;

  editor.style.setProperty('--habit', color);
  editor.innerHTML = `
    <div class="editor-title">${habit ? 'Editar hábito' : 'Nuevo hábito'}</div>

    <div class="field">
      <label class="field-label" for="habito-nombre">Nombre</label>
      <input id="habito-nombre" type="text" maxlength="40" placeholder="Por ejemplo: Leer 20 minutos" value="${escapeHTML(nombre)}">
    </div>

    <div class="field">
      <span class="field-label">Color</span>
      <div class="swatches" id="habito-colores">
        ${PALETA.map((c) => `<button class="color-dot${c.hex === color ? ' selected' : ''}" type="button" data-color="${c.hex}" style="background:${c.hex}" title="${c.nombre}" aria-label="Color ${c.nombre}"></button>`).join('')}
      </div>
      <p class="field-hint" id="habito-color-nombre"></p>
    </div>

    <div class="field">
      <span class="field-label">Icono</span>
      <div class="icon-picker" id="habito-iconos">
        ${HABIT_ICON_CATALOG.map((c) => `
          <button class="icon-option${c.key === icono ? ' selected' : ''}" type="button" data-key="${c.key}" title="${c.label}" aria-label="${c.label}">
            ${iconSVG(c.key, 24)}
          </button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label class="field-label" for="habito-pauta">Cada cuánto</label>
      <select id="habito-pauta">${opcionesPauta(pauta)}</select>
      <div id="habito-pauta-detalle"></div>
      <p class="field-hint" id="habito-exigencia"></p>
    </div>

    <div class="field">
      <label class="field-label" for="habito-recordatorio">Recordarme a las</label>
      <div class="recordatorio-fila">
        <input id="habito-recordatorio" type="time" value="${recordatorio}">
        <button class="btn ghost" id="habito-recordatorio-quitar" type="button"${recordatorio ? '' : ' hidden'}>Quitar</button>
      </div>
      <p class="field-hint" id="habito-recordatorio-hint"></p>
      <button class="btn ghost" id="habito-recordatorio-permiso" type="button" hidden>Activar notificaciones</button>
    </div>

    <div class="field">
      <label class="publico-check">
        <input type="checkbox" id="habito-publico"${publico ? ' checked' : ''}>
        <span>Público para la casa</span>
      </label>
      <p class="field-hint">Un hábito público suma en la tabla y los demás ven su nombre.
        Uno privado no sale de aquí: ni puntúa, ni se cuenta, ni se nombra.</p>
    </div>

    <div class="editor-preview" id="habito-preview"></div>

    <div class="editor-actions">
      <button class="btn primary" id="habito-guardar" type="button">${habit ? 'Guardar cambios' : 'Crear hábito'}</button>
      <button class="btn ghost" id="habito-cancelar" type="button">Cancelar</button>
    </div>
  `;

  let seleccion = { nombre, icono, color };

  function refrescarPreview() {
    editor.style.setProperty('--habit', seleccion.color);
    // Los círculos de color no dicen cuál es cuál: el nombre del elegido va
    // debajo. El respaldo cubre hábitos con un color que ya no esté en la lista.
    const elegido = PALETA.find((c) => c.hex === seleccion.color);
    document.getElementById('habito-color-nombre').textContent = elegido ? elegido.nombre : seleccion.color;
    document.getElementById('habito-preview').innerHTML = `
      <span class="habito-swatch">${iconSVG(seleccion.icono, 24)}</span>
      <span>Así se verá: <b>${escapeHTML(seleccion.nombre || 'Sin nombre')}</b></span>
    `;
  }
  refrescarPreview();

  const campoHora = document.getElementById('habito-recordatorio');
  const quitarHora = document.getElementById('habito-recordatorio-quitar');
  const pistaHora = document.getElementById('habito-recordatorio-hint');

  const permisoHora = document.getElementById('habito-recordatorio-permiso');

  function refrescarHora() {
    const puesta = campoHora.value;
    quitarHora.hidden = !puesta;
    const falta = puesta && !puedeNotificar();
    // El botón solo aparece donde sirve: con una hora puesta y con los avisos
    // sin activar. Mandar a alguien a buscar la campana pierde a la mitad por
    // el camino. Y solo si el problema se arregla desde aquí: si falta instalar
    // el certificado, un botón de «activar» no hace más que mentir.
    const desdeAqui = estadoPush.paso === 'sin-permiso' || estadoPush.paso === 'sin-suscripcion';
    permisoHora.hidden = !(falta && desdeAqui);
    if (!puesta) {
      pistaHora.textContent = 'Sin hora no te aviso: el hábito solo está en la lista.';
    } else if (falta) {
      // El motivo exacto, no «falta permiso»: en este aparato puede ser otra
      // cosa, y la campana lo explica entero.
      pistaHora.textContent = `${textoDePaso(estadoPush.paso).corto} Se arregla en la campana, arriba.`;
    } else {
      pistaHora.textContent = `A las ${puesta} te llega un aviso, salvo que ya lo hayas marcado.`;
    }
  }
  refrescarHora();
  campoHora.addEventListener('input', refrescarHora);
  quitarHora.addEventListener('click', () => { campoHora.value = ''; refrescarHora(); });
  permisoHora.addEventListener('click', async () => {
    await activarNotificaciones();
    refrescarHora();
  });

  // El cupo semanal ya va dentro de la propia opción, así que el detalle solo
  // aparece para los días concretos: siete casillas, y la exigencia se recalcula
  // según se marcan, porque ahí el precio depende de cuántas se pongan.
  let pautaActual = { ...pauta };
  const selPauta = document.getElementById('habito-pauta');
  const detalle = document.getElementById('habito-pauta-detalle');
  const exigencia = document.getElementById('habito-exigencia');

  function pintarExigencia() {
    const dias = pautaActual.tipo === 'dias';
    exigencia.textContent = dias && !(pautaActual.dias || []).length
      ? 'Marca al menos un día: sin días, no es una pauta.'
      : textoExigencia(pautaActual, { conNombre: dias });
  }

  function pintarDetallePauta() {
    if (pautaActual.tipo === 'dias') {
      const puestos = pautaActual.dias || [];
      detalle.innerHTML = `<div class="casa-dias" id="habito-dias">${DIAS_SEMANA.map((d, i) => `
        <label class="casa-dia-check">
          <input type="checkbox" value="${i}"${puestos.includes(i) ? ' checked' : ''}><span>${d}</span>
        </label>`).join('')}</div>`;
      detalle.querySelectorAll('#habito-dias input').forEach((ch) => {
        ch.addEventListener('change', () => {
          pautaActual.dias = [...detalle.querySelectorAll('#habito-dias input:checked')].map((x) => Number(x.value));
          pintarExigencia();
        });
      });
    } else {
      detalle.innerHTML = '';
    }
    pintarExigencia();
  }
  pintarDetallePauta();

  selPauta.addEventListener('change', () => {
    pautaActual = pautaDeValor(selPauta.value, pautaActual);
    pintarDetallePauta();
  });

  const input = document.getElementById('habito-nombre');
  input.addEventListener('input', () => { seleccion.nombre = input.value; refrescarPreview(); });

  editor.querySelectorAll('#habito-colores .color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      editor.querySelectorAll('#habito-colores .color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
      seleccion.color = dot.dataset.color;
      refrescarPreview();
    });
  });

  editor.querySelectorAll('.icon-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      editor.querySelectorAll('.icon-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      seleccion.icono = opt.dataset.key;
      refrescarPreview();
    });
  });

  document.getElementById('habito-cancelar').addEventListener('click', cerrarEditor);

  document.getElementById('habito-guardar').addEventListener('click', async () => {
    const limpio = seleccion.nombre.trim();
    if (!limpio) {
      toast('Ponle un nombre al hábito');
      input.focus();
      return;
    }
    const cuerpo = {
      name: limpio,
      icon: seleccion.icono,
      color: seleccion.color,
      // Sin `dificultad`: la pone el servidor a partir de la pauta.
      pauta: pautaActual,
      recordatorio: campoHora.value,
      publico: document.getElementById('habito-publico').checked,
    };
    try {
      if (habit) {
        const res = await editarHabito(habit.id, cuerpo);
        const idx = state.data.habits.findIndex((h) => h.id === habit.id);
        state.data.habits[idx] = res.habit;
        toast('Hábito actualizado');
      } else {
        const res = await crearHabito(cuerpo);
        state.data.habits.push(res.habit);
        toast(`«${res.habit.name}» añadido`);
        confeti(window.innerWidth / 2, 140, { color: seleccion.color });
      }
    } catch (err) {
      toast(`No se pudo guardar: ${err.message}`);
      return;
    }
    cargarLiga();
    cerrarEditor();
    renderTodo();
  });

  input.focus();
}

function cerrarEditor() {
  state.editandoHabito = null;
  const editor = document.getElementById('habito-editor');
  editor.hidden = true;
  editor.innerHTML = '';
}

// ---------------------------------------------------------------- utils -----

function escapeHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Rellena los <span data-icon="..."> estáticos del HTML.
function pintarIconosEstaticos() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const size = Number(el.dataset.iconSize) || 18;
    el.innerHTML = iconSVG(el.dataset.icon, size);
  });
}

// Los dos saldos del header. Se repintan con todo lo demás porque cualquier
// cosa que hagas en la app (marcar un hábito, cerrar una tarea) los mueve.
function renderCartera() {
  const ld = calcularLuckyDollars();
  const cc = calcularChambaCoins();

  const ponerSaldo = (id, valor, titulo) => {
    const el = document.getElementById(id);
    const previo = Number(el.dataset.valor || 0);
    el.textContent = moneda(valor);
    el.dataset.valor = valor;
    el.parentElement.title = titulo;
    // Un pulso solo cuando sube: confirma que el gesto pagó, sin robar foco.
    if (valor > previo && previo > 0 && !reducedMotion()) {
      el.parentElement.classList.remove('subiendo');
      void el.parentElement.offsetWidth;
      el.parentElement.classList.add('subiendo');
    }
  };

  ponerSaldo('saldo-ld-num', ld.total,
    `Lucky Dollars: ${moneda(ld.porHabitos)} de hábitos + ${moneda(ld.porLogros)} de logros`);
  ponerSaldo('saldo-cc-num', cc.total,
    `Chamba Coins: ${moneda(cc.porPasos)} de pasos + ${moneda(cc.porTareas)} de tareas cerradas + ${moneda(cc.aTiempo)} por puntualidad`);
}

function renderTodo({ animarNivel = false } = {}) {
  renderNivel({ animar: animarNivel });
  renderAmbiente();
  marcarDiaPerfecto();
  renderHoy();
  renderReto();
  renderHistorial();
  renderProgreso();
  renderWork();
  renderCasa();
  renderHabitos();
}

// --------------------------------------------------------------- eventos ----

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    const vista = document.getElementById(`view-${btn.dataset.view}`);
    vista.classList.add('active');
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });

    // Las cifras y las barras de Progreso se llenan al entrar: leerlas
    // creciendo hace que el avance se sienta, no solo se lea.
    if (btn.dataset.view === 'progreso') animarProgreso(vista);
  });
});

function animarProgreso(vista) {
  vista.classList.remove('animando');
  void vista.offsetWidth;
  vista.classList.add('animando');
  setTimeout(() => vista.classList.remove('animando'), 1200);
  if (reducedMotion()) return;
  vista.querySelectorAll('.tile-value').forEach((el) => contarHasta(el));
}

// Cuenta desde 0 hasta el valor que ya tiene escrito. Si no es un número
// (por ejemplo "Lun" en Mejor día), lo deja tal cual.
function contarHasta(el, duracion = 700) {
  const destino = Number(el.textContent);
  if (!Number.isFinite(destino) || destino === 0) return;
  const inicio = performance.now();
  const paso = (t) => {
    const avance = Math.min((t - inicio) / duracion, 1);
    const suave = 1 - (1 - avance) ** 3;
    el.textContent = Math.round(destino * suave);
    if (avance < 1) requestAnimationFrame(paso);
    else el.textContent = destino;
  };
  requestAnimationFrame(paso);
}

// Sombra bajo la barra superior solo cuando hay contenido por encima.
const topbar = document.querySelector('.topbar');
window.addEventListener('scroll', () => {
  topbar.classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

document.getElementById('level-chip').addEventListener('click', () => {
  document.querySelector('.tab[data-view="progreso"]').click();
});

document.getElementById('perfil-chip').addEventListener('click', async () => {
  // Se relee la lista antes de abrirla: puede que alguien haya entrado en la
  // casa desde otro dispositivo mientras esta pantalla estaba quieta.
  try { await cargarUsuarios(); } catch (e) { /* se muestra la lista que haya */ }
  mostrarSelector({ cambiando: true });
});

document.getElementById('mes-anterior').addEventListener('click', () => {
  state.historialMonth = new Date(state.historialMonth.getFullYear(), state.historialMonth.getMonth() - 1, 1);
  state.diaSeleccionado = null;
  renderHistorial();
});

document.getElementById('mes-siguiente').addEventListener('click', () => {
  state.historialMonth = new Date(state.historialMonth.getFullYear(), state.historialMonth.getMonth() + 1, 1);
  state.diaSeleccionado = null;
  renderHistorial();
});

document.querySelectorAll('#historial-modo .seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#historial-modo .seg').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.historialModo = btn.dataset.mode;
    renderHistorial();
  });
});

document.getElementById('nueva-nota-btn').addEventListener('click', async () => {
  // Una nota nueva no debe quedar escondida detrás de un filtro activo.
  state.notas.buscar = '';
  state.notas.tag = null;
  document.getElementById('notas-buscar').value = '';

  const nota = await createNote();
  renderNotas();
  const card = document.querySelector(`.nota-entry[data-id="${nota.id}"]`);
  if (card) {
    card.classList.add('recien-creada');
    card.querySelector('.nota-editor').focus();
    card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
});

document.getElementById('notas-buscar').addEventListener('input', debounce((e) => {
  state.notas.buscar = e.target.value;
  renderNotas();
}, 180));

document.getElementById('notas-orden').addEventListener('change', (e) => {
  state.notas.orden = e.target.value;
  renderNotas();
});

// Los desplegables de la barra de formato se cierran al hacer clic fuera o con Esc.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nt-panel')) cerrarPopovers();
  // El menú de la casilla se cierra igual: al pulsar fuera de él y del botón
  // que lo abrió (si no, el propio clic de apertura lo cerraría en el acto).
  if (!e.target.closest('.casa-menu, .casa-asignar')) cerrarMenuCasa();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cerrarPopovers();
    cerrarMenuCasa();
  }
});

// Al ir en position: fixed, el panel se quedaría flotando si la página se mueve.
window.addEventListener('scroll', () => { cerrarPopovers(); cerrarMenuCasa(); }, { passive: true });
window.addEventListener('resize', () => { cerrarPopovers(); cerrarMenuCasa(); });

document.getElementById('nuevo-habito-btn').addEventListener('click', () => abrirEditor('nuevo'));

document.getElementById('campana').addEventListener('click', (e) => {
  e.stopPropagation();
  // Abrir la campana ES pedir los avisos. Si lo único que falta es el permiso
  // se pide aquí mismo, sin esperar a que abra el panel: el navegador solo
  // atiende la pregunta mientras el clic sigue siendo reciente, y mandar a
  // alguien a buscar un segundo botón pierde a la mitad por el camino.
  if (estadoPush.paso === 'sin-permiso' || estadoPush.paso === 'sin-suscripcion') {
    activarNotificaciones();
  }
  alternarAvisos();
});

document.getElementById('avisos-permiso').addEventListener('click', (e) => {
  e.stopPropagation();
  activarNotificaciones();
});

document.getElementById('avisos-probar').addEventListener('click', (e) => {
  e.stopPropagation();
  probarNotificacion();
});

// Cerrar tocando fuera, como el menú de las casillas de la casa.
document.addEventListener('click', (e) => {
  const caja = document.getElementById('avisos');
  if (caja.hidden || e.target.closest('#avisos, #campana')) return;
  caja.hidden = true;
  document.getElementById('campana').setAttribute('aria-expanded', 'false');
});

document.getElementById('reto-nuevo-btn').addEventListener('click', () => {
  const abierto = !document.getElementById('reto-editor').hidden;
  pintarEditorReto(!abierto);
});

// ---- Casa ----

document.getElementById('nueva-persona-btn').addEventListener('click', () => abrirEditorPersona('nueva'));
document.getElementById('nueva-tarea-casa-btn').addEventListener('click', () => abrirEditorTareaCasa('nueva'));

// ---- Work Mode ----

document.getElementById('nueva-tarea-btn').addEventListener('click', () => abrirEditorTarea('nueva'));

document.querySelectorAll('#work-filtros .seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#work-filtros .seg').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.work.filtro = btn.dataset.filtro;
    renderWorkLista();
  });
});

document.getElementById('work-buscar').addEventListener('input', debounce((e) => {
  state.work.buscar = e.target.value;
  renderWorkLista();
}, 180));

// La rueda es un espejo del historial, no un control: marcar se hace en las
// tarjetas de Hoy o en el detalle del Historial.
document.getElementById('reto-reiniciar').addEventListener('click', async (e) => {
  const volverAuto = e.currentTarget.dataset.modo === 'auto';
  const hoy = todayISO();
  if (!volverAuto && retoInicio() === hoy) {
    toast('El reto ya cuenta desde hoy');
    return;
  }
  try {
    const res = await api('/api/challenge', jsonBody('POST', { startDate: volverAuto ? '' : hoy }));
    state.data.challenge = res.challenge;
  } catch (err) {
    toast(`No se pudo cambiar el inicio: ${err.message}`, 'error');
    return;
  }
  if (volverAuto) {
    toast('El reto vuelve a empezar en tu primer día perfecto', 'ok');
  } else {
    toast('Reto reiniciado: el día 1 es hoy', 'ok');
    confeti(window.innerWidth / 2, 180);
  }
  renderReto();
});

// ------------------------------------------------------------------ init ----

(async function init() {
  pintarIconosEstaticos();

  // Emblemas puestos a mano en public/rangos/. Si no hay carpeta o no hay
  // archivos, RANGOS_PROPIOS se queda vacío y se usan los dibujados.
  try {
    const res = await fetch('/api/rangos').then((r) => r.json());
    for (const [clave, url] of Object.entries(res.rangos || {})) RANGOS_PROPIOS.set(clave, url);
  } catch (e) { /* sin emblemas propios, que es lo normal */ }

  try {
    await cargarUsuarios();
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<p class="empty-state">No se pudo hablar con el servidor: ${escapeHTML(err.message)}</p>`;
    return;
  }

  // Este dispositivo puede recordar a quién abrió la última vez. Si ese perfil
  // ya no existe —lo borraron desde otra pantalla— se vuelve a preguntar.
  const recordado = state.usuarios.find((u) => u.id === perfilRecordado());
  if (!recordado) {
    olvidarPerfil();
    mostrarSelector();
    return;
  }

  // Con el vale de la última vez, un perfil con contraseña no la vuelve a
  // pedir en cada recarga. Si ya no vale, la primera petición manda a la
  // puerta sola —y con el candado abierto en el perfil correcto—, así que
  // aquí solo queda cubrir el caso de que falle por cualquier otra cosa.
  state.usuario = recordado;
  try {
    await entrarComo(recordado, { vale: sesionRecordada() });
  } catch (err) {
    if (document.getElementById('selector').hidden) {
      toast(`No se pudo abrir el perfil: ${err.message}`, 'error');
      mostrarSelector();
    }
  }
})();
