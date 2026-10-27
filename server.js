const express = require('express');
const https = require('https');
const http = require('http');
const net = require('net');
const webpush = require('web-push');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || 4173;
// Las notificaciones del navegador y los service workers exigen contexto
// seguro, y http://192.168.x no lo es por mucho que sea tu propia casa; sin
// certificado, en el móvil de otro no hay forma de que salga un aviso con la
// app cerrada. Por eso el puerto de siempre habla HTTPS. Este de al lado es un
// segundo timbre que solo redirige, para quien tecleó la dirección con el
// puerto equivocado; el favorito viejo lo resuelve el propio PORT.
const PORT_HTTP = Number(process.env.PORT_HTTP || Number(PORT) + 1);
const CERT_DIR = path.join(__dirname, 'cert');
const CERT_CRT = path.join(CERT_DIR, 'metanoia.crt');
const CERT_KEY = path.join(CERT_DIR, 'metanoia.key');
// La autoridad que firma el de arriba. Es pública —dentro no va ninguna llave,
// solo la firma— y cada aparato la instala una vez para que el navegador se
// crea la app. El porqué está contado largo en crear-cert.js.
const CA_CRT = path.join(CERT_DIR, 'metanoia-ca.crt');
// Las llaves VAPID identifican a este servidor ante el servicio de push del
// navegador. Se generan una vez y se guardan: si cambian, todas las
// suscripciones que haya por ahí dejan de valer.
const VAPID_FILE = path.join(CERT_DIR, 'vapid.json');
const VAULT_ROOT = process.env.OBSIDIAN_VAULT || path.join(os.homedir(), 'Documents', 'Obsidian Vault');
// Dónde viven los datos. Se puede apuntar a otra carpeta con METANOIA_DATOS,
// que es lo que usan las pruebas: nada que se ejecute a la ligera debería
// poder escribir en el vault de verdad.
const HABITS_DIR = process.env.METANOIA_DATOS || path.join(VAULT_ROOT, 'Habits');

// ---- El cuaderno de a bordo ----
// El servidor arranca oculto desde el lanzador: su consola no la lee nadie
// nunca. Los avisos que se daba a sí mismo —«Push fallido» el primero— se los
// llevaba el viento, y por eso una avería podía estar meses a la vista sin que
// nadie la viera. Ahora también van a un archivo con la hora delante.
//
// Se escribe siempre, haya consola o no. La primera versión de esto se saltaba
// el archivo cuando había consola, y resultó que arrancado en oculto Windows
// sí le da una —que nadie ve nunca—, con lo que el cuaderno no se escribía
// justo en el único caso para el que existía.
//
// El nombre lleva el puerto: así un servidor de pruebas no se mezcla con el de
// casa y cada uno cuenta su propia historia.
const LOG_FILE = path.join(__dirname, `metanoia-${PORT}.log`);
(function abrirCuaderno() {
  let cuaderno;
  try {
    // Un log que crece para siempre acaba siendo el problema en vez de la
    // ayuda. Al pasar de dos megas se empieza de cero: aquí interesa lo de hoy.
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.truncateSync(LOG_FILE, 0); } catch (e) { /* no había */ }
    cuaderno = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (e) {
    return;   // sin cuaderno se sigue funcionando igual: esto no es esencial
  }
  const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const enTexto = (x) => (typeof x === 'string' ? x : require('util').inspect(x, { depth: 3 }));
  for (const canal of ['log', 'warn', 'error']) {
    const original = console[canal].bind(console);
    console[canal] = (...cosas) => {
      original(...cosas);
      try { cuaderno.write(`${ahora()}  ${cosas.map(enTexto).join(' ')}\n`); } catch (e) { /* disco lleno */ }
    };
  }
}());
const DATA_FILE = path.join(HABITS_DIR, 'habit-log.json');
const V1_BACKUP = path.join(HABITS_DIR, 'habit-log.v1-backup.json');
const V2_BACKUP = path.join(HABITS_DIR, 'habit-log.v2-backup.json');

// Paleta de acentos. El hábito guarda el hex directo para que el frontend
// pueda pintarlo sin tener que conocer la lista.
const PALETTE = [
  '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24',
  '#fb7185', '#2dd4bf', '#818cf8', '#f97316', '#4ade80',
];

const DEFAULT_HABITS = [
  { name: 'Meditar', icon: 'meditar' },
  { name: 'Escribir', icon: 'escribir' },
  { name: 'Crear', icon: 'crear' },
  { name: 'Entrenar', icon: 'entrenar' },
  { name: 'Organizar', icon: 'organizar' },
  { name: 'Programar', icon: 'programar' },
  { name: 'Grabar', icon: 'grabar' },
];

const DEFAULT_NOTE_STYLE = {
  title: '',          // título de la nota, centrado sobre el cuerpo
  font: 'sans',
  size: 'md',
  color: '#e7e9ec',   // color del texto
  bg: '',             // color de la nota; '' = sin tinte
  tags: [],
  pinned: false,      // nota destacada
  format: 'html',
  layout: 'flujo',    // 'flujo' = texto corrido | 'lienzo' = piezas colocadas
  items: [],          // piezas del lienzo (texto e imágenes con su posición)
};

const MAX_NOTE_TITLE = 120;
const NOTE_LAYOUTS = ['flujo', 'lienzo'];

// La fuente y el tamaño de una nota son claves —«sans», «bebas», «md»— y el
// cliente las mete dentro de un atributo class. El catálogo de fuentes vive
// allí y no aquí a propósito: duplicarlo obligaría a tocar dos archivos cada
// vez que se añade una. Lo que sí se exige aquí es que tengan forma de clave,
// que es lo único que hace falta para que no puedan salirse del atributo.
const CLAVE_ESTILO = /^[a-z0-9-]{1,24}$/;
const claveDeEstilo = (valor, porDefecto) =>
  (typeof valor === 'string' && CLAVE_ESTILO.test(valor) ? valor : porDefecto);
const MAX_NOTE_ITEMS = 80;

// Las imágenes pegadas se guardan como archivo en el vault, no en base64
// dentro del JSON: una sola captura de pantalla en base64 pesa más que todo el
// historial de hábitos junto y haría el archivo de datos inmanejable.
const UPLOADS_DIR = path.join(HABITS_DIR, 'adjuntos');
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
// Margen que se le da a un adjunto recién subido antes de considerarlo perdido.
const GRACIA_ADJUNTOS_MS = 5 * 60 * 1000;
const TIPOS_IMAGEN = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const DEFAULT_ICON = 'meta';

const MAX_TAGS = 12;
const MAX_TAG_LEN = 24;
const MAX_NOTE_LEN = 200000;
const HEX = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Work Mode ----
// Tareas de trabajo. A diferencia de los hábitos (que se repiten a diario), una
// tarea es un proceso con principio y fin, y guarda tres cosas a la vez:
//   seguir     -> estado, prioridad, fecha límite y marcas de tiempo
//   guiar      -> `steps`, el proceso descompuesto en pasos que se van marcando
//   documentar -> `log`, la bitácora de lo que fue pasando
// La bitácora se escribe sola en los cambios importantes (entradas `auto`) y a
// mano cuando hace falta contar algo (entradas `nota`). Que las automáticas las
// genere el servidor y no el cliente es lo que garantiza que el registro esté
// completo aunque la petición venga de otro sitio.
const WORK_STATES = ['pendiente', 'en-curso', 'bloqueada', 'hecha'];
const WORK_PRIORITIES = ['alta', 'media', 'baja'];
const WORK_STATE_LABEL = {
  'pendiente': 'pendiente',
  'en-curso': 'en curso',
  'bloqueada': 'bloqueada',
  'hecha': 'hecha',
};

const MAX_WORK_TITLE = 120;
const MAX_WORK_DETAIL = 4000;
const MAX_WORK_AREA = 40;
const MAX_STEP_TEXT = 200;
const MAX_STEPS = 60;
const MAX_LOG_TEXT = 2000;
const MAX_LOG_ENTRIES = 400;
const MAX_WORK_TASKS = 500;

// ---- Casa ----
// La tabla de la casa es un plan semanal, no un historial: las filas son las
// tareas, las columnas los siete días de lunes a domingo, y en cada celda va
// quién se encarga. Lo que ya se hizo vive aparte, en `done`, indexado por
// fecha: el plan se repite cada semana, lo hecho no.
const CASA_DIAS = 7;
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
// Cada cuánto vuelve una tarea. La tabla son siete columnas porque casi todo lo
// de una casa se repite cada semana; lo que toca una vez al mes —el baño a
// fondo— no cabe ahí. En vez de una tabla distinta, la casilla dice el día y
// esto dice si vuelve cada semana o solo la primera de cada mes.
const FRECUENCIAS_CASA = ['semana', 'mes'];
const MAX_PERSONAS = 12;
const MAX_TAREAS_CASA = 60;
const MAX_PERSONA_NOMBRE = 24;
const MAX_TAREA_CASA = 60;
const MAX_TAREA_CASA_NOTA = 200;
const MAX_ICONO = 24;
// Hora del día en 24 h. Vacía significa «sin hora fija».
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---- Contraseñas ----
// Poner contraseña es voluntario: un perfil sin ella se abre como siempre, que
// es lo razonable en una casa. Quien quiera cerrar la suya, la cierra.
// La contraseña no se guarda nunca: se guarda un scrypt con sal propia, lento
// a propósito para que probar contraseñas a mano no lleve a ningún lado.
const MIN_CLAVE = 4;
const MAX_CLAVE = 72;
// La sesión vive en el archivo de datos y no en memoria: si no, reiniciar el
// servidor obligaría a toda la casa a volver a escribir su contraseña.
const SESION_DIAS = 60;
const SESION_MS = SESION_DIAS * 24 * 60 * 60 * 1000;
// Freno a la fuerza bruta desde la red de casa: cinco fallos y a esperar.
const INTENTOS_MAX = 5;
const CASTIGO_MS = 60 * 1000;

// ---- Competición ----
// Un hábito privado es invisible para la casa y no puntúa. Es lo que permite
// llevar en la misma app «Correr» —que se compite— y algo que no le importa a
// nadie más, sin tener que elegir entre competir y tener intimidad.
//
// La dificultad NO se declara: sale de la pauta. Preguntar las dos cosas por
// separado era pedir dos veces lo mismo —y dejar que se contradijeran: nada
// impedía poner «una vez por semana · Muy difícil» y cobrar por un compromiso
// que no se había hecho. Lo único que se promete de verdad es cuántas veces por
// semana, y eso es exactamente lo duro que es sostenerlo.
//
// Aquí la dificultad deja de ser una declaración y pasa a ser una consecuencia,
// que es lo que la vuelve un precio pactado también en un reto: quien reta fija
// la pauta, y la dificultad viene con ella para todos igual.
const PUNTOS_POR_DIFICULTAD = [0, 10, 20, 35, 55, 80];
// Veces por semana (1..7) → dificultad (1..5). Siete días es el compromiso más
// caro que se puede hacer y una vez por semana el más barato; en medio la
// escala sube de dos en dos porque de 3 a 4 veces se nota menos que de 6 a 7.
const DIFICULTAD_POR_VECES = [0, 1, 2, 3, 3, 4, 4, 5];
const PAUTAS = ['diario', 'dias', 'semana'];

// ---- Rangos ----
// Ocho ligas de tres divisiones más la cima, y 100 de progreso dentro de cada
// división: 2400 para llegar arriba. La gracia de una escalera así no es subir,
// es que se pueda bajar; un contador que solo crece deja de significar nada a
// las tres semanas. Por eso fallar resta, y resta más arriba que abajo.
// La misma escalera de Valorant: ocho ligas de tres divisiones más la cima.
// Los nombres y la estructura son suyos a propósito —es lo que se pidió— y
// además son buenos: Ascendente e Inmortal son justo los dos escalones que le
// faltaban a la de seis, donde se pasaba de Diamante a la cima de golpe.
const RANGOS = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Ascendente', 'Inmortal', 'Radiante'];
const DIVISIONES = ['I', 'II', 'III'];
const RR_POR_DIVISION = 100;
const RR_CIMA = (RANGOS.length - 1) * DIVISIONES.length * RR_POR_DIVISION;   // 2400
const RR_TECHO = RR_CIMA + RR_POR_DIVISION;
// Los días seguidos fallados a partir de los cuales esto ya no es un mal día
// sino un hábito abandonado, y lo que cuesta cada semana de abandono.
const DIAS_ABANDONO = 7;

// ---- Retos ----
// Un reto es lo que hace que dos personas compitan en LO MISMO. Los hábitos son
// de cada quien y se llaman como quieran: el «Correr» de uno y el «Salir a
// correr» de otro no son el mismo hábito, y emparejarlos por el nombre se rompe
// el primer día. Así que el objeto compartido es el reto, no el hábito: el reto
// tiene el nombre, la pauta y la dificultad, y siembra un hábito enlazado en el
// perfil de cada participante. Marcar ese hábito puntúa en el reto.
//
// La dificultad la fija quien reta y la aceptan los demás al entrar. Eso es lo
// que convierte una cifra declarada en un precio pactado, y es la razón por la
// que aquí sí se puede confiar en ella.
const MAX_RETOS = 40;

// ---- Avisos ----
// Lo que pasa mientras no estás mirando. Se guardan por perfil porque son de
// cada quien: que te reten es tuyo, que alguien barra la cocina es de la casa.
// Se recortan a los últimos MAX_AVISOS: esto es una bandeja, no un historial.
const MAX_AVISOS = 40;
const MAX_AVISO_TEXTO = 160;
const ESTADOS_RETO = ['invitado', 'dentro', 'fuera'];
const CASTIGO_ABANDONO = RR_POR_DIVISION;
const MAX_VECES_SEMANA = 7;

// Reto: N días perfectos a partir del primer día perfecto. Es solo una ventana
// sobre el log que ya existe, así que reiniciarlo no borra nada.
const CHALLENGE_DAYS = 30;

// Las notas se guardan como HTML (negritas, resaltados...). Se escribe solo
// desde la app, pero el contenido pegado puede traer cualquier cosa, así que
// antes de guardarlo se filtra contra una lista blanca de etiquetas y clases.
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'br', 'div', 'p', 'span',
  'ul', 'ol', 'li', 'blockquote', 'code',
]);
const ALLOWED_CLASS = /^hl(-[a-z]+)?$/;

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sanitizeNoteHTML(html) {
  if (typeof html !== 'string') return '';
  const sinBloques = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|template|link|meta)\b[^>]*>/gi, '');

  const filtrado = sinBloques.replace(/<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (todo, cierre, tag, attrs) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';   // se borra la etiqueta, se conserva el texto
    if (cierre) return `</${name}>`;
    const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs) || /class\s*=\s*'([^']*)'/i.exec(attrs);
    const clases = cls ? cls[1].split(/\s+/).filter((c) => ALLOWED_CLASS.test(c)) : [];
    return clases.length ? `<${name} class="${clases.join(' ')}">` : `<${name}>`;
  });

  return filtrado.slice(0, MAX_NOTE_LEN);
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  const vistas = new Set();
  const limpias = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/\s+/g, ' ').replace(/^#/, '').slice(0, MAX_TAG_LEN);
    if (!tag) continue;
    const clave = tag.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    limpias.push(tag);
    if (limpias.length >= MAX_TAGS) break;
  }
  return limpias;
}

