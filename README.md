# Metanoia — Habit Tracker

**App de hábitos, trabajo y tareas del hogar para toda la casa.** Corre en un PC de la red local, cada persona entra desde su móvil como una app instalable (PWA), los cambios se ven en vivo en todos los dispositivos, y las notificaciones llegan aunque la app esté cerrada.

![Node.js](https://img.shields.io/badge/Node.js-Express_4-339933?logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-Web_Push-5A0FC8?logo=pwa&logoColor=white)

---

## Funcionalidades

- **Hábitos** con pauta por días de la semana, rachas, heatmap anual, calendario, estadísticas por hábito, logros y el reto de 30 días perfectos.
- **Progresión competitiva**: XP y niveles, un sistema de rangos por divisiones (Hierro I → Radiante) y una liga entre las personas de la casa.
- **Retos compartidos** entre miembros, con tablón de hábitos públicos.
- **Work Mode**: tareas con prioridad, pasos que guían el proceso, bitácora de avance y recompensa por cerrar a tiempo.
- **Casa**: personas, tareas del hogar, asignación y horarios.
- **Notas** de texto enriquecido con fuentes, colores, resaltado, etiquetas e imágenes pegadas.
- **Perfiles con contraseña opcional** y sesiones por dispositivo.
- **Recordatorios y avisos push** con la app cerrada.
- **Sonido sintetizado** con Web Audio (sin archivos de audio) y animaciones que respetan `prefers-reduced-motion`.

## Stack

| Capa | Tecnología |
|---|---|
| Servidor | Node.js, Express 4, módulos nativos `https`, `crypto` |
| Notificaciones | `web-push` (VAPID) y Service Worker |
| Tiempo real | Server-Sent Events |
| Frontend | JavaScript vanilla sin framework ni build; SVG y Web Audio API |
| Instalación | PWA (manifest + service worker) |
| Seguridad | Autoridad certificadora propia con OpenSSL, `scrypt` con sal por usuario |
| Persistencia | JSON con escritura atómica y migraciones de esquema versionadas |

## Aspectos técnicos destacados

### 1. HTTPS en la red de casa con autoridad certificadora propia
Los service workers y las notificaciones push exigen contexto seguro, y `http://192.168.x.x` no lo es. Un certificado autofirmado no basta: el navegador deja ver la página tras el aviso, pero **se niega a registrar el service worker** y las notificaciones fallan en silencio. La solución son dos certificados: una CA de la casa que cada dispositivo instala una vez, y un certificado de servidor firmado por ella con las direcciones de la red como SAN. Cuando cambia la IP, se vuelve a firmar el del servidor y nadie reinstala nada. Un segundo puerto HTTP solo redirige. → [`crear-cert.js`](crear-cert.js), [`confiar.js`](confiar.js)

### 2. Notificaciones push de extremo a extremo
Llaves VAPID generadas una vez y persistidas (si cambian, todas las suscripciones dejan de valer), suscripción por dispositivo, recordatorios programados desde el servidor y un service worker que muestra el aviso con la app cerrada. El service worker además le informa a la app cuándo un push entró al navegador, para distinguir "no llegó" de "llegó y el sistema operativo lo silenció": dos averías distintas que se arreglan en sitios distintos. Incluye un script de diagnóstico que controla un navegador por el protocolo DevTools para aislar la falla. → [`public/sw.js`](public/sw.js), [`entrega.js`](entrega.js)

### 3. Sincronización en vivo entre dispositivos con SSE
Cada escritura se difunde a todos los clientes por Server-Sent Events: sin librerías, con reconexión automática del navegador. Un latido cada 25 s evita que el router dé la conexión por muerta, la cabecera `X-Accel-Buffering: no` impide que un proxy acumule los eventos, y cada cliente lleva un identificador para ignorar el eco de sus propios cambios.

### 4. Persistencia segura y evolución del esquema
Los datos se escriben en un archivo temporal y se reemplazan con `rename` (atómico: un corte de luz no deja el archivo a medias). Tres migraciones encadenadas (v1 → v2 → v3) transforman datos antiguos al arrancar, dejando respaldo de cada versión previa. Las contraseñas se guardan como `scrypt` con sal propia y se comparan con `timingSafeEqual`. Una variable de entorno redirige los datos a otra carpeta, para que ninguna prueba toque los datos reales.

## Ejecutar

Requiere Node.js 18+ y OpenSSL en el `PATH`.

```bash
npm install
npm run cert       # crea la CA de la casa y el certificado del servidor (una vez)
npm run confiar    # instala la CA en este equipo (Windows)
npm start          # https://localhost:4173
```

En los demás dispositivos se abre `https://<ip-del-pc>:4173`, se descarga la CA desde `/ca` y se instala una vez. Sin certificado el servidor arranca en HTTP y todo funciona salvo las notificaciones.

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTPS (por defecto 4173). El de redirección HTTP es `PORT + 1` |
| `OBSIDIAN_VAULT` | Carpeta raíz; los datos van en `<vault>/Habits/` (por defecto `~/Documents/Obsidian Vault`) |
| `METANOIA_DATOS` | Carpeta de datos alternativa, la que usan las pruebas |

> La carpeta `cert/` contiene llaves privadas (de la CA, del servidor y VAPID) y está excluida del repositorio. Se regenera con `npm run cert`.

## Estructura

```
server.js        API REST, SSE, push, sesiones, migraciones y arranque HTTPS
crear-cert.js    CA propia + certificado del servidor con OpenSSL
confiar.js       instala la CA en el almacén del usuario (certutil)
entrega.js       diagnóstico del canal push con un navegador controlado
public/
  app.js         SPA: vistas, cálculos de rachas/XP/rangos, editor de notas
  sw.js          service worker de notificaciones
  icons.js       iconografía SVG
  manifest.json  instalación como PWA
```
