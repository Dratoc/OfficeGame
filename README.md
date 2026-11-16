# Inbox Arena — MVP

> Your office. Your inbox. Your battles.

Un juego multijugador casual escondido dentro de una bandeja de correo de oficina. Los desafíos llegan como correos, las batallas duran 10 segundos y el servidor decide quién gana.

## Qué incluye este MVP

- Registro, inicio y cierre de sesión (contraseñas con Argon2, sesión en cookie httpOnly).
- Interfaz tipo cliente de correo: bandeja de entrada, desafíos, enviados, panel de lectura, búsqueda, avisos en vivo de correo nuevo.
- Avatar por capas en SVG con 42 objetos en 11 categorías y 5 rarezas (común a mítico), animaciones de espera, saludo, carrera, victoria y derrota, y mascotas (gato y dragones).
- Armería (editor de avatar) con objetos bloqueados por nivel. El servidor rechaza objetos que el jugador no tiene.
- Typing Battle 1 contra 1 de 10 segundos, **autoritativo en el servidor**: mismo texto para ambos, revelado al empezar; reloj sincronizado; cada palabra validada en el servidor; anti-trampas (pegar bloqueado, límite de velocidad humana, mensajes fuera de tiempo descartados); 5 s para reconectar antes de perder por abandono.
- Cuatro modos 1 contra 1 con la misma garantía: **Typing Battle** (10 s), **Cálculo Express** (20 s, sumas, restas y multiplicaciones), **Atajos de Teclado** (15 s, combinaciones como Ctrl+Shift+S y símbolos) y **Tarea Express** (20 s, tareas de oficina ficticias paso a paso, como configurar una videollamada). Las respuestas correctas nunca salen del servidor.
- **Puzzle Battle** de 2 a 4 jugadores (45 s): series numéricas, el intruso del grupo, anagramas de oficina y patrones de figuras. Gana quien resuelva 12 primero.
- **Racing Battle** de 2 a 4 jugadores: carrera escribiendo hasta 30 palabras, con una pista animada por jugador. La partida rápida arma la carrera con 4 jugadores, o con los que haya (mínimo 2) cuando el primero lleva 8 s esperando. Termina antes si todos llegan a la meta. Los puestos, el Elo (promedio de duelos entre cada par) y la XP de podio se calculan en el servidor.
- Duelo animado en vivo: cada acierto lanza un proyectil al rival (fuego, estrella o avión de papel según tu avatar), cada error te hace tropezar, con barra de quién va ganando y combos.
- Mascotas que reaccionan en la batalla: saltan y muestran un corazón cuando aciertas (los dragones escupen fuego), se asustan cuando fallas o te golpean, y bailan con un combo o al cruzar la meta.
- 16 logros (bronce, plata y oro) otorgados por el servidor al terminar cada partida: primera victoria, rachas, velocidad, cero errores, carreras, niveles y más. Se muestran en la escena final, en el correo de resultado y en el perfil.
- Escena final animada (ganador celebra, perdedor bajo la nube), XP, niveles, rating Elo, objetos desbloqueados y correo de resultado.
- Ranking global, perfil con estadísticas e historial, y un calendario de vista previa.

## Requisitos

- Node.js 20 o superior
- Docker (para PostgreSQL) o un PostgreSQL 16 propio

## Correr en tu computador

```bash
npm install
docker compose up -d                              # base de datos en localhost:5432
cp apps/server/.env.example apps/server/.env      # ya apunta a esa base de datos
npm run db:deploy                                 # crea las tablas
npm run dev                                       # servidor :3000 + web :5173
```

Abre http://localhost:5173. Para jugar contra ti mismo, crea una segunda cuenta en una ventana de incógnito (o en otro navegador) y desafíala desde "Nuevo desafío".

### Versión de producción

```bash
npm run build      # compila la web en apps/web/dist
npm start          # el servidor sirve la web y la API en :3000
```

En producción define `DATABASE_URL`, `PORT` y `COOKIE_SECURE=true` (detrás de HTTPS), y ejecuta `npm run db:deploy` una vez por versión.

### Pruebas

```bash
npm test
```

Prueban las reglas compartidas y una partida completa con dos clientes Socket.IO reales contra el servidor y PostgreSQL: aceptar dos veces, palabras correctas e incorrectas, ráfagas imposibles rechazadas, Elo, XP, desbloqueos, correos de resultado y victoria por abandono.

## Estructura

```
packages/shared   Reglas y tipos compartidos: puntuación, Elo, niveles, catálogo de objetos, protocolo de eventos (Zod)
apps/server       Fastify + Socket.IO + Prisma/PostgreSQL
  src/routes        API HTTP (auth, usuarios, avatar, correo, desafíos, partidas, ranking)
  src/realtime      Motor de partidas autoritativo y gateway de sockets
  src/modes         Modos de juego. Los modos de secuencia (typing, math, keys, task) usan createSequenceMode
  prisma            Esquema y migraciones
apps/web          React + Vite + Framer Motion
  src/avatar        Renderizador de avatar por capas y sus animaciones
  src/battle        Duelo animado y paneles de cada modo
  src/views         Bandeja, sala de batalla, escena final, armería, ranking, perfil
```

## Cómo agregar un modo de juego

1. Agrega el modo en `packages/shared/src/modes.ts` con `available: true` y, si es de preguntas en secuencia, su generador en `prompts.ts`.
2. Implementa `GameMode` en `apps/server/src/modes/` (crear estado, aplicar acción, resultado, comparar) y regístralo en `registry.ts`.
3. Crea su panel en `apps/web/src/battle/panels.tsx`. La sala, el reloj, la persistencia, el ranking y los correos ya funcionan para cualquier modo.

## Límites conocidos del MVP

- Un solo proceso de servidor mantiene las partidas en vivo. Para varios servidores hay que fijar cada partida a un proceso (sticky sessions o adaptador Redis de Socket.IO).
- Si el servidor se reinicia en medio de una partida, esa partida se anula.
- Office Battle, calendario de torneos y tienda cosmética quedan preparados en el modelo, pero no implementados.

## Publicar en Render

El archivo `render.yaml` crea el servidor web y la base de datos PostgreSQL. En Render: **New → Blueprint**, elige este repositorio y pulsa **Apply**. En unos minutos tendrás una URL pública (`https://inbox-arena-xxxx.onrender.com`).
En el plan gratuito el servidor se duerme tras unos minutos sin uso y tarda cerca de un minuto en despertar.