function hexOrEmpty(value, fallback) {
  if (typeof value !== 'string') return fallback;
  if (value === '') return '';
  return HEX.test(value) ? value : fallback;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

// "Comer bien" -> "comer-bien". Sirve como id legible y estable.
function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'habito';
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function buildDefaultHabits() {
  const taken = new Set();
  return DEFAULT_HABITS.map((h, i) => {
    const id = uniqueId(slugify(h.name), taken);
    taken.add(id);
    return { id, name: h.name, icon: h.icon, color: PALETTE[i % PALETTE.length], order: i };
  });
}

function ensureDataFile() {
  // Con una carpeta propia no hay vault que comprobar: se crea y ya está.
  if (!process.env.METANOIA_DATOS && !fs.existsSync(VAULT_ROOT)) {
    throw new Error(
      `No se encontró el vault de Obsidian en: ${VAULT_ROOT}. Verifica que la ruta sea correcta antes de arrancar el servidor.`
    );
  }
  if (!fs.existsSync(HABITS_DIR)) {
    fs.mkdirSync(HABITS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    // Sin perfiles: la primera persona que abra la app crea el suyo. Es lo
    // que hace que una instalación nueva no tenga que adivinar de quién es.
    const initial = {
      version: 3,
      users: [],
      profiles: {},
      sesiones: {},
      retos: [],
      casa: { chores: [], done: {} },
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

// Migra el formato viejo (una nota de texto por fecha, dentro de log[fecha].note)
// al nuevo formato (notas independientes en su propio arreglo). Es idempotente:
// una vez migrado, log[fecha] ya no tiene la clave `note` y no vuelve a correr.
function migrateLegacyNotes(data) {
  // En v3 no hay notas en la raíz del archivo, sino dentro de cada perfil.
  if (data.version === 3) return false;
  if (!Array.isArray(data.notes)) {
    data.notes = [];
  }
  let migrated = false;
  for (const date of Object.keys(data.log)) {
    const entry = data.log[date];
    if (Object.prototype.hasOwnProperty.call(entry, 'note')) {
      if (entry.note && entry.note.trim() !== '') {
        data.notes.push({
          id: newId(),
          content: plainToHTML(entry.note),
          createdAt: `${date}T00:00:00.000Z`,
          updatedAt: `${date}T00:00:00.000Z`,
          ...DEFAULT_NOTE_STYLE,
        });
      }
      delete entry.note;
      migrated = true;
    }
  }
  return migrated;
}

// v1: habits era un arreglo de nombres y log[fecha].done guardaba esos mismos
// nombres. v2: habits son objetos con id/icono/color y el log guarda ids, para
// que renombrar un hábito no borre su historial. Se detecta por el tipo del
// primer elemento, así que correr esto dos veces no hace nada la segunda.
function migrateHabitsToV2(data) {
  if (data.version === 3) return false;
  const isLegacy = Array.isArray(data.habits) && data.habits.some((h) => typeof h === 'string');
  if (!isLegacy) {
    if (!data.version) data.version = 2;
    return false;
  }

  // Antes de reescribir, deja una copia del formato viejo por si algo sale mal.
  if (!fs.existsSync(V1_BACKUP)) {
    fs.writeFileSync(V1_BACKUP, JSON.stringify(data, null, 2), 'utf8');
  }

  const nameToId = new Map();
  const taken = new Set();
  data.habits = data.habits.map((name, i) => {
    const id = uniqueId(slugify(name), taken);
    taken.add(id);
    nameToId.set(name, id);
    const known = DEFAULT_HABITS.find((d) => d.name === name);
    return {
      id,
      name,
      icon: known ? known.icon : DEFAULT_ICON,
      color: PALETTE[i % PALETTE.length],
      order: i,
    };
  });

  for (const date of Object.keys(data.log)) {
    const entry = data.log[date];
    entry.done = (entry.done || [])
      .map((name) => nameToId.get(name) || slugify(name))
      .filter((id, i, arr) => arr.indexOf(id) === i);
  }

  data.version = 2;
  return true;
}

// ---- Perfiles ----
// Cada persona de la casa tiene su propio juego de datos: hábitos, historial,
// notas, trabajo y reto. Lo único que se comparte es `casa`. Los logros, el
// nivel y las monedas no se guardan: salen de estos datos, así que separarlos
// aquí los separa en todas partes.

// Vacío a propósito. Los siete hábitos por defecto eran buena idea cuando la
// app la abría una sola persona y había que enseñarle la forma; con una casa
// dentro, lo que hacen es dar por hecho que a quien acaba de entrar le importan
// los mismos siete. Que los cree quien los vaya a marcar.
function perfilNuevo() {
  return {
    avisos: [],
    push: [],
    habits: [],
    log: {},
    notes: [],
    work: [],
    challenge: { startDate: null, days: CHALLENGE_DAYS, auto: true },
  };
}

// v2: un solo juego de datos en la raíz del archivo y las personas de la casa
// como una lista dentro de `casa`. v3: cada persona es un perfil con lo suyo,
// y la casa es lo único de todos. Las personas que ya existían se convierten en
// perfiles conservando su id, para que las casillas ya repartidas de la tabla
// sigan apuntando a quien apuntaban.
function migrateToV3(data) {
  if (data.version === 3) return false;

  // El archivo cambia de forma entero: antes de tocarlo se deja una copia.
  if (!fs.existsSync(V2_BACKUP)) {
    fs.writeFileSync(V2_BACKUP, JSON.stringify(data, null, 2), 'utf8');
  }

  const casa = data.casa && typeof data.casa === 'object' ? data.casa : {};
  const users = (Array.isArray(casa.people) ? casa.people : []).map((p, i) => ({
    id: typeof p.id === 'string' && p.id ? p.id : newId(),
    name: cleanText(p.name, MAX_PERSONA_NOMBRE) || 'Sin nombre',
    color: hexOrEmpty(p.color, '') || PALETTE[i % PALETTE.length],
    order: i,
  }));

  // Todo lo que había en la raíz era de una sola persona. Si ya había gente en
  // la casa se lo queda la primera, que es quien montó la tabla; si no había
  // nadie se crea un perfil, porque estos datos no pueden quedar sin dueño.
  const legado = {
    habits: Array.isArray(data.habits) ? data.habits : [],
    log: data.log && typeof data.log === 'object' ? data.log : {},
    notes: Array.isArray(data.notes) ? data.notes : [],
    work: Array.isArray(data.work) ? data.work : [],
    challenge: data.challenge || { startDate: null, days: CHALLENGE_DAYS, auto: true },
  };
  if (users.length === 0) {
    users.push({ id: newId(), name: 'Yo', color: PALETTE[0], order: 0 });
  }

  const profiles = {};
  users.forEach((u, i) => { profiles[u.id] = i === 0 ? legado : perfilNuevo(); });

  data.version = 3;
  data.users = users;
  data.profiles = profiles;
  data.casa = {
    chores: Array.isArray(casa.chores) ? casa.chores : [],
    done: casa.done && typeof casa.done === 'object' ? casa.done : {},
  };
  delete data.habits;
  delete data.log;
  delete data.notes;
  delete data.work;
  delete data.challenge;
  return true;
}

function plainToHTML(text) {
  return escapeHTML(text).replace(/\r?\n/g, '<br>');
}

// ---- Work Mode: helpers ----

// Los campos de las tareas son texto plano (el cliente los escapa al pintarlos),
// así que aquí basta con recortar. Nada de HTML: es una superficie menos.
function cleanText(value, max, { fallback = '' } = {}) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function isoDateOrEmpty(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  if (value === '') return '';
  return ISO_DATE.test(value) ? value : fallback;
}

// Añade una entrada a la bitácora. `auto` marca las que escribe el sistema, para
// que la interfaz pueda distinguirlas de lo que escribió una persona.
function pushLog(task, text, kind = 'auto') {
  if (!Array.isArray(task.log)) task.log = [];
  task.log.push({ id: newId(), at: nowISO(), kind, text: String(text).slice(0, MAX_LOG_TEXT) });
  // Se recorta por el principio: lo reciente es lo que importa para retomar.
  if (task.log.length > MAX_LOG_ENTRIES) {
    task.log.splice(0, task.log.length - MAX_LOG_ENTRIES);
  }
}

function normalizeStep(step) {
  return {
    id: typeof step.id === 'string' && step.id ? step.id : newId(),
    text: cleanText(step.text, MAX_STEP_TEXT),
    done: step.done === true,
    doneAt: typeof step.doneAt === 'string' ? step.doneAt : null,
  };
}

function normalizeWorkTask(task) {
  const estado = oneOf(task.status, WORK_STATES, 'pendiente');
  return {
    id: typeof task.id === 'string' && task.id ? task.id : newId(),
    title: cleanText(task.title, MAX_WORK_TITLE) || 'Sin título',
    detail: cleanText(task.detail, MAX_WORK_DETAIL),
    area: cleanText(task.area, MAX_WORK_AREA),
    status: estado,
    priority: oneOf(task.priority, WORK_PRIORITIES, 'media'),
    due: isoDateOrEmpty(task.due),
    steps: (Array.isArray(task.steps) ? task.steps : []).slice(0, MAX_STEPS).map(normalizeStep),
    log: (Array.isArray(task.log) ? task.log : []).slice(-MAX_LOG_ENTRIES).map((e) => ({
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      at: typeof e.at === 'string' ? e.at : nowISO(),
      kind: e.kind === 'nota' ? 'nota' : 'auto',
      text: cleanText(e.text, MAX_LOG_TEXT),
    })),
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : nowISO(),
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : nowISO(),
    startedAt: typeof task.startedAt === 'string' ? task.startedAt : null,
    doneAt: typeof task.doneAt === 'string' ? task.doneAt : null,
    order: Number.isFinite(task.order) ? task.order : 0,
  };
}

// Devuelve la tarea o responde 404. Centralizado porque lo repiten seis rutas.
// Busca en el perfil de quien pide: las tareas de trabajo son de cada quien.
function findTask(perfil, id, res) {
  const task = perfil.work.find((t) => t.id === id);
  if (!task) {
    res.status(404).json({ error: `Tarea no encontrada: ${id}` });
    return null;
  }
  return task;
}

// Rellena los campos que las notas viejas no tenían (color de nota, etiquetas,
// destacada) y convierte a HTML las que se guardaron como texto plano. Devuelve
// true solo si tocó algo, para no reescribir el archivo en cada lectura.
function normalizeNote(note) {
  let changed = false;
  const set = (clave, valor) => {
    if (note[clave] !== valor) { note[clave] = valor; changed = true; }
  };

  if (note.format !== 'html') {
    note.content = plainToHTML(typeof note.content === 'string' ? note.content : '');
    note.format = 'html';
    changed = true;
  } else if (typeof note.content !== 'string') {
    set('content', '');
  }

  set('title', cleanText(note.title, MAX_NOTE_TITLE));
  set('layout', NOTE_LAYOUTS.includes(note.layout) ? note.layout : 'flujo');

  const items = normalizeNoteItems(note.items);
  if (!Array.isArray(note.items) || JSON.stringify(items) !== JSON.stringify(note.items)) {
    note.items = items;
    changed = true;
  }

  set('font', claveDeEstilo(note.font, DEFAULT_NOTE_STYLE.font));
  set('size', claveDeEstilo(note.size, DEFAULT_NOTE_STYLE.size));
  set('color', hexOrEmpty(note.color, DEFAULT_NOTE_STYLE.color) || DEFAULT_NOTE_STYLE.color);
  set('bg', hexOrEmpty(note.bg, ''));
  set('pinned', note.pinned === true);

  const tags = cleanTags(note.tags);
  if (!Array.isArray(note.tags) || tags.join('\u0000') !== note.tags.join('\u0000')) {
    note.tags = tags;
    changed = true;
  }
  return changed;
}

// Piezas del lienzo. La posición va en porcentaje del ancho de la nota y no en
// píxeles: así una nota colocada en una pantalla ancha no se descoloca al
// abrirla en uno estrecho.
function normalizeNoteItems(items) {
  if (!Array.isArray(items)) return [];
  const rango = (v, min, max, porDefecto) =>
    (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto);

  return items.slice(0, MAX_NOTE_ITEMS).map((it) => {
    const kind = it.kind === 'imagen' ? 'imagen' : 'texto';
    const w = rango(it.w, 5, 100, kind === 'imagen' ? 40 : 50);
    const base = {
      id: typeof it.id === 'string' && it.id ? it.id : newId(),
      kind,
      // La x se sujeta contra el borde derecho ya descontado el ancho: sujetarla
      // solo a 100 dejaba pasar una pieza colocada íntegramente fuera de la
      // nota, imposible de ver y por tanto imposible de recuperar arrastrando.
      x: Math.min(100 - w, rango(it.x, 0, 100, 10)),
      y: rango(it.y, 0, 20000, 20),   // y en px: la nota crece hacia abajo
      w,
    };
    return kind === 'imagen'
      ? { ...base, src: typeof it.src === 'string' ? it.src.slice(0, 300) : '' }
      : { ...base, content: sanitizeNoteHTML(it.content) };
  }).filter((it) => (it.kind === 'imagen' ? it.src : true));
}

// Primer día en el que se completaron TODOS los hábitos. null si aún no hay
// ninguno: el reto no empieza hasta ese día.
// ---- Pauta: qué días toca un hábito ----
// No todo lo que se quiere sostener es diario. Sin esto, un hábito de tres
// veces por semana rompe la racha cuatro días de cada siete, que es la manera
// más rápida de que alguien deje de usar la app.
function normalizePauta(pauta) {
  const p = pauta && typeof pauta === 'object' ? pauta : {};
  const tipo = oneOf(p.tipo, PAUTAS, 'diario');
  if (tipo === 'dias') {
    const dias = (Array.isArray(p.dias) ? p.dias : [])
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d < 7)
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort((a, b) => a - b);
    // Sin ningún día marcado no es una pauta, es un hábito que no toca nunca.
    return dias.length ? { tipo, dias } : { tipo: 'diario' };
  }
  if (tipo === 'semana') {
    const veces = Math.min(Math.max(Math.round(Number(p.veces) || 0), 1), MAX_VECES_SEMANA);
    return { tipo, veces };
  }
  return { tipo: 'diario' };
}

// Lunes = 0, para que la semana empiece donde empieza la tabla de la casa.
function diaSemanaISO(iso) {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function lunesDe(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - diaSemanaISO(iso));
  return d.toISOString().slice(0, 10);
}

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function hechoEse(perfil, iso, habitId) {
  const entry = perfil.log[iso];
  return !!entry && (entry.done || []).includes(habitId);
}

// Cuántas veces por semana pide una pauta. Es la pieza que ata la dificultad
// con la frecuencia: sin ella, un hábito fácil hecho a diario da siete veces
// más que uno muy difícil de una vez por semana, y la escalera acaba midiendo
// quién tiene más casillas, no quién sostiene lo más duro.
function vecesPorSemana(pauta) {
  if (!pauta || pauta.tipo === 'diario') return 7;
  if (pauta.tipo === 'dias') return Math.max(1, pauta.dias.length);
  return Math.max(1, pauta.veces);
}

// Lo duro que es un hábito, deducido de lo que se prometió. Es la única puerta
// por la que se escribe `dificultad`: si alguien manda una en el cuerpo de la
// petición, se ignora. Un campo derivado que además se puede mandar a mano es
// un campo que tarde o temprano miente.
function dificultadDePauta(pauta) {
  return DIFICULTAD_POR_VECES[vecesPorSemana(pauta)] || 1;
}

// Lo que vale UNA marca de este hábito. Se reparte el peso semanal entre las
// veces que toca: dos hábitos de la misma dificultad valen lo mismo a la
// semana, se hagan siete días o dos. Lo que se compara es el compromiso.
function pesoDeMarca(habit) {
  return 7 / vecesPorSemana(habit.pauta);
}

// El peso completo solo cubre lo prometido. Poner «dos veces por semana» y
// luego hacerlo los siete días cobraría tres veces y media por cada uno de los
// siete: el atajo sería prometer poco. A partir del cupo, cada marca de más
// cuenta como una normal — nunca resta, pero tampoco multiplica.
function pesoDeEstaMarca(habit, hechasEstaSemana) {
  const peso = pesoDeMarca(habit);
  return hechasEstaSemana < vecesPorSemana(habit.pauta) ? peso : Math.min(peso, 1);
}

// ¿Tocaba este hábito ese día? Para «N veces por semana» la respuesta cambia
// según cómo vaya la semana: no molesta el lunes, pero el sábado, si vas corto,
// ya no queda margen y ese día sí toca. Un cupo semanal aprieta al final, que
// es exactamente como se vive.
function tocaEse(perfil, habit, iso) {
  const pauta = habit.pauta || { tipo: 'diario' };
  if (pauta.tipo === 'diario') return true;
  if (pauta.tipo === 'dias') return pauta.dias.includes(diaSemanaISO(iso));

  const lunes = lunesDe(iso);
  const hoy = diaSemanaISO(iso);
  let hechos = 0;
  for (let d = 0; d < hoy; d++) {
    if (hechoEse(perfil, sumarDias(lunes, d), habit.id)) hechos += 1;
  }
  const faltan = pauta.veces - hechos;
  const quedan = 7 - hoy;          // incluido hoy
  return faltan > 0 && faltan >= quedan;
}

// Los hábitos que cuentan para la casa: los públicos y nada más.
function habitosPublicos(perfil) {
  return perfil.habits.filter((h) => h.publico === true);
}

// Un día perfecto es haber hecho todo lo que ESE día tocaba. Un día en el que
// no tocaba nada no es perfecto ni fallado: no cuenta.
function diaPerfecto(perfil, iso, lista) {
  const tocaban = (lista || habitosPublicos(perfil)).filter((h) => tocaEse(perfil, h, iso));
  if (tocaban.length === 0) return null;
  return tocaban.every((h) => hechoEse(perfil, iso, h.id));
}

// Días perfectos seguidos hacia atrás. Que hoy siga pendiente no rompe nada:
// todavía queda día por delante, igual que en la racha de un hábito suelto.
function rachaPerfecta(perfil, hoyISO) {
  const lista = habitosPublicos(perfil);
  if (lista.length === 0) return 0;
  let cursor = hoyISO;
  if (diaPerfecto(perfil, cursor, lista) !== true) cursor = sumarDias(cursor, -1);
  let dias = 0;
  // 400 vueltas es más historial del que puede tener nadie aquí y quita de en
  // medio cualquier posibilidad de bucle infinito por una fecha rara.
  for (let i = 0; i < 400; i++) {
    const veredicto = diaPerfecto(perfil, cursor, lista);
    if (veredicto === false) break;
    if (veredicto === true) dias += 1;
    cursor = sumarDias(cursor, -1);
  }
  return dias;
}

// Lo que sube una marca. La dificultad manda, y la racha multiplica hasta el
// doble a los veinte días: sostener es más difícil que empezar, y la escalera
// tiene que decirlo.
function subidaRR(dificultad, racha, peso = 1) {
  return (2 + dificultad * 2) * peso * Math.min(1 + racha / 20, 2);
}

// Lo que baja un día fallado. El factor por liga es lo que impide que la parte
// de arriba de la tabla se llene de gente que subió una vez y se fue: en
// Diamante, un fallo cuesta más de lo que da un día bueno.
// Fallar un día de algo que solo toca dos veces por semana duele más que
// fallar uno de siete: es una porción mucho mayor de lo prometido.
function bajadaRR(dificultad, rr, peso = 1) {
  const liga = Math.min(Math.floor(rr / (DIVISIONES.length * RR_POR_DIVISION)), RANGOS.length - 1);
  return (6 + dificultad * 2) * peso * (0.5 + liga * 0.225);
}

function descomponerRR(rr) {
  const total = Math.max(0, Math.round(rr));
  if (total >= RR_CIMA) {
    return { rr: total, liga: RANGOS.length - 1, nombre: 'Radiante', division: '', enDivision: RR_POR_DIVISION };
  }
  const divisiones = Math.floor(total / RR_POR_DIVISION);
  return {
    rr: total,
    liga: Math.floor(divisiones / DIVISIONES.length),
    nombre: RANGOS[Math.floor(divisiones / DIVISIONES.length)],
    division: DIVISIONES[divisiones % DIVISIONES.length],
    enDivision: total % RR_POR_DIVISION,
  };
}

// El rango no se guarda: se recorre el historial cada vez. Es un pliegue sobre
// el log, así que da igual cuántas veces se calcule y arreglar la fórmula
// arregla el rango de todos hacia atrás. Un contador guardado te condena a
// arrastrar para siempre los bugs del día que lo escribiste.
//
// La escalera empieza el primer día que se marcó ese hábito, no antes: nadie
// nace debiendo. Y como borrar un hábito no borra su log, volver a crearlo
// recupera la cuenta entera —incluidos los días de ausencia—, que es lo que
// impide escaparse de una mala racha con el botón de borrar.
function rangoDe(perfil, habit, hoyISO) {
  const peso = pesoDeMarca(habit);
  const fechas = Object.keys(perfil.log).sort();
  const estreno = fechas.find((iso) => (perfil.log[iso].done || []).includes(habit.id));
  if (!estreno) {
    return {
      ...descomponerRR(0),
      estrenado: false,
      porMarca: Math.round((PUNTOS_POR_DIFICULTAD[habit.dificultad] || 0) * peso),
      vecesSemana: vecesPorSemana(habit.pauta),
      racha: 0,
      maxima: 0,
      constancia: 0,
      fallosSeguidos: 0,
      abandonado: false,
    };
  }

  let rr = 0;
  let racha = 0;
  let maxima = 0;
  let debidos = 0;
  let cumplidos = 0;
  let fallosSeguidos = 0;
  // Cuántas van esta semana, para saber si la marca de hoy es de las prometidas
  // o de propina. Se reinicia cada lunes, que es donde empieza la semana en
  // todo lo demás de la app.
  let hechasSemana = 0;
  for (let iso = estreno; iso <= hoyISO; iso = sumarDias(iso, 1)) {
    if (diaSemanaISO(iso) === 0) hechasSemana = 0;
    const hecho = hechoEse(perfil, iso, habit.id);
    // El día en curso no castiga: todavía queda día por delante. Sí premia, si
    // ya está hecho, porque eso ya no se lo quita nadie.
    if (iso === hoyISO && !hecho) break;
    // Un día hecho siempre suma, tocara o no. Sin esto, un hábito de tres veces
    // por semana solo puntuaba los días en los que el cupo ya apretaba —o sea,
    // al final de la semana— y hacerlo el lunes no valía nada: exactamente el
    // incentivo contrario al que tiene que dar una escalera.
    if (!hecho && !tocaEse(perfil, habit, iso)) continue;

    debidos += 1;
    if (hecho) {
      cumplidos += 1;
      racha += 1;
      maxima = Math.max(maxima, racha);
      fallosSeguidos = 0;
      rr = Math.min(RR_TECHO, rr + subidaRR(habit.dificultad, racha, pesoDeEstaMarca(habit, hechasSemana)));
      hechasSemana += 1;
    } else {
      racha = 0;
      fallosSeguidos += 1;
      rr -= bajadaRR(habit.dificultad, rr, peso);
      // Una semana entera sin aparecer ya no es un tropiezo. Cada semana de
      // ausencia se lleva una división completa por encima de lo del día.
      if (fallosSeguidos % DIAS_ABANDONO === 0) rr -= CASTIGO_ABANDONO;
      rr = Math.max(0, rr);
    }
  }

  return {
    ...descomponerRR(rr),
    estrenado: true,
    // Lo que vale una marca de este hábito con esta pauta. Va hacia fuera para
    // que la app pueda enseñarlo al elegir: la cifra es la mitad de la decisión.
    porMarca: Math.round((PUNTOS_POR_DIFICULTAD[habit.dificultad] || 0) * peso),
    vecesSemana: vecesPorSemana(habit.pauta),
    racha,
    maxima,
    // Constancia sobre los días que tocaban, no sobre el calendario: cumplir
    // tres de tres en una semana es el 100 %, aunque sean tres de siete días.
    constancia: debidos ? Math.round((cumplidos / debidos) * 100) : 0,
    fallosSeguidos,
    abandonado: fallosSeguidos >= DIAS_ABANDONO,
  };
}

// En un reto, Radiante es de uno solo. Sin plazas, la cima es solo un número
// que se alcanza con el tiempo y deja de significar nada en cuanto llegan dos;
// con plazas, el primero tiene algo que defender y el segundo algo que quitarle.
// Quien llega a 1800 sin ser primero se queda en el escalón de abajo.
function aplicarPlaza(rango, esPrimero) {
  if (esPrimero || rango.nombre !== 'Radiante') return rango;
  return { ...rango, ...descomponerRR(RR_CIMA - 1), rr: rango.rr, plazaOcupada: true };
}

// Puntos de la semana: cada marca de un hábito público vale según su dificultad.
function puntosDeLaSemana(perfil, hoyISO) {
  const lista = habitosPublicos(perfil);
  const porId = new Map(lista.map((h) => [h.id, h]));
  const lunes = lunesDe(hoyISO);
  const llevaHechas = new Map();
  let puntos = 0;
  for (let d = 0; d < 7; d++) {
    const iso = sumarDias(lunes, d);
    if (iso > hoyISO) break;
    for (const id of (perfil.log[iso] || {}).done || []) {
      const h = porId.get(id);
      if (!h) continue;
      const llevan = llevaHechas.get(id) || 0;
      puntos += Math.round((PUNTOS_POR_DIFICULTAD[h.dificultad] || 0) * pesoDeEstaMarca(h, llevan));
      llevaHechas.set(id, llevan + 1);
    }
  }
  return puntos;
}

function primerDiaPerfecto(perfil) {
  const ids = perfil.habits.map((h) => h.id);
  if (ids.length === 0) return null;
  const perfecto = Object.keys(perfil.log).sort().find((iso) => {
    const done = perfil.log[iso].done || [];
    return ids.every((id) => done.includes(id));
  });
  return perfecto || null;
}

// El reto arranca solo: el día 1 es el primer día perfecto del historial. Se
// recalcula en cada lectura salvo que se haya fijado a mano desde la app
// (auto: false), que es lo que hace el botón «Empezar hoy».
function ensureChallenge(perfil) {
  const actual = perfil.challenge || {};
  if (actual.auto === false && ISO_DATE.test(actual.startDate || '')) {
    if (actual.days === CHALLENGE_DAYS) return false;
    perfil.challenge = { startDate: actual.startDate, days: CHALLENGE_DAYS, auto: false };
    return true;
  }
  const inicio = primerDiaPerfecto(perfil);
  if (actual.auto === true && actual.startDate === inicio && actual.days === CHALLENGE_DAYS) return false;
  perfil.challenge = { startDate: inicio, days: CHALLENGE_DAYS, auto: true };
  return true;
}

// ---- Casa: helpers ----

function horaOVacia(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  if (value === '') return '';
  return HORA.test(value) ? value : fallback;
}

// Deja `data.casa` siempre con la misma forma y es el único sitio donde se
// limpian las referencias rotas: una casilla asignada a alguien que ya no vive
// aquí, o una marca de una tarea borrada. Como lo hace la normalización, las
// rutas pueden borrar sin ir detrás recogiendo los restos.
function normalizeCasa(data) {
  const casa = data.casa && typeof data.casa === 'object' ? data.casa : {};
  // Las personas de la casa son los perfiles: quien está en la tabla es quien
  // usa la app. Una sola lista, y por tanto un solo sitio donde puede fallar.
  const personas = new Set((data.users || []).map((u) => u.id));

  const chores = (Array.isArray(casa.chores) ? casa.chores : [])
    .slice(0, MAX_TAREAS_CASA)
    .map((c) => ({
      id: typeof c.id === 'string' && c.id ? c.id : newId(),
      name: cleanText(c.name, MAX_TAREA_CASA) || 'Sin nombre',
      icon: cleanText(c.icon, MAX_ICONO) || 'limpiar',
      time: horaOVacia(c.time),
      note: cleanText(c.note, MAX_TAREA_CASA_NOTA),
      cada: oneOf(c.cada, FRECUENCIAS_CASA, 'semana'),
      assign: Array.from({ length: CASA_DIAS }, (_, dia) => {
        const quien = Array.isArray(c.assign) ? c.assign[dia] : '';
        return personas.has(quien) ? quien : '';
      }),
      order: Number.isFinite(c.order) ? c.order : 0,
    }));
  chores.sort((a, b) => a.order - b.order);
  chores.forEach((c, i) => { c.order = i; });
  const tareas = new Set(chores.map((c) => c.id));

  const done = {};
  const marcado = casa.done && typeof casa.done === 'object' ? casa.done : {};
  for (const [fecha, lista] of Object.entries(marcado)) {
    if (!ISO_DATE.test(fecha) || !Array.isArray(lista)) continue;
    const limpia = [...new Set(lista.filter((id) => tareas.has(id)))];
    if (limpia.length > 0) done[fecha] = limpia;
  }

  data.casa = { chores, done };
}

// Deja `users` y `profiles` cuadrados: cada persona con su perfil y ningún
// perfil suelto. Un perfil sin dueño no lo puede abrir nadie, así que sobra.
function normalizeUsuarios(data) {
  const antes = JSON.stringify([data.users, Object.keys(data.profiles || {}).sort()]);

  const users = (Array.isArray(data.users) ? data.users : [])
    .slice(0, MAX_PERSONAS)
    .map((u, i) => ({
      id: typeof u.id === 'string' && u.id ? u.id : newId(),
      name: cleanText(u.name, MAX_PERSONA_NOMBRE) || 'Sin nombre',
      color: hexOrEmpty(u.color, '') || PALETTE[i % PALETTE.length],
      order: i,
      // Competir viene puesto: la tabla vacía no se entiende y apagarlo es un
      // clic. Lo que NO viene puesto es publicar ningún hábito, así que entrar
      // en la tabla no enseña nada que su dueño no haya abierto a mano.
      compite: u.compite !== false,
      // La contraseña se copia tal cual o no se copia: aquí se reconstruye el
      // objeto entero, y sin esta línea normalizar a alguien le abriría el
      // perfil de par en par sin que nadie se enterara.
      ...(claveGuardada(u.clave) ? { clave: { sal: u.clave.sal, hash: u.clave.hash } } : {}),
    }));

  const previos = data.profiles && typeof data.profiles === 'object' ? data.profiles : {};
  const profiles = {};
  for (const u of users) {
    profiles[u.id] = previos[u.id] && typeof previos[u.id] === 'object' ? previos[u.id] : perfilNuevo();
  }

  data.users = users;
  data.profiles = profiles;
  return JSON.stringify([data.users, Object.keys(profiles).sort()]) !== antes;
}

function normalizePerfil(perfil) {
  let changedHabitos = false;
  if (!Array.isArray(perfil.avisos)) perfil.avisos = [];
  if (!Array.isArray(perfil.push)) perfil.push = [];
  const antesAvisos = JSON.stringify(perfil.avisos);
  perfil.avisos = perfil.avisos.slice(-MAX_AVISOS).map((a) => ({
    id: typeof a.id === 'string' && a.id ? a.id : newId(),
    tipo: cleanText(a.tipo, 24) || 'casa',
    texto: cleanText(a.texto, MAX_AVISO_TEXTO) || '',
    cuando: typeof a.cuando === 'string' ? a.cuando : new Date().toISOString(),
    visto: a.visto === true,
  }));
  if (JSON.stringify(perfil.avisos) !== antesAvisos) changedHabitos = true;
  if (!Array.isArray(perfil.habits)) perfil.habits = [];
  if (!perfil.log || typeof perfil.log !== 'object') perfil.log = {};
  if (!Array.isArray(perfil.notes)) perfil.notes = [];
  perfil.habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const antesHabitos = JSON.stringify(perfil.habits);
  perfil.habits.forEach((h, i) => {
    h.order = i;
    h.pauta = normalizePauta(h.pauta);
    // Derivada, y por eso se recalcula aqui: los habitos que se crearon cuando
    // la dificultad se elegia a mano se corrigen solos la primera vez que se
    // lee el archivo, en vez de quedarse contradiciendo a su propia pauta.
    h.dificultad = dificultadDePauta(h.pauta);
    h.recordatorio = horaOVacia(h.recordatorio);
    // El día en que ya se avisó de este hábito. Es lo que impide que el mismo
    // recordatorio suene una vez por cada vuelta del reloj.
    h.avisado = ISO_DATE.test(String(h.avisado || '')) ? h.avisado : '';
    // Los hábitos que ya existían se quedan privados. Publicarlos sin avisar
    // sería enseñarle a la casa una lista que su dueño escribió cuando esto
    // no lo miraba nadie más; que los abra quien los escribió.
    h.publico = h.publico === true;
    // El enlace con el reto se conserva o se va entero; sin esto, normalizar
    // convertiría los hábitos de reto en hábitos sueltos.
    if (typeof h.reto === 'string' && h.reto) h.publico = true;
    else delete h.reto;
  });
  if (JSON.stringify(perfil.habits) !== antesHabitos) changedHabitos = true;
  let changed = ensureChallenge(perfil);
  for (const note of perfil.notes) {
    if (normalizeNote(note)) changed = true;
  }

  if (!Array.isArray(perfil.work)) {
    perfil.work = [];
    changed = true;
  }
  const antes = JSON.stringify(perfil.work);
  perfil.work = perfil.work.slice(0, MAX_WORK_TASKS).map(normalizeWorkTask);
  perfil.work.sort((a, b) => a.order - b.order);
  perfil.work.forEach((t, i) => { t.order = i; });
  if (JSON.stringify(perfil.work) !== antes) changed = true;

  return changed || changedHabitos;
}

// Los retos, cuadrados con quién existe todavía. Un reto sin nadie dentro no es
// un reto: se va. Salirse deja rastro (estado 'fuera') a propósito, porque
// volver a entrar tiene que recuperar la cuenta, no empezarla de cero.
function normalizeRetos(data) {
  const previos = Array.isArray(data.retos) ? data.retos : [];
  const antes = JSON.stringify(previos);
  const vivos = new Set(data.users.map((u) => u.id));

  const retos = previos.slice(0, MAX_RETOS).map((r) => {
    const participantes = {};
    for (const [id, p] of Object.entries(r.participantes || {})) {
      if (!vivos.has(id)) continue;
      participantes[id] = {
        estado: oneOf(p && p.estado, ESTADOS_RETO, 'invitado'),
        desde: isoDateOrEmpty(p && p.desde),
      };
    }
    const pauta = normalizePauta(r.pauta);
    return {
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      nombre: cleanText(r.nombre, MAX_TAREA_CASA) || 'Sin nombre',
      icono: cleanText(r.icono, MAX_ICONO) || DEFAULT_ICON,
      pauta,
      dificultad: dificultadDePauta(pauta),
      creador: vivos.has(r.creador) ? r.creador : '',
      desde: isoDateOrEmpty(r.desde),
      participantes,
    };
  }).filter((r) => Object.values(r.participantes).some((p) => p.estado !== 'fuera'));

  data.retos = retos;
  return JSON.stringify(retos) !== antes;
}

// Las sesiones caducadas se tiran al leer. Es la única limpieza que necesitan:
// nadie las mira más que este archivo.
function normalizeSesiones(data) {
  const previas = data.sesiones && typeof data.sesiones === 'object' ? data.sesiones : {};
  const vivos = new Set(data.users.map((u) => u.id));
  const ahora = Date.now();
  const sesiones = {};
  for (const [vale, s] of Object.entries(previas)) {
    if (s && vivos.has(s.user) && typeof s.hasta === 'number' && s.hasta > ahora) sesiones[vale] = s;
  }
  const cambio = JSON.stringify(previas) !== JSON.stringify(sesiones);
  data.sesiones = sesiones;
  return cambio;
}

function normalize(data) {
  let changed = normalizeUsuarios(data);
  if (normalizeSesiones(data)) changed = true;
  if (normalizeRetos(data)) changed = true;

  for (const usuario of data.users) {
    if (normalizePerfil(data.profiles[usuario.id])) changed = true;
  }

  // Un hábito que apunta a un reto que ya no existe se quedaría atrapado: no se
  // puede editar porque «es de un reto» y no se puede borrar por lo mismo.
  // Al soltarle el enlace vuelve a ser un hábito normal de quien lo hizo, con
  // su historial intacto, que es lo justo si el reto se canceló por debajo.
  const retosVivos = new Set((data.retos || []).map((r) => r.id));
  for (const usuario of data.users) {
    for (const h of data.profiles[usuario.id].habits) {
      if (h.reto && !retosVivos.has(h.reto)) {
        delete h.reto;
        changed = true;
      }
    }
  }

  // La casa se normaliza al final, cuando ya se sabe quién existe: es lo que
  // permite que una casilla de alguien que ya no está se vacíe sola.
  const antesCasa = JSON.stringify(data.casa);
  normalizeCasa(data);
  if (JSON.stringify(data.casa) !== antesCasa) changed = true;

  return changed;
}

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  // El orden importa: las dos migraciones viejas trabajan sobre la raíz del
  // archivo, así que tienen que correr antes de que v3 la reparta en perfiles.
  let cambio = migrateHabitsToV2(data);
  if (migrateLegacyNotes(data)) cambio = true;
  if (migrateToV3(data)) cambio = true;
  if (normalize(data)) cambio = true;
  if (cambio) writeDataSafely(data);
  return data;
}

// ---- Contraseñas y sesiones ----
// Una contraseña aquí no protege de internet —esto vive en la red de casa—,
// protege de la persona que está en el salón: dice «estas notas son mías».
// Por eso es voluntaria y por eso la pone cada quien, no el que montó el
// servidor. Sin contraseña, el perfil se abre solo con elegirlo, como antes.

function claveGuardada(clave) {
  return !!clave && typeof clave === 'object'
    && typeof clave.sal === 'string' && typeof clave.hash === 'string';
}

// scrypt es lento a propósito: probar contraseñas a mano no lleva a ningún
// lado. La sal es de cada persona, así que dos contraseñas iguales no se
// parecen en el archivo.
function hashClave(clave, sal) {
  return crypto.scryptSync(clave, sal, 32).toString('hex');
}

// La contraseña en claro no se escribe en ningún sitio ni vuelve a salir del
// servidor. Quien la olvide no la recupera: la quita y pone otra.
function claveNueva(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  return { sal, hash: hashClave(clave, sal) };
}

// Comparación en tiempo constante: con === el tiempo que tarda en fallar ya
// dice por dónde va la contraseña. Cuesta lo mismo hacerlo bien.
function claveCorrecta(usuario, clave) {
  if (!claveGuardada(usuario.clave)) return true;
  if (typeof clave !== 'string' || clave === '') return false;
  const dado = Buffer.from(hashClave(clave, usuario.clave.sal), 'hex');
  const guardado = Buffer.from(usuario.clave.hash, 'hex');
  return dado.length === guardado.length && crypto.timingSafeEqual(dado, guardado);
}

// Fallos seguidos por perfil. En memoria a propósito: no vale la pena escribir
// en disco cada vez que alguien se equivoca de tecla.
const intentos = new Map();

function segundosDeCastigo(id) {
  const t = intentos.get(id);
  if (!t || t.fallos < INTENTOS_MAX) return 0;
  const queda = t.hasta - Date.now();
  if (queda <= 0) {
    intentos.delete(id);
    return 0;
  }
  return Math.ceil(queda / 1000);
}

function anotarFallo(id) {
  const t = intentos.get(id) || { fallos: 0, hasta: 0 };
  t.fallos += 1;
  t.hasta = Date.now() + CASTIGO_MS;
  intentos.set(id, t);
}

// La sesión es un vale que se da al acertar la contraseña y que el cliente
// manda en cada petición. Vive en el archivo para que reiniciar el servidor no
// eche a nadie de su propio perfil.
function abrirSesion(data, usuario) {
  const vale = crypto.randomBytes(24).toString('hex');
  data.sesiones[vale] = { user: usuario.id, hasta: Date.now() + SESION_MS };
  return vale;
}

function sesionValida(data, usuario, vale) {
  const s = data.sesiones[vale];
  return !!s && s.user === usuario.id && s.hasta > Date.now();
}

// ---- Quién pide ----
// La identidad viaja en una cabecera que pone el cliente al elegir perfil. Si
// el perfil no tiene contraseña, eso dice quién eres pero no lo demuestra:
// cualquiera de la red puede entrar como cualquiera, que es justo lo que se
// quiere en una casa. Si la tiene, además hace falta el vale de la sesión.
// La lista de personas que sale hacia fuera. Lleva un recuento de lo que hay
// dentro de cada perfil —cuántos hábitos, cuántas notas— y nunca su contenido:
// es lo justo para que quitar a alguien pueda decir en voz alta qué se lleva
// por delante, sin que nadie vea las notas de nadie.
function usuariosPublicos(data) {
  return data.users.map((u) => {
    const perfil = data.profiles[u.id] || {};
    const { clave, ...publico } = u;
    return {
      ...publico,
      // Hacia fuera solo viaja si hay candado, nunca de qué está hecho: es lo
      // que necesita la pantalla de entrada para saber si pedir contraseña.
      protegido: !!clave,
      resumen: {
        habitos: (perfil.habits || []).length,
        notas: (perfil.notes || []).length,
        tareas: (perfil.work || []).length,
      },
    };
  });
}

function usuarioDe(data, req, res) {
  const usuario = data.users.find((u) => u.id === (req.get('X-Usuario') || ''));
  if (!usuario) {
    res.status(401).json({ error: 'Perfil desconocido: vuelve a elegir quién eres.' });
    return null;
  }
  if (claveGuardada(usuario.clave) && !sesionValida(data, usuario, req.get('X-Sesion') || '')) {
    // «clave: true» distingue «tu perfil ya no existe» de «vuelve a entrar»:
    // el cliente enseña el candado en vez de mandar a nadie a la casilla uno.
    res.status(401).json({ error: 'Este perfil pide contraseña.', clave: true });
    return null;
  }
  return usuario;
}

// Sin candado, el perfil de cualquiera lo arregla cualquiera: es una casa, y
// la alternativa es que nadie pueda corregirle el nombre a nadie. Con candado,
// solo su dueño. Poner contraseña es también decir «esto no se toca».
function puedeTocar(data, objetivo, req) {
  if (!claveGuardada(objetivo.clave)) return true;
  return objetivo.id === (req.get('X-Usuario') || '')
    && sesionValida(data, objetivo, req.get('X-Sesion') || '');
}

function perfilDe(data, req, res) {
  const usuario = usuarioDe(data, req, res);
  return usuario ? data.profiles[usuario.id] : null;
}

function writeDataSafely(data) {
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

try {
  ensureDataFile();
} catch (err) {
  console.error(`Error al iniciar: ${err.message}`);
  process.exit(1);
}

const app = express();
// El límite por defecto de express.json son 100 kB y una imagen del
// portapapeles llega en base64 muy por encima de eso.
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Las imágenes de las notas viven en el vault, no en public/.
app.use('/adjuntos', express.static(UPLOADS_DIR));

// Lo que ve una persona al entrar: lo suyo, quién más vive en la casa y la
// casa entera. El perfil se aplana en la respuesta —habits, log, notes...— para
// que el cliente siga viendo la misma forma de datos de siempre.
// ---- Aviso en vivo ----
// La casa la mira más de una persona a la vez, así que un cambio tiene que
// llegar a las demás pantallas sin que nadie recargue. Se hace con Server-Sent
// Events: es un stream de texto por HTTP, el navegador lo reconecta solo y no
// hace falta ninguna librería. El sentido es servidor -> cliente, que es justo
// lo que hace falta: lo que va en la otra dirección ya son las rutas de la API.
const oyentes = new Set();

app.get('/api/eventos', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Sin esto, cualquier proxy por medio guarda el stream en un búfer y los
    // avisos llegan a puñados en vez de llegar cuando pasan.
    'X-Accel-Buffering': 'no',
  });
  res.write(': conectado\n\n');

  const oyente = { res };
  oyentes.add(oyente);
  req.on('close', () => oyentes.delete(oyente));
});

// Un latido cada 25 s. Sin tráfico, un router doméstico da la conexión por
// muerta a los pocos minutos y la pantalla se queda mirando una casa vieja sin
// enterarse; con el latido, si se cae, el navegador lo nota y reconecta.
setInterval(() => {
  for (const oyente of oyentes) oyente.res.write(': latido\n\n');
}, 25000).unref();

// `req` sirve para saber quién lo provocó: el cliente que hizo el cambio ya
// pintó el resultado al recibir la respuesta, así que ignora su propio eco.
function avisar(tipo, datos, req) {
  const carga = JSON.stringify({ ...datos, origen: (req && req.get('X-Cliente')) || '' });
  for (const oyente of oyentes) {
    oyente.res.write(`event: ${tipo}\ndata: ${carga}\n\n`);
  }
}

app.get('/api/data', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const perfil = data.profiles[usuario.id];
  const publicos = usuariosPublicos(data);
  // El rango viaja calculado desde aquí para que la fórmula viva en un solo
  // sitio: si la calculara también el cliente, tarde o temprano dirían cosas
  // distintas y no habría manera de saber cuál miente.
  const hoy = isoDateOrEmpty(req.query.hoy) || new Date().toISOString().slice(0, 10);
  const conRango = perfil.habits.map((h) => ({ ...h, rango: rangoDe(perfil, h, hoy) }));
  res.json({
    user: publicos.find((u) => u.id === usuario.id),
    users: publicos,
    habits: conRango,
    log: perfil.log,
    notes: perfil.notes,
    work: perfil.work,
    challenge: perfil.challenge,
    casa: data.casa,
  });
});

