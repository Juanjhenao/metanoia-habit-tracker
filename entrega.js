// Donde se para el mensaje. Se suscribe un Brave que yo controlo, se le manda
// un push desde node, y se mira si el service worker lo recibio. Separa las dos
// historias posibles:
//   - llega al navegador  -> el push funciona y quien lo calla es Windows
//   - no llega            -> el problema esta antes, en Brave o en el canal
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const BRAVE = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const PERFIL = path.join(__dirname, 'brave-entrega');
const PUERTO = 9344;
const ORIGEN = 'https://192.168.1.11:4173';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (ruta, m = 'GET') => (await fetch(`http://127.0.0.1:${PUERTO}${ruta}`, { method: m })).json();

class Sesion {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); }
  static async abrir(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Sesion(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && s.pend.has(m.id)) {
        const { res, rej } = s.pend.get(m.id); s.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return s;
  }
  enviar(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pend.set(id, { res, rej });
      setTimeout(() => { if (this.pend.delete(id)) rej(new Error(`${method}: sin respuesta`)); }, 90000);
    });
  }
  async evaluar(expr) {
    const r = await this.enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'excepcion');
    return r.result.value;
  }
}

(async () => {
  fs.rmSync(PERFIL, { recursive: true, force: true });
  const dir = path.join(PERFIL, 'Default');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Preferences'),
    JSON.stringify({ brave: { gcm: { channel_status: true } } }));

  const brave = spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let arriba = false;
  for (let i = 0; i < 40 && !arriba; i++) { await dormir(500); try { await json('/json/list'); arriba = true; } catch (e) {} }
  if (!arriba) { console.log('MAL: Brave no abrio el puerto'); process.exit(1); }

  const nav = await json(`/json/new?${encodeURIComponent(ORIGEN + '/')}`, 'PUT');
  const s = await Sesion.abrir(nav.webSocketDebuggerUrl);
  await s.enviar('Runtime.enable');
  await s.enviar('Browser.grantPermissions', { origin: ORIGEN, permissions: ['notifications'] });
  await dormir(5000);

  const sus = await s.evaluar(`(async()=>{
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { llave } = await fetch('/api/push/llave').then(r=>r.json());
    const relleno = '='.repeat((4 - (llave.length % 4)) % 4);
    const b64 = (llave + relleno).replace(/-/g,'+').replace(/_/g,'/');
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const s = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: bytes });
    return JSON.stringify(s.toJSON());
  })()`);
  console.log('suscrito en Brave:', new URL(JSON.parse(sus).endpoint).host);

  const V = JSON.parse(fs.readFileSync('D:/Business/habit-tracker/cert/vapid.json', 'utf8'));
  webpush.setVapidDetails('mailto:metanoia@casa.local', V.publicKey, V.privateKey);
  try {
    const r = await webpush.sendNotification(JSON.parse(sus),
      JSON.stringify({ titulo: 'Metanoia', texto: 'Prueba de entrega a Brave' }));
    console.log('Google acepto el envio: HTTP', r.statusCode);
  } catch (e) {
    console.log('Google RECHAZO el envio');
    console.log('   codigo :', e.statusCode);
    console.log('   cuerpo :', String(e.body || e.message).slice(0, 400).replace(/
/g, ' '));
    console.log('   destino:', JSON.parse(sus).endpoint.slice(0, 70));
  }

  process.stdout.write('esperando a que el service worker lo reciba');
  let visto = '';
  for (let i = 0; i < 45; i++) {
    await dormir(1000);
    process.stdout.write('.');
    visto = await s.evaluar(`(async()=>{ const r = await navigator.serviceWorker.ready; const n = await r.getNotifications(); return n.map(x=>x.body).join('|'); })()`);
    if (visto) break;
  }
  console.log('');
  console.log(visto
    ? `LLEGO al navegador: "${visto}"\n   -> el push funciona de punta a punta en Brave.`
    : 'NO llego al navegador en 45 segundos.\n   -> el mensaje se para antes de Brave.');

  await s.enviar('Browser.close').catch(() => {});
  brave.kill();
  process.exit(visto ? 0 : 1);
})().catch((e) => { console.error('EXPLOTO:', e.message); process.exit(1); });
