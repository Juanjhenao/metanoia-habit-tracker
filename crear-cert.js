// Rehace el certificado de la casa.
//
// El certificado no se versiona —dentro va la llave privada— así que en un
// equipo nuevo la carpeta cert/ no existe y el servidor arranca en HTTP a secas.
// Funciona, pero sin contexto seguro no hay notificaciones ni service worker.
// Esto lo vuelve a crear:  npm run cert
//
// Son DOS certificados y no uno, y la diferencia es justo la que hacía que las
// notificaciones no llegaran nunca:
//
//   - La autoridad de la casa (metanoia-ca.crt). Es la que cada aparato instala
//     una sola vez, y a partir de ahí se cree lo que ella firme.
//   - El del servidor (metanoia.crt), firmado por la anterior, con la lista de
//     direcciones por las que se entra a la app.
//
// Con un solo certificado sin firmar por nadie, el navegador deja continuar
// tras el aviso —la página se ve— pero se niega a registrar el service worker
// con un SecurityError. Y sin service worker no hay suscripción a las
// notificaciones, así que no llega ni una: se ve la app y falla lo demás en
// silencio, que es la peor forma de fallar. Con la autoridad instalada no hay
// aviso, no hay excepción que aceptar, y el service worker registra.
//
// La autoridad se crea una sola vez y no se toca. Cuando cambie la IP del
// equipo basta con rehacer el del servidor: se vuelve a firmar con la misma
// autoridad, y nadie tiene que reinstalar nada en su móvil.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CERT_DIR = path.join(__dirname, 'cert');
const CA_CRT = path.join(CERT_DIR, 'metanoia-ca.crt');
const CA_KEY = path.join(CERT_DIR, 'metanoia-ca.key');
const CNF = path.join(CERT_DIR, 'openssl.cnf');
const CRT = path.join(CERT_DIR, 'metanoia.crt');
const KEY = path.join(CERT_DIR, 'metanoia.key');
const CSR = path.join(CERT_DIR, 'metanoia.csr');

function openssl(args, que) {
  const r = spawnSync('openssl', args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`No se pudo ${que}. ¿Está openssl instalado?`);
    console.error(r.error ? r.error.message : r.stderr);
    process.exit(1);
  }
}

// Las direcciones del equipo en redes locales. Cada una tiene que estar
// nombrada en el certificado o el navegador lo rechaza sin remedio.
function ipsLocales() {
  const vistas = [];
  for (const [nombre, redes] of Object.entries(os.networkInterfaces())) {
    for (const red of redes || []) {
      if (red.family !== 'IPv4' || red.internal) continue;
      vistas.push({ nombre, address: red.address });
    }
  }
  return vistas;
}

fs.mkdirSync(CERT_DIR, { recursive: true });

// ---- 1. La autoridad de la casa ----
// Solo si no existe. Rehacerla obligaría a todos los aparatos a instalar la
// nueva, y ese es exactamente el trabajo que este montaje existe para evitar.
const rehacerCA = process.argv.includes('--rehacer-autoridad');
const habiaCA = fs.existsSync(CA_CRT) && fs.existsSync(CA_KEY);
if (!habiaCA || rehacerCA) {
  fs.writeFileSync(path.join(CERT_DIR, 'ca.cnf'), `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no

[dn]
CN = Metanoia (casa)
O = Metanoia

[v3]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
`, 'utf8');
  // Veinte años: esta no protege de nadie, solo desbloquea el contexto seguro.
  // Que caduque es una avería futura sin ninguna ganancia a cambio.
  openssl(['req', '-x509', '-nodes', '-newkey', 'rsa:2048',
    '-keyout', CA_KEY, '-out', CA_CRT,
    '-days', '7300', '-config', path.join(CERT_DIR, 'ca.cnf')], 'crear la autoridad');
  console.log(habiaCA ? 'Autoridad REHECHA: todos los aparatos tendrán que instalarla otra vez.'
    : 'Autoridad de la casa creada en cert/metanoia-ca.crt');
} else {
  console.log('Autoridad de la casa: la de siempre, sin tocar (nadie tiene que reinstalar nada).');
}

// ---- 2. El certificado del servidor, firmado por ella ----
const ips = ipsLocales();
if (ips.length === 0) console.log('Sin red: el certificado solo va a valer para localhost.');

const alt = ['DNS.1 = localhost', 'IP.1 = 127.0.0.1'];
ips.forEach((red, i) => alt.push(`IP.${i + 2} = ${red.address}`));

fs.writeFileSync(CNF, `[req]
distinguished_name = dn
prompt = no

[dn]
CN = Metanoia

[v3]
subjectAltName = @alt
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
authorityKeyIdentifier = keyid,issuer

[alt]
${alt.join('\n')}
`, 'utf8');

openssl(['req', '-new', '-nodes', '-newkey', 'rsa:2048',
  '-keyout', KEY, '-out', CSR, '-config', CNF], 'crear la petición del certificado');

// 825 días es el techo que respetan los navegadores para un certificado de
// servidor. Pedir diez años aquí es la forma de que alguno lo rechace de plano.
openssl(['x509', '-req', '-in', CSR, '-CA', CA_CRT, '-CAkey', CA_KEY,
  '-CAcreateserial', '-out', CRT, '-days', '825',
  '-extfile', CNF, '-extensions', 'v3'], 'firmar el certificado del servidor');

fs.unlinkSync(CSR);

console.log('\nCertificado del servidor nuevo. Cubre:');
console.log('  localhost, 127.0.0.1');
for (const red of ips) console.log(`  ${red.address}   (${red.nombre})`);

console.log('\nPara que las notificaciones funcionen, cada aparato instala la');
console.log('autoridad UNA vez. En este equipo:');
console.log('  npm run confiar');
console.log('En los demás, abriendo esta dirección en el aparato:');
for (const red of ips) console.log(`  https://${red.address}:${process.env.PORT || 4173}/ca`);