app.post('/api/mark', (req, res) => {
  const { date, habitId, done } = req.body || {};
  if (!date || !habitId || typeof done !== 'boolean') {
    return res.status(400).json({ error: 'date, habitId y done (boolean) son obligatorios' });
  }
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const perfil = data.profiles[usuario.id];
  const habit = perfil.habits.find((h) => h.id === habitId);
  if (!habit) {
    return res.status(400).json({ error: `Hábito desconocido: ${habitId}` });
  }
  if (!perfil.log[date]) {
    perfil.log[date] = { done: [] };
  }
  const entry = perfil.log[date];
  const idx = entry.done.indexOf(habitId);
  const estrenada = done && idx === -1;
  if (estrenada) {
    entry.done.push(habitId);
  } else if (!done && idx !== -1) {
    entry.done.splice(idx, 1);
  }

  // Marcar algo público es una jugada, y una jugada que nadie ve no compite.
  // Va a la bandeja de los demás y sale por push, igual que un reto.
  //
  // Tres frenos, porque esto se dispara muchas veces al día:
  //   · solo al marcar, nunca al desmarcar;
  //   · solo si el hábito es público —lo privado no se nombra, esa es su
  //     promesa entera— y solo el día de hoy: rellenar la semana pasada un
  //     domingo por la noche no es una jugada, es contabilidad;
  //   · y una sola vez por hábito y día, anotado en el propio log, para que
  //     marcar y desmarcar tres veces no mande tres avisos.
  const anunciable = estrenada && habit.publico && date === hoyLocal();
  if (anunciable) {
    if (!Array.isArray(entry.anunciados)) entry.anunciados = [];
    if (!entry.anunciados.includes(habitId)) {
      entry.anunciados.push(habitId);
      avisarACasa(data, usuario.id, 'marca', `${usuario.name} marcó «${habit.name}»`);
    }
  }

  writeDataSafely(data);
  // Ver moverse la tabla cuando otro marca es la mitad de la gracia de
  // competir; sin esto habría que recargar para enterarse.
  avisarLiga(data, req, anunciable ? habit.name : '');
  res.json({ ok: true, log: perfil.log[date] });
});

