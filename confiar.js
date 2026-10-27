// Instala la autoridad de la casa en este equipo:  npm run confiar
//
// Sin esto el navegador enseña el aviso de «la conexión no es privada», y
// aunque se acepte —la página se ve igual— Chrome se niega a registrar el
// service worker. El resultado es una app que funciona y unas notificaciones
// que no llegan nunca sin decir por qué. Instalar la autoridad quita el aviso
// y con él el bloqueo.
//
// Va al almacén del usuario y no al de la máquina a propósito: el del usuario
// no pide permisos de administrador, y Chrome y Edge lo leen igual. Menos
// fricción para algo que hay que hacer en cada aparato de la casa.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CA_CRT = path.join(__dirname, 'cert', 'metanoia-ca.crt');

if (!fs.existsSync(CA_CRT)) {
  console.error('No hay autoridad que instalar. Créala antes con:  npm run cert');
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.log('Esto solo sabe hacerlo en Windows. En otro sistema hay que');
  console.log(`instalar a mano ${CA_CRT} como autoridad de confianza.`);
  process.exit(1);
}

const r = spawnSync('certutil', ['-user', '-addstore', '-f', 'Root', CA_CRT], { encoding: 'utf8' });
if (r.error || r.status !== 0) {
  console.error('No se pudo instalar la autoridad.');
  console.error(r.error ? r.error.message : (r.stdout || '') + (r.stderr || ''));
  process.exit(1);
}

console.log('Autoridad de la casa instalada en este equipo.');
console.log('Cierra Chrome del todo y vuelve a abrirlo: el certificado se lee al arrancar.');
console.log('Después, la campana de la app debería activar las notificaciones sin avisos.');