// ---- Reto: 30 días perfectos ----

// Fija el día 1 a mano. Con startDate vacío vuelve al modo automático (el
// primer día perfecto). Solo mueve la ventana de fechas: el log queda intacto,
// así que reiniciar el reto nunca pierde historial.
app.post('/api/challenge', (req, res) => {
  const { startDate } = req.body || {};
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;

  if (startDate === null || startDate === '') {
    perfil.challenge = { startDate: primerDiaPerfecto(perfil), days: CHALLENGE_DAYS, auto: true };
  } else if (ISO_DATE.test(String(startDate || ''))) {
    perfil.challenge = { startDate, days: CHALLENGE_DAYS, auto: false };
  } else {
    return res.status(400).json({ error: 'startDate debe tener el formato AAAA-MM-DD (o venir vacío)' });
  }

  writeDataSafely(data);
  res.json({ ok: true, challenge: perfil.challenge });
});

// ---- Hábitos: crear, editar, borrar y reordenar ----

app.post('/api/habits', (req, res) => {
  const { name, icon, color } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del hábito es obligatorio' });
  }
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const taken = new Set(perfil.habits.map((h) => h.id));
  const { pauta, publico } = req.body || {};
  const pautaLimpia = normalizePauta(pauta);
  const habit = {
    id: uniqueId(slugify(name), taken),
    name: name.trim().slice(0, 40),
    icon: typeof icon === 'string' && icon ? icon : DEFAULT_ICON,
    color: typeof color === 'string' && color ? color : PALETTE[perfil.habits.length % PALETTE.length],
    order: perfil.habits.length,
    pauta: pautaLimpia,
    dificultad: dificultadDePauta(pautaLimpia),
    recordatorio: horaOVacia((req.body || {}).recordatorio),
    avisado: '',
    // Un hábito nuevo nace público porque se crea sabiendo que la casa mira.
    // Los que ya existían no: esos se quedaron privados en la normalización.
    publico: publico !== false,
  };
  perfil.habits.push(habit);
  writeDataSafely(data);
  res.json({ ok: true, habit });
});

app.patch('/api/habits/:id', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const habit = perfil.habits.find((h) => h.id === req.params.id);
  if (!habit) {
    return res.status(404).json({ error: `Hábito no encontrado: ${req.params.id}` });
  }
  // Lo que define un hábito de reto —el nombre, la pauta, la dificultad, que
  // sea público— es del reto y lo mismo para todos. Si cada uno pudiera
  // ajustarlo, dejarían de estar compitiendo en la misma cosa. El color sí,
  // que es cómo lo reconoce cada quien en su propia pantalla.
  const deReto = !!habit.reto;
  const { name, icon, color, recordatorio } = req.body || {};
  // El id nunca cambia aunque cambie el nombre: es lo que ata el historial.
  if (typeof color === 'string' && color) habit.color = color;
  // La hora sí se toca aunque el hábito venga de un reto: a qué hora le va bien
  // correr a cada uno no es parte de lo que se pactó al entrar.
  if (recordatorio !== undefined) {
    const antes = habit.recordatorio;
    habit.recordatorio = horaOVacia(recordatorio);
    // Cambiar la hora reabre el día: si eran las 7:00 y ya sonó, poner las
    // 21:00 tiene que sonar hoy y no mañana.
    if (habit.recordatorio !== antes) habit.avisado = '';
  }
  if (!deReto) {
    if (typeof name === 'string' && name.trim() !== '') habit.name = name.trim().slice(0, 40);
    if (typeof icon === 'string' && icon) habit.icon = icon;
    const { pauta, publico } = req.body || {};
    // Cambiar la pauta cambia la dificultad: son la misma decision.
    if (pauta !== undefined) {
      habit.pauta = normalizePauta(pauta);
      habit.dificultad = dificultadDePauta(habit.pauta);
    }
    if (typeof publico === 'boolean') habit.publico = publico;
  }
  writeDataSafely(data);
  avisarLiga(data, req);
  res.json({ ok: true, habit });
});

// Borrar quita el hábito de la lista pero NO toca el log: si más adelante se
// vuelve a crear con el mismo nombre, recupera su historial.
app.delete('/api/habits/:id', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const idx = perfil.habits.findIndex((h) => h.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: `Hábito no encontrado: ${req.params.id}` });
  }
  // Borrar el hábito de un reto sería rendirse por la puerta de atrás, sin
  // decirlo y sin que los demás se enteren. Rendirse se dice.
  if (perfil.habits[idx].reto) {
    return res.status(400).json({
      error: 'Este hábito es de un reto. Para quitarlo, sal del reto.',
      reto: perfil.habits[idx].reto,
    });
  }
  perfil.habits.splice(idx, 1);
  normalize(data);
  writeDataSafely(data);
  res.json({ ok: true });
});

app.post('/api/habits/reorder', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids debe ser un arreglo' });
  }
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const byId = new Map(perfil.habits.map((h) => [h.id, h]));
  const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
  if (reordered.length !== perfil.habits.length) {
    return res.status(400).json({ error: 'ids debe incluir todos los hábitos exactamente una vez' });
  }
  // Renumerar antes de normalizar: normalize() ordena por `order`, así que con
  // el numerado viejo volvía a poner el orden anterior y subir/bajar un hábito
  // no guardaba nada (se veía bien hasta recargar la página).
  perfil.habits = reordered;
  perfil.habits.forEach((h, i) => { h.order = i; });
  normalize(data);
  writeDataSafely(data);
  res.json({ ok: true, habits: perfil.habits });
});

// ---- Notas: independientes, sin límite, cada una con su propio estilo ----

app.post('/api/notes', (req, res) => {
  const { content, tags, bg } = req.body || {};
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const timestamp = nowISO();
  const note = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...DEFAULT_NOTE_STYLE,
    content: sanitizeNoteHTML(content),
    tags: cleanTags(tags),
    bg: hexOrEmpty(bg, ''),
    // Array propio: el spread copia la referencia de DEFAULT_NOTE_STYLE, así
    // que sin esto todas las notas creadas en el mismo arranque compartirían
    // la misma lista de piezas. `tags` se salva sola porque cleanTags() ya
    // devuelve un array nuevo; `items` no tenía quien la salvara.
    items: [],
  };
  perfil.notes.push(note);
  writeDataSafely(data);
  res.json({ ok: true, note });
});

app.patch('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const note = perfil.notes.find((n) => n.id === id);
  if (!note) {
    return res.status(404).json({ error: `Nota no encontrada: ${id}` });
  }
  const { content, title, font, size, color, bg, tags, pinned, layout, items } = req.body || {};
  if (typeof content === 'string') note.content = sanitizeNoteHTML(content);
  if (typeof title === 'string') note.title = cleanText(title, MAX_NOTE_TITLE);
  if (typeof layout === 'string') {
    if (!NOTE_LAYOUTS.includes(layout)) {
      return res.status(400).json({ error: `Disposición desconocida: ${layout}` });
    }
    note.layout = layout;
  }
  if (Array.isArray(items)) note.items = normalizeNoteItems(items);
  if (typeof font === 'string' && font) note.font = claveDeEstilo(font, note.font);
  if (typeof size === 'string' && size) note.size = claveDeEstilo(size, note.size);
  if (typeof color === 'string') note.color = hexOrEmpty(color, note.color) || DEFAULT_NOTE_STYLE.color;
  if (typeof bg === 'string') note.bg = hexOrEmpty(bg, note.bg);
  if (Array.isArray(tags)) note.tags = cleanTags(tags);
  if (typeof pinned === 'boolean') note.pinned = pinned;
  note.updatedAt = nowISO();
  writeDataSafely(data);
  // Quitar una pieza de imagen también deja su archivo sin dueño.
  if (Array.isArray(items)) barrerAdjuntosHuerfanos(data);
  res.json({ ok: true, note });
});

app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const idx = perfil.notes.findIndex((n) => n.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Nota no encontrada: ${id}` });
  }
  perfil.notes.splice(idx, 1);
  writeDataSafely(data);
  barrerAdjuntosHuerfanos(data);
  res.json({ ok: true });
});

// Borra los archivos de /adjuntos que ya no menciona ninguna nota. Sin esto,
// cada imagen pegada se quedaba en el vault para siempre: borrar la nota que la
// contenía la dejaba invisible pero seguía ocupando sitio, y el usuario no
// tiene forma de saber qué archivo era de qué nota.
// Se pasa una sola vez tras cada borrado y solo mira dentro de UPLOADS_DIR.
function barrerAdjuntosHuerfanos(data) {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return;

    // Las notas de todos: un adjunto es huérfano solo si no lo reclama nadie.
    const enUso = new Set();
    for (const perfil of Object.values(data.profiles)) {
      for (const nota of perfil.notes) {
        for (const pieza of nota.items || []) {
          if (pieza.kind === 'imagen' && pieza.src) enUso.add(path.basename(pieza.src));
        }
      }
    }

    // Solo se tocan los nombres que genera esta app (id + extensión conocida).
    // Cualquier otra cosa que haya en la carpeta la puso alguien más y no nos
    // corresponde borrarla.
    const nuestro = new RegExp(`^[a-z0-9]+\\.(${Object.values(TIPOS_IMAGEN).join('|')})$`, 'i');
    for (const archivo of fs.readdirSync(UPLOADS_DIR)) {
      if (!nuestro.test(archivo) || enUso.has(archivo)) continue;

      // Un archivo recién subido todavía no lo menciona ninguna nota: pegar una
      // imagen son dos viajes al servidor —primero se sube, después se guarda la
      // pieza que la señala— y entre uno y otro el archivo está legítimamente
      // huérfano. Sin esta espera, borrar cualquier nota en ese hueco se llevaría
      // por delante la imagen que el usuario acaba de pegar.
      const ruta = path.join(UPLOADS_DIR, archivo);
      if (Date.now() - fs.statSync(ruta).mtimeMs < GRACIA_ADJUNTOS_MS) continue;
      fs.unlinkSync(ruta);
    }
  } catch (err) {
    // Un adjunto de más no rompe nada; fallar el borrado de la nota sí.
    console.warn('No se pudieron barrer los adjuntos huérfanos:', err.message);
  }
}

// ---- Imágenes pegadas en las notas ----
// Llegan como data URL desde el portapapeles. Se escriben como archivo en el
// vault y la nota solo guarda la ruta: el JSON de datos no engorda.
app.post('/api/uploads', (req, res) => {
  // Esto escribe un archivo en el vault, así que pide identidad como todo lo
  // demás. Sin esto, cualquiera que llegue a la app puede dejar archivos en el
  // disco sin ser nadie, que es la única ruta de la casa que lo permitía.
  const data = readData();
  if (!perfilDe(data, req, res)) return;

  const { dataUrl } = req.body || {};
  if (typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Falta la imagen' });
  }

  const m = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'El formato de la imagen no es válido' });

  const ext = TIPOS_IMAGEN[m[1].toLowerCase()];
  if (!ext) {
    return res.status(400).json({ error: `Solo se admiten imágenes (${Object.values(TIPOS_IMAGEN).join(', ')})` });
  }

  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0) return res.status(400).json({ error: 'La imagen llegó vacía' });
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: `La imagen pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` });
  }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const nombre = `${newId()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, nombre), bytes);
  res.json({ ok: true, src: `/adjuntos/${nombre}`, bytes: bytes.length });
});

// ---- Work Mode: tareas, pasos y bitácora ----

app.post('/api/work', (req, res) => {
  const { title, detail, area, priority, due, steps } = req.body || {};
  const limpio = cleanText(title, MAX_WORK_TITLE);
  if (!limpio) {
    return res.status(400).json({ error: 'El título de la tarea es obligatorio' });
  }
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  if (perfil.work.length >= MAX_WORK_TASKS) {
    return res.status(400).json({ error: `No caben más de ${MAX_WORK_TASKS} tareas` });
  }

  const task = normalizeWorkTask({
    title: limpio,
    detail,
    area,
    priority,
    due,
    status: 'pendiente',
    steps: Array.isArray(steps) ? steps.map((s) => ({ text: s })) : [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    order: perfil.work.length,
  });
  // Los pasos vacíos que llegan del formulario no se guardan.
  task.steps = task.steps.filter((s) => s.text);
  pushLog(task, 'Tarea creada.');
  perfil.work.push(task);
  writeDataSafely(data);
  res.json({ ok: true, task });
});

// Actualiza los campos de la tarea. Todo cambio de estado deja rastro en la
// bitácora, y el estado es también lo que fija startedAt y doneAt: son datos
// derivados, así que los pone el servidor y no se aceptan del cliente.
app.patch('/api/work/:id', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const { title, detail, area, priority, due, status } = req.body || {};

  if (typeof title === 'string') {
    const limpio = cleanText(title, MAX_WORK_TITLE);
    if (!limpio) return res.status(400).json({ error: 'El título no puede quedar vacío' });
    task.title = limpio;
  }
  if (typeof detail === 'string') task.detail = cleanText(detail, MAX_WORK_DETAIL);
  if (typeof area === 'string') task.area = cleanText(area, MAX_WORK_AREA);
  if (typeof due === 'string') task.due = isoDateOrEmpty(due, task.due);

  if (typeof priority === 'string') {
    const nueva = oneOf(priority, WORK_PRIORITIES, null);
    if (!nueva) return res.status(400).json({ error: `Prioridad desconocida: ${priority}` });
    if (nueva !== task.priority) {
      pushLog(task, `Prioridad: ${task.priority} → ${nueva}`);
      task.priority = nueva;
    }
  }

  if (typeof status === 'string') {
    const nuevo = oneOf(status, WORK_STATES, null);
    if (!nuevo) return res.status(400).json({ error: `Estado desconocido: ${status}` });
    if (nuevo !== task.status) {
      pushLog(task, `Estado: ${WORK_STATE_LABEL[task.status]} → ${WORK_STATE_LABEL[nuevo]}`);
      task.status = nuevo;
      if (nuevo === 'en-curso' && !task.startedAt) task.startedAt = nowISO();
      // Volver atrás desde «hecha» reabre la tarea: se borra la fecha de cierre
      // para que no quede una tarea abierta con fecha de terminada.
      task.doneAt = nuevo === 'hecha' ? nowISO() : null;
    }
  }

  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task });
});

app.delete('/api/work/:id', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const idx = perfil.work.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: `Tarea no encontrada: ${req.params.id}` });
  }
  perfil.work.splice(idx, 1);
  normalize(data);
  writeDataSafely(data);
  res.json({ ok: true });
});

app.post('/api/work/reorder', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids debe ser un arreglo' });
  }
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const byId = new Map(perfil.work.map((t) => [t.id, t]));
  const reordenadas = ids.map((id) => byId.get(id)).filter(Boolean);
  if (reordenadas.length !== perfil.work.length) {
    return res.status(400).json({ error: 'ids debe incluir todas las tareas exactamente una vez' });
  }
  // Hay que renumerar ANTES de normalizar: normalize() ordena por `order`, así
  // que si se dejara el numerado viejo volvería a colocar el orden anterior y
  // el reordenamiento no tendría ningún efecto.
  perfil.work = reordenadas;
  perfil.work.forEach((t, i) => { t.order = i; });
  normalize(data);
  writeDataSafely(data);
  res.json({ ok: true, work: perfil.work });
});

// ---- Pasos: el proceso que guía la tarea ----

app.post('/api/work/:id/steps', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const texto = cleanText((req.body || {}).text, MAX_STEP_TEXT);
  if (!texto) return res.status(400).json({ error: 'El paso no puede estar vacío' });
  if (task.steps.length >= MAX_STEPS) {
    return res.status(400).json({ error: `Una tarea no puede tener más de ${MAX_STEPS} pasos` });
  }

  const step = { id: newId(), text: texto, done: false, doneAt: null };
  task.steps.push(step);
  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task, step });
});

app.patch('/api/work/:id/steps/:stepId', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const step = task.steps.find((s) => s.id === req.params.stepId);
  if (!step) return res.status(404).json({ error: `Paso no encontrado: ${req.params.stepId}` });

  const { text, done } = req.body || {};
  if (typeof text === 'string') {
    const limpio = cleanText(text, MAX_STEP_TEXT);
    if (!limpio) return res.status(400).json({ error: 'El paso no puede quedar vacío' });
    step.text = limpio;
  }

  if (typeof done === 'boolean' && done !== step.done) {
    step.done = done;
    step.doneAt = done ? nowISO() : null;
    pushLog(task, `${done ? 'Paso completado' : 'Paso reabierto'}: ${step.text}`);

    // Marcar el primer paso de una tarea parada es, de hecho, ponerse a
    // trabajar en ella: el estado sigue al gesto en vez de pedir otro clic.
    if (done && task.status === 'pendiente') {
      pushLog(task, `Estado: ${WORK_STATE_LABEL.pendiente} → ${WORK_STATE_LABEL['en-curso']} (al empezar el proceso)`);
      task.status = 'en-curso';
      if (!task.startedAt) task.startedAt = nowISO();
    }
  }

  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task, step });
});

app.delete('/api/work/:id/steps/:stepId', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const idx = task.steps.findIndex((s) => s.id === req.params.stepId);
  if (idx === -1) return res.status(404).json({ error: `Paso no encontrado: ${req.params.stepId}` });
  task.steps.splice(idx, 1);
  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task });
});

// ---- Bitácora: lo que documenta el proceso ----

app.post('/api/work/:id/log', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const texto = cleanText((req.body || {}).text, MAX_LOG_TEXT);
  if (!texto) return res.status(400).json({ error: 'La entrada de bitácora no puede estar vacía' });
  pushLog(task, texto, 'nota');
  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task });
});

// Solo se borran las entradas escritas a mano. Las automáticas son el registro
// de lo que pasó: si se pudieran borrar, la bitácora dejaría de ser fiable.
app.delete('/api/work/:id/log/:entryId', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  const task = findTask(perfil, req.params.id, res);
  if (!task) return;

  const idx = task.log.findIndex((e) => e.id === req.params.entryId);
  if (idx === -1) return res.status(404).json({ error: `Entrada no encontrada: ${req.params.entryId}` });
  if (task.log[idx].kind !== 'nota') {
    return res.status(400).json({ error: 'Las entradas automáticas no se pueden borrar' });
  }
  task.log.splice(idx, 1);
  task.updatedAt = nowISO();
  writeDataSafely(data);
  res.json({ ok: true, task });
});

// ---- Casa: personas, tareas y horarios ----
// Todas estas rutas devuelven `casa` entera. Un cambio en un sitio se nota en
// otro —quitar a alguien vacía sus casillas, borrar una tarea borra sus
// marcas—, así que devolver solo la pieza tocada dejaría al cliente con una
// copia desfasada de lo demás.

// La casa es de todos, así que cada cambio se responde a quien lo hizo y se
// anuncia a los demás por el mismo camino: una sola función y no hay forma de
// guardar algo y olvidarse de contarlo.
// El aviso de la casa se deja aparte de la ruta que lo provoca porque todas
// acaban aquí: así ninguna se puede olvidar de contarlo.
const okCasa = (res, data, req, cuenta = '') => {
  const quien = data.users.find((u) => u.id === (req.get('X-Usuario') || ''));
  if (cuenta && quien) {
    avisarACasa(data, quien.id, 'casa', `${quien.name} ${cuenta}`);
    writeDataSafely(data);
  }
  avisar('casa', { casa: data.casa, quien: quien ? quien.name : '' }, req);
  res.json({ ok: true, casa: data.casa });
};

function findTareaCasa(data, id, res) {
  const tarea = data.casa.chores.find((c) => c.id === id);
  if (!tarea) {
    res.status(404).json({ error: `Tarea de casa no encontrada: ${id}` });
    return null;
  }
  return tarea;
}

// ---- Push ----
// Un aviso en la bandeja solo se ve si alguien abre la app. El push es lo que
// hace que llegue con la app cerrada: el navegador se suscribe a un servicio
// (el de Google o el de Mozilla, según el navegador), nos da una dirección, y
// nosotros mandamos ahí un mensaje cifrado que ese servicio entrega al aparato.
//
// Las llaves VAPID son lo que identifica a este servidor ante ese servicio. Se
// generan una sola vez y se guardan en cert/: si cambian, todas las
// suscripciones que haya repartidas por los móviles de la casa dejan de valer.
function llavesVapid() {
  try {
    return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  } catch (e) {
    const llaves = webpush.generateVAPIDKeys();
    fs.mkdirSync(CERT_DIR, { recursive: true });
    fs.writeFileSync(VAPID_FILE, JSON.stringify(llaves, null, 2), 'utf8');
    console.log('Llaves de notificaciones creadas en cert/vapid.json');
    return llaves;
  }
}

const VAPID = llavesVapid();
// El "mailto" es lo que pide la especificación para que el servicio de push
// tenga a quién quejarse. No sale de aquí ni se le manda a nadie más.
webpush.setVapidDetails('mailto:metanoia@casa.local', VAPID.publicKey, VAPID.privateKey);

// Manda el aviso a todos los aparatos suscritos de esa persona. Una suscripción
// caducada devuelve 404 o 410 y se tira: son móviles que desinstalaron la app o
// navegadores que limpiaron sus datos, y guardarlos para siempre es basura.
async function empujar(data, usuarioId, texto) {
  const perfil = data.profiles[usuarioId];
  const cuenta = { aparatos: 0, aceptados: 0, caducados: 0, fallos: [] };
  if (!perfil || !Array.isArray(perfil.push) || perfil.push.length === 0) return cuenta;
  cuenta.aparatos = perfil.push.length;

  const carga = JSON.stringify({ titulo: 'Metanoia', texto });
  const muertas = [];
  await Promise.all(perfil.push.map(async (sus) => {
    try {
      await webpush.sendNotification(sus, carga);
      cuenta.aceptados++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        cuenta.caducados++;
        muertas.push(sus.endpoint);
      } else {
        cuenta.fallos.push(String((err && (err.statusCode || err.message)) || 'desconocido'));
        // Cualquier otra cosa se dice en voz alta. Un push que no sale no rompe
        // nada visible —la bandeja sigue ahí— y por eso puede pasar meses
        // fallando sin que nadie se entere si esto se calla.
        console.error('Push fallido:', err && (err.body || err.message));
      }
    }
  }));

  if (muertas.length) {
    // Se relee: entre el envío y ahora ha pasado una vuelta del bucle de
    // eventos y el archivo puede haber cambiado por otra petición.
    const fresco = readData();
    const suyo = fresco.profiles[usuarioId];
    if (suyo) {
      suyo.push = (suyo.push || []).filter((p) => !muertas.includes(p.endpoint));
      writeDataSafely(fresco);
    }
  }
  return cuenta;
}

// ---- Recordatorios ----
// Un aviso de la bandeja lo provoca otra persona. Un recordatorio lo provoca el
// reloj, y por eso es el único que hace falta de verdad: nadie va a acordarse
// de tu hábito por ti a las siete de la mañana.
//
// La hora del recordatorio es la del salón, no la de Greenwich: se compara
// contra la hora local de este equipo, que es donde vive la casa.
const MINUTOS_DE_GRACIA = 5;

function hoyLocal(ahora = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

function minutosDelDia(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ¿Toca sonar ya? Se acepta un rato de retraso porque el reloj no despierta
// clavado y el equipo puede haber estado dormido; pero solo un rato: recibir a
// las nueve el recordatorio de las siete no recuerda nada, molesta.
function tocaSonar(hora, ahora) {
  const cuando = minutosDelDia(hora);
  const ya = ahora.getHours() * 60 + ahora.getMinutes();
  return ya >= cuando && ya - cuando <= MINUTOS_DE_GRACIA;
}

// Una vuelta del reloj. Devuelve lo que hay que mandar; no manda nada ni
// escribe: así se puede probar el criterio entero sin servidor y sin push.
function recordatoriosPendientes(data, ahora = new Date()) {
  const hoy = hoyLocal(ahora);
  const salida = [];
  for (const usuario of data.users) {
    const perfil = data.profiles[usuario.id];
    if (!perfil) continue;
    for (const habit of perfil.habits) {
      if (!habit.recordatorio) continue;
      if (habit.avisado === hoy) continue;
      if (!tocaSonar(habit.recordatorio, ahora)) continue;
      // No se recuerda lo que hoy no tocaba, ni lo que ya está hecho: el
      // recordatorio que llega cuando ya marcaste enseña que el sistema no
      // te está mirando, y a partir de ahí se ignoran todos.
      if (!tocaEse(perfil, habit, hoy)) continue;
      if (hechoEse(perfil, hoy, habit.id)) continue;
      salida.push({ usuarioId: usuario.id, habit, hoy });
    }
  }
  return salida;
}

async function sonarRecordatorios() {
  const data = readData();
  const pendientes = recordatoriosPendientes(data);
  if (pendientes.length === 0) return 0;

  // Se marca antes de mandar y se guarda de una sola vez: si el push falla, el
  // recordatorio se ha perdido, pero repetirlo cada medio minuto durante los
  // cinco de gracia sería mucho peor.
  for (const p of pendientes) p.habit.avisado = p.hoy;
  writeDataSafely(data);

  for (const p of pendientes) {
    await empujar(data, p.usuarioId, `Toca «${p.habit.name}»`).catch(() => {});
  }
  return pendientes.length;
}

// Cada medio minuto. Es barato —leer un JSON pequeño— y con el margen de
// gracia basta para que ningún recordatorio se caiga por un pico de trabajo.
// Las pruebas lo aceleran para no quedarse medio minuto mirando la pared.
const RELOJ_MS = Number(process.env.METANOIA_RELOJ_MS) || 30000;

function arrancarReloj() {
  return setInterval(() => { sonarRecordatorios().catch(() => {}); }, RELOJ_MS);
}

// ---- Avisos ----
// Dejar un aviso es escribir en la bandeja de otro, así que se hace en un solo
// sitio: el mismo recorte, la misma forma y la misma fecha para todos. Nunca se
// deja un aviso al que provocó el cambio — ya lo sabe, lo acaba de hacer él.
function dejarAviso(data, paraId, tipo, texto) {
  const perfil = data.profiles[paraId];
  if (!perfil) return;
  if (!Array.isArray(perfil.avisos)) perfil.avisos = [];
  perfil.avisos.push({
    id: newId(),
    tipo,
    texto: String(texto).slice(0, MAX_AVISO_TEXTO),
    cuando: new Date().toISOString(),
    visto: false,
  });
  if (perfil.avisos.length > MAX_AVISOS) perfil.avisos = perfil.avisos.slice(-MAX_AVISOS);

  // El push sale por su cuenta y sin esperarlo: la respuesta de la petición que
  // provocó el aviso no tiene por qué quedarse colgada de un servicio de fuera.
  empujar(data, paraId, texto).catch(() => {});
}

// A toda la casa menos a quien lo provocó.
function avisarACasa(data, salvoId, tipo, texto) {
  for (const u of data.users) {
    if (u.id !== salvoId) dejarAviso(data, u.id, tipo, texto);
  }
}

// ---- Retos ----

// El hábito enlazado que un reto siembra en el perfil de quien entra. Nace
// público a la fuerza: entrar en un reto es aceptar que los demás lo vean, y un
// reto con participantes invisibles no es un reto.
function sembrarHabito(perfil, reto) {
  const ya = perfil.habits.find((h) => h.reto === reto.id);
  if (ya) return ya;
  const taken = new Set(perfil.habits.map((h) => h.id));
  const habit = {
    id: uniqueId(slugify(reto.nombre), taken),
    name: reto.nombre,
    icon: reto.icono,
    color: PALETTE[perfil.habits.length % PALETTE.length],
    order: perfil.habits.length,
    dificultad: reto.dificultad,
    pauta: reto.pauta,
    publico: true,
    reto: reto.id,
  };
  perfil.habits.push(habit);
  return habit;
}

// El rango de quien no tiene todavía el hábito sembrado. Existe para que la
// clasificación no tenga huecos: una fila sin cifras se pinta como «undefined».
function rangoVacio() {
  return {
    ...descomponerRR(0),
    estrenado: false,
    porMarca: 0,
    vecesSemana: 0,
    racha: 0,
    maxima: 0,
    constancia: 0,
    fallosSeguidos: 0,
    abandonado: false,
  };
}

function buscarReto(data, id, res) {
  const reto = (data.retos || []).find((r) => r.id === id);
  if (!reto) {
    res.status(404).json({ error: `Reto no encontrado: ${id}` });
    return null;
  }
  return reto;
}

// La clasificación de un reto. Se ordena por RR y solo después se reparten las
// plazas de Radiante, porque quién es primero depende del orden.
function clasificacion(data, reto, hoyISO) {
  const filas = Object.entries(reto.participantes)
    .filter(([, p]) => p.estado === 'dentro')
    .map(([id, p]) => {
      const usuario = data.users.find((u) => u.id === id);
      const perfil = data.profiles[id];
      const habit = perfil.habits.find((h) => h.reto === reto.id);
      const rango = habit
        ? rangoDe(perfil, habit, hoyISO)
        : rangoVacio();
      return {
        id,
        name: usuario ? usuario.name : '',
        color: usuario ? usuario.color : '',
        desde: p.desde,
        rango,
        hoyHecho: !!habit && hechoEse(perfil, hoyISO, habit.id),
        hoyToca: !!habit && tocaEse(perfil, habit, hoyISO),
      };
    })
    .sort((a, b) => b.rango.rr - a.rango.rr || a.name.localeCompare(b.name));

  return filas.map((f, i) => ({ ...f, puesto: i + 1, rango: aplicarPlaza(f.rango, i === 0) }));
}

// Lo que ve una persona: los retos en los que está o a los que la han invitado.
// Un reto ajeno en el que no pinta nada no se lista: no es información suya.
function retosDe(data, usuarioId, hoyISO) {
  return (data.retos || [])
    .filter((r) => r.participantes[usuarioId])
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      icono: r.icono,
      dificultad: r.dificultad,
      pauta: r.pauta,
      desde: r.desde,
      creador: r.creador,
      soyCreador: r.creador === usuarioId,
      miEstado: r.participantes[usuarioId].estado,
      invitados: Object.entries(r.participantes)
        .filter(([, p]) => p.estado === 'invitado')
        .map(([id]) => (data.users.find((u) => u.id === id) || {}).name || ''),
      clasificacion: clasificacion(data, r, hoyISO),
    }));
}

function avisarRetos(data, req) {
  const quien = data.users.find((u) => u.id === (req.get('X-Usuario') || ''));
  avisar('retos', { quien: quien ? quien.name : '' }, req);
}



const fechaDe = (req) => isoDateOrEmpty(req.query.hoy) || new Date().toISOString().slice(0, 10);

// ---- El tablón: los hábitos públicos de la casa ----
// Unirse a lo de otro es la forma más natural de empezar a competir: no hay que
// inventar nada ni ponerse de acuerdo, se ve lo que alguien ya está haciendo y
// se entra. Por debajo se convierte en un reto —el mismo objeto de siempre—,
// porque competir en algo exige que ese algo tenga unas reglas y un dueño.
//
// Solo salen los hábitos públicos, y de cada uno lo justo: cómo se llama, qué
// pide y quién lo lleva. Nunca el historial de nadie.
function tablon(data, usuarioId, hoyISO) {
  const filas = [];
  for (const u of data.users) {
    if (u.id === usuarioId) continue;
    const perfil = data.profiles[u.id];
    for (const h of habitosPublicos(perfil)) {
      const reto = h.reto ? (data.retos || []).find((r) => r.id === h.reto) : null;
      // Si ya es un reto en el que estoy, no es algo a lo que unirse: ya estoy.
      if (reto && reto.participantes[usuarioId] && reto.participantes[usuarioId].estado === 'dentro') continue;
      const rango = rangoDe(perfil, h, hoyISO);
      filas.push({
        userId: u.id,
        userName: u.name,
        color: u.color,
        habitId: h.id,
        nombre: h.name,
        icono: h.icon,
        dificultad: h.dificultad,
        pauta: h.pauta,
        porMarca: rango.porMarca,
        racha: rango.racha,
        rango: { nombre: rango.nombre, division: rango.division, liga: rango.liga, estrenado: rango.estrenado },
        // Cuánta gente compite ya en esto, contando al dueño.
        compitiendo: reto ? Object.values(reto.participantes).filter((p) => p.estado === 'dentro').length : 1,
      });
    }
  }
  return filas.sort((a, b) => b.compitiendo - a.compitiendo || b.rango.liga - a.rango.liga
    || a.userName.localeCompare(b.userName));
}

app.get('/api/tablon', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  res.json({ tablon: tablon(data, usuario.id, fechaDe(req)) });
});

// Unirse al hábito público de otro. Si ese hábito ya era un reto, se entra en
// él; si no, el reto se crea aquí mismo y el hábito de su dueño pasa a ser el
// suyo dentro del reto — con su historial entero, que es lo que hace que quien
// lleva medio año no empiece de cero por dejarte entrar.
app.post('/api/tablon/unirme', (req, res) => {
  const { userId, habitId } = req.body || {};
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  if (userId === usuario.id) {
    return res.status(400).json({ error: 'Ese hábito ya es tuyo.' });
  }

  const dueñoPerfil = data.profiles[userId];
  const original = dueñoPerfil && dueñoPerfil.habits.find((h) => h.id === habitId);
  if (!original || original.publico !== true) {
    return res.status(404).json({ error: 'Ese hábito ya no está abierto a la casa.' });
  }

  const hoy = fechaDe(req);
  let reto = original.reto ? (data.retos || []).find((r) => r.id === original.reto) : null;

  if (!reto) {
    reto = {
      id: newId(),
      nombre: original.name,
      icono: original.icon,
      dificultad: original.dificultad,
      pauta: original.pauta,
      creador: userId,
      desde: hoy,
      participantes: { [userId]: { estado: 'dentro', desde: hoy } },
    };
    data.retos = [...(data.retos || []), reto];
    // El hábito que ya existía pasa a ser el del reto. No se crea otro: el
    // historial es lo que hace que su rango signifique algo.
    original.reto = reto.id;
  }

  const nuevoAqui = !reto.participantes[usuario.id];
  reto.participantes[usuario.id] = {
    estado: 'dentro',
    desde: (reto.participantes[usuario.id] || {}).desde || hoy,
  };
  if (nuevoAqui) {
    for (const [id, p] of Object.entries(reto.participantes)) {
      if (id !== usuario.id && p.estado === 'dentro') {
        dejarAviso(data, id, 'reto', `${usuario.name} se apunta a «${reto.nombre}»: a competir`);
      }
    }
  }
  normalizeRetos(data);
  sembrarHabito(data.profiles[usuario.id], data.retos.find((r) => r.id === reto.id));
  normalize(data);
  writeDataSafely(data);
  avisarRetos(data, req);
  res.json({
    ok: true,
    retos: retosDe(data, usuario.id, hoy),
    tablon: tablon(data, usuario.id, hoy),
  });
});

// Los emblemas que haya puesto el dueño en public/rangos/. Se mira la carpeta
// en cada petición a propósito: son cuatro archivos, se piden una vez al
// arrancar la app, y así soltar un PNG nuevo no obliga a reiniciar el servidor.
app.get('/api/rangos', (req, res) => {
  const dir = path.join(__dirname, 'public', 'rangos');
  let archivos = [];
  try {
    archivos = fs.readdirSync(dir).filter((f) => /\.(png|svg|webp|jpg|jpeg|gif)$/i.test(f));
  } catch (e) {
    // Sin carpeta no hay emblemas propios, que es el caso normal.
  }
  const rangos = {};
  for (const f of archivos) {
    rangos[f.replace(/\.[^.]+$/, '').toLowerCase()] = `/rangos/${encodeURIComponent(f)}`;
  }
  res.json({ rangos });
});

// ---- La autoridad de la casa ----
// Un aparato nuevo entra aquí una vez y la instala. Es lo que convierte la app
// en un sitio de fiar para el navegador, y sin eso no hay service worker ni,
// por tanto, notificaciones. Se sirve sin sesión a propósito: hace falta antes
// de poder entrar, y un certificado público no cuenta nada de nadie.
app.get('/ca', (req, res) => {
  if (!fs.existsSync(CA_CRT)) {
    return res.status(404).type('text/plain; charset=utf-8')
      .send('Esta casa todavía no tiene autoridad propia. En el equipo del servidor: npm run cert');
  }
  // El tipo importa más de lo que parece: con este, Android e iOS ofrecen
  // instalarlo en vez de enseñar el archivo como un churro de texto.
  res.type('application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="metanoia-ca.crt"');
  res.send(fs.readFileSync(CA_CRT));
});

// La llave pública, que es lo único que necesita el navegador para suscribirse.
app.get('/api/push/llave', (req, res) => {
  res.json({ llave: VAPID.publicKey });
});

// El endpoint de una suscripción es una dirección a la que este servidor va a
// mandar peticiones por su cuenta. Aceptar cualquiera lo convierte en un
// mensajero: quien llegue a la app podría hacerle tocar la puerta del router,
// de una cámara o de cualquier cosa de la red interna que no está expuesta.
//
// Los servicios de push de verdad son de Google, Mozilla o Microsoft y todos
// hablan https contra un nombre público. Con eso basta para cerrarlo.
const PUSH_LOCAL = process.env.METANOIA_PUSH_LOCAL === '1';   // solo pruebas

function endpointDeFiar(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch (e) { return false; }
  if (url.protocol !== 'https:') return false;
  if (PUSH_LOCAL) return true;

  const host = url.hostname.toLowerCase();

  // Una IPv6 llega entre corchetes: hay que quitarlos antes de mirarla, y
  // mirarla como IPv6 y no como nombre. Sin separar los tres casos, un
  // servicio legítimo como fcm.googleapis.com se parece a una fc00::/7.
  if (host.startsWith('[')) {
    const ip = host.slice(1, -1);
    if (ip === '::1' || ip === '::') return false;
    return !/^(f[cd]|fe[89ab])/.test(ip);
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 0 || a === 10) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;   // enlace local y metadatos
    return true;
  }

  // Un nombre. Los servicios de push viven en dominios públicos, con punto:
  // «localhost», «router» o «nas.local» solo pueden apuntar hacia dentro.
  if (!host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.endsWith('.localhost') || host.endsWith('.home.arpa')) return false;
  return true;
}

// Cada aparato manda su suscripción una vez. Se guarda por endpoint para que
// abrir la app dos veces en el mismo móvil no cuente como dos aparatos.
app.post('/api/push/suscribir', (req, res) => {
  const sus = req.body || {};
  if (!sus.endpoint || !sus.keys || !sus.keys.p256dh || !sus.keys.auth) {
    return res.status(400).json({ error: 'Suscripción incompleta' });
  }
  if (!endpointDeFiar(sus.endpoint)) {
    return res.status(400).json({ error: 'Esa dirección de avisos no es de un servicio de notificaciones.' });
  }
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;

  perfil.push = (perfil.push || []).filter((p) => p.endpoint !== sus.endpoint);
  perfil.push.push({
    endpoint: String(sus.endpoint).slice(0, 800),
    keys: { p256dh: String(sus.keys.p256dh), auth: String(sus.keys.auth) },
    desde: new Date().toISOString(),
  });
  writeDataSafely(data);
  res.json({ ok: true, aparatos: perfil.push.length });
});

app.post('/api/push/borrar', (req, res) => {
  const { endpoint } = req.body || {};
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  perfil.push = (perfil.push || []).filter((p) => p.endpoint !== endpoint);
  writeDataSafely(data);
  res.json({ ok: true, aparatos: perfil.push.length });
});

// Mandarse uno a sí mismo un aviso de prueba. Es la única forma de comprobar
// que la cadena entera funciona sin tener que pedirle a otro que haga algo.
app.post('/api/push/probar', async (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const perfil = data.profiles[usuario.id];
  if (!perfil.push || perfil.push.length === 0) {
    return res.status(400).json({ error: 'Este aparato todavía no está suscrito.' });
  }
  // El recuento se devuelve entero: «mandada» a secas no distingue entre que
  // haya salido y que el servicio de push la haya rechazado, y esa diferencia
  // es justo la que hace falta para saber dónde mirar.
  const cuenta = await empujar(data, usuario.id, 'Funciona: las notificaciones están activadas.');
  res.json({ ok: true, ...cuenta });
});

app.get('/api/avisos', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  res.json({ avisos: [...perfil.avisos].reverse() });
});

// Marcar la bandeja como leída. No borra: los avisos siguen ahí hasta que el
// recorte se los lleve, porque volver a mirarlos es lo normal.
app.post('/api/avisos/vistos', (req, res) => {
  const data = readData();
  const perfil = perfilDe(data, req, res);
  if (!perfil) return;
  for (const a of perfil.avisos) a.visto = true;
  writeDataSafely(data);
  res.json({ ok: true, avisos: [...perfil.avisos].reverse() });
});

app.get('/api/retos', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  res.json({ retos: retosDe(data, usuario.id, fechaDe(req)) });
});

// Retar es proponer un trato: esto se hace así, cuesta esto, y quien acepte
// juega con las mismas reglas. Quien reta entra automáticamente —proponer algo
// a lo que no te apuntas no es retar, es mandar.
app.post('/api/retos', (req, res) => {
  const { nombre, icono, pauta, invitados } = req.body || {};
  const limpio = cleanText(nombre, MAX_TAREA_CASA);
  if (!limpio) return res.status(400).json({ error: 'El reto necesita un nombre' });

  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  if ((data.retos || []).length >= MAX_RETOS) {
    return res.status(400).json({ error: `No caben más de ${MAX_RETOS} retos` });
  }

  const hoy = fechaDe(req);
  const participantes = { [usuario.id]: { estado: 'dentro', desde: hoy } };
  for (const id of Array.isArray(invitados) ? invitados : []) {
    if (id !== usuario.id && data.users.some((u) => u.id === id)) {
      participantes[id] = { estado: 'invitado', desde: '' };
    }
  }
  if (Object.keys(participantes).length < 2) {
    return res.status(400).json({ error: 'Un reto necesita a alguien más: invita al menos a una persona.' });
  }

  const reto = {
    id: newId(),
    nombre: limpio,
    icono: cleanText(icono, MAX_ICONO) || DEFAULT_ICON,
    pauta,
    creador: usuario.id,
    desde: hoy,
    participantes,
  };
  data.retos = [...(data.retos || []), reto];
  normalizeRetos(data);
  sembrarHabito(data.profiles[usuario.id], data.retos.find((r) => r.id === reto.id));
  for (const id of Object.keys(participantes)) {
    if (id !== usuario.id) {
      dejarAviso(data, id, 'reto', `${usuario.name} te reta a «${limpio}»`);
    }
  }
  normalize(data);
  writeDataSafely(data);
  avisarRetos(data, req);
  res.json({ ok: true, retos: retosDe(data, usuario.id, hoy) });
});

// Aceptar. Aquí es donde se pacta el precio: entrar es aceptar la dificultad y
// la pauta que puso quien retó, sin poder tocarlas después.
app.post('/api/retos/:id/entrar', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const reto = buscarReto(data, req.params.id, res);
  if (!reto) return;
  if (!reto.participantes[usuario.id]) {
    return res.status(403).json({ error: 'A este reto no te ha invitado nadie.' });
  }

  const hoy = fechaDe(req);
  const previo = reto.participantes[usuario.id];
  // Volver después de haberse ido conserva la fecha original: el historial no
  // se borra, y con él tampoco la caída que provocó irse.
  const volviendo = previo.estado === 'fuera';
  reto.participantes[usuario.id] = { estado: 'dentro', desde: previo.desde || hoy };
  sembrarHabito(data.profiles[usuario.id], reto);
  for (const [id, p] of Object.entries(reto.participantes)) {
    if (id !== usuario.id && p.estado === 'dentro') {
      dejarAviso(data, id, 'reto', volviendo
        ? `${usuario.name} vuelve a «${reto.nombre}»`
        : `${usuario.name} acepta «${reto.nombre}»`);
    }
  }
  normalize(data);
  writeDataSafely(data);
  avisarRetos(data, req);
  res.json({ ok: true, retos: retosDe(data, usuario.id, hoy) });
});

// Irse es rendirse, y se nota: el hábito enlazado desaparece de la lista pero
// su historial se queda. Volver no reinicia nada — si no, salir y entrar sería
// la manera de limpiar una mala racha.
app.post('/api/retos/:id/salir', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const reto = buscarReto(data, req.params.id, res);
  if (!reto) return;
  if (!reto.participantes[usuario.id]) {
    return res.status(403).json({ error: 'No estás en este reto.' });
  }

  reto.participantes[usuario.id].estado = 'fuera';
  const perfil = data.profiles[usuario.id];
  perfil.habits = perfil.habits.filter((h) => h.reto !== reto.id);
  for (const [id, p] of Object.entries(reto.participantes)) {
    if (id !== usuario.id && p.estado === 'dentro') {
      dejarAviso(data, id, 'reto', `${usuario.name} se rinde en «${reto.nombre}»`);
    }
  }
  normalize(data);
  writeDataSafely(data);
  avisarRetos(data, req);
  res.json({ ok: true, retos: retosDe(data, usuario.id, fechaDe(req)) });
});

// Cancelarlo del todo solo lo puede hacer quien lo propuso, y se lleva el
// hábito enlazado de todos: el reto era el dueño de ese hábito, no ellos.
app.delete('/api/retos/:id', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  const reto = buscarReto(data, req.params.id, res);
  if (!reto) return;
  if (reto.creador !== usuario.id) {
    return res.status(403).json({ error: 'Solo quien propuso el reto puede cancelarlo.' });
  }

  for (const id of Object.keys(reto.participantes)) {
    const perfil = data.profiles[id];
    if (perfil) perfil.habits = perfil.habits.filter((h) => h.reto !== reto.id);
    if (id !== usuario.id) {
      dejarAviso(data, id, 'reto', `${usuario.name} canceló «${reto.nombre}»`);
    }
  }
  data.retos = data.retos.filter((r) => r.id !== reto.id);
  normalize(data);
  writeDataSafely(data);
  avisarRetos(data, req);
  res.json({ ok: true, retos: retosDe(data, usuario.id, fechaDe(req)) });
});

// ---- La tabla de la casa ----
// Solo números y, como mucho, cuántos hábitos ha abierto cada quien. Nunca cómo
// se llaman: un hábito privado no sale de su perfil ni en un recuento cruzado.
function tablaLiga(data, hoyISO) {
  return data.users
    .filter((u) => u.compite !== false)
    .map((u) => {
      const perfil = data.profiles[u.id];
      const publicos = habitosPublicos(perfil);
      const tocanHoy = publicos.filter((h) => tocaEse(perfil, h, hoyISO));
      // Solo de los públicos: el rango de un hábito privado es tan privado
      // como el hábito. Si no ha publicado nada, no tiene rango que enseñar.
      const rangos = publicos.map((h) => rangoDe(perfil, h, hoyISO)).filter((r) => r.estrenado);
      const mejor = rangos.sort((a, b) => b.rr - a.rr)[0] || null;
      return {
        id: u.id,
        name: u.name,
        color: u.color,
        publicos: publicos.length,
        racha: rachaPerfecta(perfil, hoyISO),
        puntos: puntosDeLaSemana(perfil, hoyISO),
        hoyTocan: tocanHoy.length,
        hoyHechos: tocanHoy.filter((h) => hechoEse(perfil, hoyISO, h.id)).length,
        mejorRango: mejor ? { nombre: mejor.nombre, division: mejor.division, liga: mejor.liga } : null,
        abandonados: publicos.filter((h) => rangoDe(perfil, h, hoyISO).abandonado).length,
      };
    })
    // Manda la racha; a igualdad, los puntos de la semana. Se ordena aquí y no
    // en el cliente para que las tres pantallas vean el mismo orden siempre.
    .sort((a, b) => b.racha - a.racha || b.puntos - a.puntos || a.name.localeCompare(b.name));
}

// `marca` viaja solo cuando lo que movió la tabla fue una marca pública recién
// puesta. Es lo que separa «algo cambió» de «Ana acaba de correr»: sin el
// nombre del hábito, la otra pantalla puede refrescar la tabla pero no puede
// contar lo que pasó, y contarlo es justo lo que hace que esto compita.
function avisarLiga(data, req, marca = '') {
  const quien = data.users.find((u) => u.id === (req.get('X-Usuario') || ''));
  avisar('liga', { quien: quien ? quien.name : '', marca }, req);
}

app.get('/api/liga', (req, res) => {
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  // Sin `hoy` se cae a la fecha del servidor, que solo coincide si están en el
  // mismo huso. El cliente siempre la manda; esto es el paracaídas.
  const hoy = isoDateOrEmpty(req.query.hoy) || new Date().toISOString().slice(0, 10);
  res.json({ hoy, semana: lunesDe(hoy), liga: tablaLiga(data, hoy) });
});

// Entrar a un perfil. Si no tiene contraseña se entra y ya —no hay vale que
// dar—; si la tiene, acertarla devuelve el vale de sesión que el cliente
// mandará en cada petición a partir de aquí.
app.post('/api/sesion', (req, res) => {
  const { id, clave } = req.body || {};
  const data = readData();
  const usuario = data.users.find((u) => u.id === id);
  if (!usuario) return res.status(404).json({ error: 'Ese perfil ya no está en la casa.' });

  if (!claveGuardada(usuario.clave)) {
    return res.json({ ok: true, sesion: '', user: usuariosPublicos(data).find((u) => u.id === id) });
  }

  const espera = segundosDeCastigo(usuario.id);
  if (espera) {
    return res.status(429).json({ error: `Demasiados intentos. Espera ${espera} s.`, clave: true });
  }
  if (!claveCorrecta(usuario, clave)) {
    anotarFallo(usuario.id);
    return res.status(401).json({ error: 'Esa no es la contraseña.', clave: true });
  }

  intentos.delete(usuario.id);
  const vale = abrirSesion(data, usuario);
  writeDataSafely(data);
  res.json({ ok: true, sesion: vale, user: usuariosPublicos(data).find((u) => u.id === id) });
});

// Salir. Solo tira el vale de esta pantalla: las demás siguen dentro.
app.delete('/api/sesion', (req, res) => {
  const vale = req.get('X-Sesion') || '';
  const data = readData();
  if (data.sesiones[vale]) {
    delete data.sesiones[vale];
    writeDataSafely(data);
  }
  res.json({ ok: true });
});

// Poner, cambiar o quitar la contraseña propia. Nadie puede tocar la de otro,
// ni siquiera para quitarla: es lo único de esta app que no se arregla entre
// todos. Y para cambiarla hay que saber la que hay, aunque la sesión ya esté
// abierta: una pantalla que alguien dejó desbloqueada no es un permiso.
app.post('/api/users/:id/clave', (req, res) => {
  const { actual, nueva } = req.body || {};
  const data = readData();
  const usuario = usuarioDe(data, req, res);
  if (!usuario) return;
  if (usuario.id !== req.params.id) {
    return res.status(403).json({ error: 'La contraseña de cada quien la cambia esa persona.' });
  }
  if (typeof nueva !== 'string') {
    return res.status(400).json({ error: 'Falta la contraseña nueva' });
  }

  const espera = segundosDeCastigo(usuario.id);
  if (espera) return res.status(429).json({ error: `Demasiados intentos. Espera ${espera} s.` });
  if (claveGuardada(usuario.clave) && !claveCorrecta(usuario, actual)) {
    anotarFallo(usuario.id);
    return res.status(401).json({ error: 'La contraseña de ahora no es esa.' });
  }
  intentos.delete(usuario.id);

  if (nueva !== '' && (nueva.length < MIN_CLAVE || nueva.length > MAX_CLAVE)) {
    return res.status(400).json({
      error: `La contraseña va de ${MIN_CLAVE} a ${MAX_CLAVE} caracteres.`,
    });
  }

  let vale = '';
  if (nueva === '') {
    delete usuario.clave;
  } else {
    usuario.clave = claveNueva(nueva);
    // Cambiar la contraseña echa a las demás pantallas de este perfil. Es la
    // única manera de recuperarlo si se quedó abierto donde no debía.
    for (const [v, ses] of Object.entries(data.sesiones)) {
      if (ses.user === usuario.id) delete data.sesiones[v];
    }
    vale = abrirSesion(data, usuario);
  }

  normalize(data);
  writeDataSafely(data);
  avisar('usuarios', { users: usuariosPublicos(data), casa: data.casa }, req);
  const publicos = usuariosPublicos(data);
  res.json({ ok: true, sesion: vale, users: publicos, user: publicos.find((u) => u.id === usuario.id) });
});

// Quién vive aquí. Es pública a propósito: es la lista que se pinta en la
// pantalla de «quién eres», antes de que nadie haya elegido perfil todavía.
// Lleva el candado de cada quien, nunca su contraseña ni de qué está hecha.
app.get('/api/users', (req, res) => {
  const data = readData();
  res.json({ users: usuariosPublicos(data) });
});

app.post('/api/users', (req, res) => {
  const { name, color, clave } = req.body || {};
  const limpio = cleanText(name, MAX_PERSONA_NOMBRE);
  if (!limpio) return res.status(400).json({ error: 'La persona necesita un nombre' });
  if (typeof clave === 'string' && clave !== '' && (clave.length < MIN_CLAVE || clave.length > MAX_CLAVE)) {
    return res.status(400).json({ error: `La contraseña va de ${MIN_CLAVE} a ${MAX_CLAVE} caracteres.` });
  }

  const data = readData();
  if (data.users.length >= MAX_PERSONAS) {
    return res.status(400).json({ error: `No caben más de ${MAX_PERSONAS} personas` });
  }
  const usuario = { id: newId(), name: limpio, color, order: data.users.length };
  // Se puede nacer con contraseña puesta: quien la quiere, la quiere desde el
  // primer minuto y no después de haber escrito ya tres notas.
  if (typeof clave === 'string' && clave !== '') usuario.clave = claveNueva(clave);
  data.users.push(usuario);
  // normalize() le monta el perfil con sus hábitos por defecto.
  normalize(data);
  // normalize() reconstruye los objetos, así que el de arriba ya no es el que
  // quedó guardado: hay que volver a buscarlo por id para abrirle la sesión.
  const creado = data.users.find((u) => u.id === usuario.id);
  const sesion = claveGuardada(creado.clave) ? abrirSesion(data, creado) : '';
  writeDataSafely(data);
  avisar('usuarios', { users: usuariosPublicos(data), casa: data.casa }, req);
  // Se devuelve también quién acaba de nacer: el cliente entra directo a ese
  // perfil sin tener que buscarlo en la lista.
  const publicos = usuariosPublicos(data);
  res.json({
    ok: true,
    users: publicos,
    casa: data.casa,
    sesion,
    user: publicos.find((u) => u.id === usuario.id),
  });
});

app.patch('/api/users/:id', (req, res) => {
  const data = readData();
  const usuario = data.users.find((u) => u.id === req.params.id);
  if (!usuario) return res.status(404).json({ error: `Persona no encontrada: ${req.params.id}` });

  if (!puedeTocar(data, usuario, req)) {
    return res.status(403).json({
      error: `${usuario.name} le puso contraseña a su perfil: solo esa persona lo cambia.`,
    });
  }

  const { name, color } = req.body || {};
  if (typeof name === 'string') {
    const limpio = cleanText(name, MAX_PERSONA_NOMBRE);
    if (!limpio) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    usuario.name = limpio;
  }
  if (typeof color === 'string') usuario.color = hexOrEmpty(color, usuario.color) || usuario.color;
  if (typeof req.body.compite === 'boolean') usuario.compite = req.body.compite;

  normalize(data);
  writeDataSafely(data);
  avisar('usuarios', { users: usuariosPublicos(data), casa: data.casa }, req);
  res.json({ ok: true, users: usuariosPublicos(data), casa: data.casa });
});

// Quitar a alguien se lleva sus hábitos, su historial, sus notas y su trabajo:
// el perfil ES esos datos. Las tareas de la casa se quedan, sin dueño en las
// casillas que tenía. Y no se puede quitar al último: la app se quedaría sin
// nadie y sin manera de volver a entrar a lo que quedara dentro.
app.delete('/api/users/:id', (req, res) => {
  const data = readData();
  const idx = data.users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: `Persona no encontrada: ${req.params.id}` });
  }
  if (data.users.length === 1) {
    return res.status(400).json({ error: 'No puedes quitar el último perfil: alguien tiene que quedarse.' });
  }
  if (!puedeTocar(data, data.users[idx], req)) {
    return res.status(403).json({
      error: `${data.users[idx].name} le puso contraseña a su perfil: solo esa persona puede quitarlo.`,
    });
  }

  data.users.splice(idx, 1);
  delete data.profiles[req.params.id];
  normalize(data);
  writeDataSafely(data);
  // Sus imágenes pegadas ya no las reclama ninguna nota.
  barrerAdjuntosHuerfanos(data);
  avisar('usuarios', { users: usuariosPublicos(data), casa: data.casa }, req);
  res.json({ ok: true, users: usuariosPublicos(data), casa: data.casa });
});

// Los campos llegan en bruto y los limpia normalizeCasa(): la tarea nueva pasa
// por exactamente el mismo filtro que las que ya estaban guardadas.
app.post('/api/casa/chores', (req, res) => {
  const { name, icon, time, note, assign, cada } = req.body || {};
  const limpio = cleanText(name, MAX_TAREA_CASA);
  if (!limpio) return res.status(400).json({ error: 'La tarea necesita un nombre' });
  if (typeof time === 'string' && time !== '' && !HORA.test(time)) {
    return res.status(400).json({ error: `Hora inválida: ${time}` });
  }

  const data = readData();
  if (data.casa.chores.length >= MAX_TAREAS_CASA) {
    return res.status(400).json({ error: `No caben más de ${MAX_TAREAS_CASA} tareas de casa` });
  }
  data.casa.chores.push({
    id: newId(),
    name: limpio,
    icon,
    time,
    note,
    cada,
    assign,
    order: data.casa.chores.length,
  });
  normalizeCasa(data);
  writeDataSafely(data);
  okCasa(res, data, req, `añadió la tarea «${limpio}»`);
});

app.patch('/api/casa/chores/:id', (req, res) => {
  const data = readData();
  const tarea = findTareaCasa(data, req.params.id, res);
  if (!tarea) return;

  const { name, icon, time, note, cada } = req.body || {};
  if (typeof name === 'string') {
    const limpio = cleanText(name, MAX_TAREA_CASA);
    if (!limpio) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    tarea.name = limpio;
  }
  if (typeof cada === 'string') tarea.cada = oneOf(cada, FRECUENCIAS_CASA, tarea.cada);
  if (typeof icon === 'string') tarea.icon = cleanText(icon, MAX_ICONO) || tarea.icon;
  if (typeof time === 'string') {
    if (time !== '' && !HORA.test(time)) {
      return res.status(400).json({ error: `Hora inválida: ${time}` });
    }
    tarea.time = time;
  }
  if (typeof note === 'string') tarea.note = cleanText(note, MAX_TAREA_CASA_NOTA);

  normalizeCasa(data);
  writeDataSafely(data);
  okCasa(res, data, req, `cambió «${tarea.name}»`);
});

app.delete('/api/casa/chores/:id', (req, res) => {
  const data = readData();
  const idx = data.casa.chores.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: `Tarea de casa no encontrada: ${req.params.id}` });
  }
  const nombreBorrado = data.casa.chores[idx].name;
  data.casa.chores.splice(idx, 1);
  // La normalización se lleva por delante las marcas de la tarea borrada.
  normalizeCasa(data);
  writeDataSafely(data);
  okCasa(res, data, req, `quitó la tarea «${nombreBorrado}»`);
});

// Quién se encarga de una tarea un día de la semana (0 = lunes). Un
// `personId` vacío deja la casilla libre.
app.post('/api/casa/assign', (req, res) => {
  const { choreId, day, personId } = req.body || {};
  const dia = Number(day);
  if (!Number.isInteger(dia) || dia < 0 || dia >= CASA_DIAS) {
    return res.status(400).json({ error: `Día fuera de rango: ${day}` });
  }

  const data = readData();
  const tarea = findTareaCasa(data, choreId, res);
  if (!tarea) return;

  const quien = typeof personId === 'string' ? personId : '';
  if (quien && !data.users.some((u) => u.id === quien)) {
    return res.status(404).json({ error: `Persona no encontrada: ${quien}` });
  }
  tarea.assign[dia] = quien;
  writeDataSafely(data);
  okCasa(res, data, req, `repartió «${tarea.name}» del ${DIAS_LARGOS[dia]}`);
});

// Marca o desmarca una tarea de casa en una fecha. Es lo único que separa el
// plan de lo que de verdad pasó ese día.
app.post('/api/casa/mark', (req, res) => {
  const { choreId, date, done } = req.body || {};
  if (!ISO_DATE.test(date || '')) return res.status(400).json({ error: `Fecha inválida: ${date}` });

  const data = readData();
  const tarea = findTareaCasa(data, choreId, res);
  if (!tarea) return;

  const marcadas = new Set(data.casa.done[date] || []);
  if (done === false) marcadas.delete(tarea.id);
  else marcadas.add(tarea.id);

  // Los días sin nada marcado no se guardan: el archivo acumula historia real,
  // no una entrada vacía por cada fecha que alguien haya mirado.
  if (marcadas.size > 0) data.casa.done[date] = [...marcadas];
  else delete data.casa.done[date];

  writeDataSafely(data);
  okCasa(res, data, req);
});

// Las direcciones IPv4 de las tarjetas de red reales: son las que sirven para
// que otro dispositivo de la casa escriba la URL y entre.
// Un equipo suele tener más direcciones que redes: una VPN, una máquina
// virtual, una tarjeta sin cable enchufado. Todas salen de networkInterfaces()
// con la misma pinta, y dar la equivocada es la forma más rápida de que a otra
// persona la app «no le abra» sin ninguna pista de por qué. Así que se separan:
// primero las de una red doméstica de verdad, y el resto avisadas.
const RANGOS_DE_CASA = [
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function direccionesDeRed() {
  const todas = Object.entries(os.networkInterfaces())
    .flatMap(([nombre, redes]) => (redes || []).map((red) => ({ ...red, nombre })))
    .filter((red) => red && red.family === 'IPv4' && !red.internal)
    // 169.254.x es lo que se pone Windows solo cuando no consiguió dirección:
    // no es una red, es el síntoma de que ese cable no lleva a ningún sitio.
    .filter((red) => !red.address.startsWith('169.254.'));

  const deCasa = todas.filter((red) => RANGOS_DE_CASA.some((r) => r.test(red.address)));
  const otras = todas.filter((red) => !deCasa.includes(red));
  return { deCasa, otras };
}

// ---- Arranque ----
// El certificado es propio y sin firmar por nadie, así que cada dispositivo
// tiene que aceptarlo una vez; a cambio, la app pasa a ser contexto seguro y
// con eso se desbloquean las notificaciones y el service worker, que es lo
// único que hace que un aviso llegue con la app cerrada.
//
// El día que la app pasó de http a https, los favoritos que la gente de casa
// tenía guardados dejaron de abrir: seguían apuntando a http://...:4173 y ahí
// ya solo había un TLS que respondía con un error de protocolo, o sea una
// pantalla en blanco sin explicación. Un enlace que alguien guardó es una
// promesa, y cambiar el protocolo por dentro no debería romperla. Así que el
// puerto atiende los dos: se mira el primer byte de cada conexión y se decide.

function certificado() {
  // Las pruebas corren sin TLS: montar un cliente que acepte un certificado sin
  // firmar en trece suites es ruido que no prueba nada de la app. El HTTPS
  // tiene su propia prueba, que es donde ese detalle sí importa.
  if (process.env.METANOIA_SIN_TLS) return null;
  try {
    return { key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT_CRT) };
  } catch (e) {
    return null;
  }
}

function contarPuertas(seguro) {
  const protocolo = seguro ? 'https' : 'http';
  console.log(`Metanoia corriendo en ${protocolo}://localhost:${PORT}`);
  const { deCasa, otras } = direccionesDeRed();
  if (deCasa.length === 0 && otras.length === 0) {
    console.log('Sin red: por ahora solo se puede abrir desde este equipo.');
    return;
  }

  if (deCasa.length) {
    console.log('\nEsta es la dirección que hay que dar a quien viva contigo:');
    for (const red of deCasa) console.log(`  ${protocolo}://${red.address}:${PORT}   (${red.nombre})`);
  }
  if (otras.length) {
    console.log(deCasa.length
      ? '\nEstas otras salen del mismo equipo pero no son la red de casa (VPN, máquinas virtuales):'
      : '\nNinguna dirección parece de una red doméstica. Estas son las que hay:');
    for (const red of otras) console.log(`  ${protocolo}://${red.address}:${PORT}   (${red.nombre})`);
  }

  if (seguro) {
    if (fs.existsSync(CA_CRT)) {
      console.log('\nCada aparato instala la autoridad de la casa UNA vez. Sin eso el');
      console.log('navegador deja ver la app pero NO deja que lleguen las notificaciones.');
      console.log('  en este equipo:  npm run confiar');
      const donde = deCasa[0] || otras[0];
      if (donde) console.log(`  en los demás:     abrir  https://${donde.address}:${PORT}/ca  en el aparato`);
    } else {
      console.log('\nNo hay autoridad de la casa en cert/: el navegador va a avisar de que la');
      console.log('conexión no es privada, y aunque se acepte, las notificaciones no llegan.');
      console.log('Se arregla con:  npm run cert  y luego  npm run confiar');
    }
    console.log('\nQuien entre por http a este mismo puerto —un favorito viejo— va solo a https.');
    console.log(`Y en ${PORT_HTTP} hay otro HTTP que redirige aquí, por si alguien teclea el puerto de al lado.`);
  } else {
    console.log('\nSin certificado en cert/. La app funciona, pero al no ser contexto seguro');
    console.log('el navegador no deja mandar notificaciones desde otro dispositivo.');
  }

  console.log('\nSi no abre desde el otro dispositivo, casi siempre es el cortafuegos.');
  console.log('En PowerShell como administrador, una sola vez:');
  console.log(`  netsh advfirewall firewall add rule name="Metanoia ${PORT}" dir=in action=allow protocol=TCP localport=${PORT} profile=private`);
  console.log(`  netsh advfirewall firewall add rule name="Metanoia ${PORT_HTTP}" dir=in action=allow protocol=TCP localport=${PORT_HTTP} profile=private`);
}

const cert = certificado();
// El reloj vive con el servidor: mientras haya alguien escuchando, hay quien
// recuerde.
arrancarReloj();
if (cert) {
  const servidorSeguro = https.createServer(cert, app);

  // Este no sirve la app: solo empuja al HTTPS. Sin él, quien llegue por http
  // se queda mirando una página que no carga sin decir por qué. El 301 es a
  // propósito: el navegador se lo apunta y a partir de la segunda vez ni
  // siquiera pregunta, con lo que el favorito viejo queda arreglado en origen.
  const alSeguro = http.createServer((req, res) => {
    const anfitrion = (req.headers.host || '').split(':')[0] || 'localhost';
    res.writeHead(301, { Location: `https://${anfitrion}:${PORT}${req.url}` });
    res.end();
  });

  // 0.0.0.0 y no localhost: si escucha solo en el bucle local, la app solo
  // existe para este ordenador y no hay nada que compartir.
  //
  // Un saludo TLS empieza siempre por 0x16 (handshake), y una petición HTTP en
  // claro empieza por una letra mayúscula: GET, POST, HEAD. Con mirar el primer
  // byte sin consumirlo basta para saber con quién se habla y entregarle la
  // conexión al servidor que corresponda.
  net.createServer((socket) => {
    // Antes del reparto nadie más cuida de este socket, así que hay que hacerlo
    // aquí: un escaneo de puertos que abre y cierra no puede tumbar el proceso,
    // y uno que abre y no dice nada no puede quedarse colgado para siempre.
    const rendirse = () => socket.destroy();
    socket.on('error', rendirse);
    socket.setTimeout(15000, rendirse);

    const repartir = () => {
      const primero = socket.read(1);
      if (primero === null) {
        // 'readable' también salta al cerrarse por el otro lado; ahí no hay nada
        // que leer ni a quién entregar.
        if (socket.readableEnded || socket.destroyed) return socket.destroy();
        return socket.once('readable', repartir);
      }
      socket.unshift(primero);   // el byte vuelve a la cola: el otro lo necesita entero
      // Y se sueltan las dos redes de seguridad: a partir de aquí el socket es
      // del servidor que lo recibe. Dejar el temporizador puesto cortaría las
      // conexiones largas y calladas, que son justo las de los avisos en vivo.
      socket.setTimeout(0);
      socket.removeListener('timeout', rendirse);
      socket.removeListener('error', rendirse);
      (primero[0] === 0x16 ? servidorSeguro : alSeguro).emit('connection', socket);
    };
    socket.once('readable', repartir);
  }).listen(PORT, '0.0.0.0', () => contarPuertas(true));

  alSeguro.listen(PORT_HTTP, '0.0.0.0');
} else {
  app.listen(PORT, '0.0.0.0', () => contarPuertas(false));
}
