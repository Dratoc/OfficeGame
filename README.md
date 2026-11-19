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
- **Office Battle** de 2 a 4 jugadores en 3D (Three.js, 60 s), todos contra todos: gana el último en pie, o quien tenga más vida al final. Los avatares pelean dentro de una oficina con estandartes, antorchas y escritorios. Moverse (WASD o flechas), atacar (J o clic), bloquear de frente (K o clic derecho) y esquivar con voltereta (Espacio), con barras de vida y K.O. En el celular aparecen joystick y botones. **Autoritativo en el servidor**: los clientes solo envían entradas y el servidor simula a 30 pasos por segundo, decide cada golpe y envía el estado a ambos; el cliente predice su propio movimiento con las mismas reglas (`packages/shared/src/office.ts`) para que se sienta inmediato. Los objetos de la armería se ven en 3D pero no cambian el daño.
- **Carrera de Sillas** de 2 a 4 jugadores en 3D (Three.js, 3 vueltas, máximo 2 minutos): cada uno maneja su silla de oficina por una pista entre cubículos (W/S acelerar y frenar, A/D girar). Solo se puede lanzar bolas de papel **hacia adelante** (Espacio o clic), y acertarle a otro jugador te da **turbo** por 2 segundos mientras el golpeado gira sin control. Así el que va primero solo puede esquivar, con un salto lateral (Q / E) que deja pasar las bolas por debajo, y los de atrás siempre tienen a quién apuntar para alcanzarlo. Cuando el primero cruza la meta, el resto tiene 15 segundos para llegar. **Autoritativo en el servidor** con las mismas reglas compartidas que el cliente usa para predecir su silla (`packages/shared/src/chairs.ts`). En el celular la silla acelera sola y aparecen botones para girar, frenar, lanzar y saltar. Se juega en salas privadas, por partida rápida, por desafío o en práctica contra 1 a 3 bots.
- **A Toda Máquina**, cooperativo de 1 a 4 jugadores en 3D (Three.js) sobre venta de maquinaria: llegan clientes al mesón pidiendo una máquina (grúa horquilla eléctrica o a gas, transpaleta o camión) para una sucursal, a veces con un accesorio. El equipo toma la solicitud, hace la orden de compra en el escritorio (mantener E), la timbra en gerencia, la cambia por la máquina correcta en el patio, le pone el accesorio y la entrega en el andén de su sucursal. El local se divide en 4 zonas (recepción, gerencia, patio y despacho) que se reparten según cuántos jueguen; entre zonas de distintos jugadores hay muros con mesones de traspaso para pasarse papeles y máquinas. Cada jornada tiene una meta de puntos y un reloj: al cumplirla empieza otra con más clientes; una entrega equivocada quita 8 segundos, y si se acaba el tiempo o 3 clientes se van enojados, queman todo. **Autoritativo en el servidor** con reglas compartidas (`packages/shared/src/sales.ts`); si alguien se desconecta, sus zonas pasan al resto. Todos comparten el resultado y el rating no cambia. Se juega en salas privadas o en práctica con 0 a 3 compañeros bot.
- **Zona Zombi**, cooperativo en 3D (Three.js) para sobrevivir hordas infinitas en un mapa amplio con tres fortalezas: el **Castillo** (herrería medieval: espada, ballesta, martillo de guerra, carro de guerra, tablones de roble), la **Torre Mágica** (bastón de fuego, varita de rayos, anillo de escarcha, alfombra voladora, sello arcano) y el **Edificio Corporativo** (pistola, escopeta, motosierra, auto y camión con pala, planchas de acero). Cada tienda vende armas, mejoras de arma (3 niveles), vehículos y materiales para **bloquear puertas** (madera, acero o arcano, que los zombis rompen a golpes). Todo se paga con las monedas que se ganan matando zombis. Hay tres tamaños de zombi: los pequeños casi no hacen daño pero **3 juntos se fusionan** en uno normal, y el grande puede destruir autos. Los zombis aparecen alrededor de cada jugador y siempre lo siguen, incluso hasta las puertas de una fortaleza. Mismos controles que Office Battle (WASD, J atacar, K bloquear, Espacio esquivar) más E usar, Q cambiar arma y números para comprar. **Fuego amigo siempre activado**; quien cae reaparece a los 8 s (o antes si un compañero lo levanta con E). Las partidas son **públicas**: aparecen en Salas de batalla y cualquiera puede entrar mientras no hayan caído todos a la vez; cada jugador que entra trae más zombis y más resistentes. Parte del dinero se convierte en doblones al final. **Autoritativo en el servidor** con reglas compartidas (`packages/shared/src/zombies.ts`) y predicción en el cliente. También en práctica con 0 a 3 compañeros bot.
- **Magic Frontiers** (prototipo, en Práctica 3D): estrategia y acción en 3D de fantasía medieval. Manejas a un comandante en tercera persona con un ejército de hasta 50 unidades (guerreros, magos y dragones) que te sigue en formación, y con pocas órdenes (Ataque con clic derecho, Defensa con Q, Seguimiento con F, descarga mágica con E apuntando con el mouse) todo el ejército pelea solo contra un ejército controlado por la IA. Modo Conquista: tres fortalezas con puertas, oro, reclutamiento (Z/X/C), guarniciones (G/H), dragones y puntos de victoria. Reglas en `packages/shared/src/magic/`; diseño y etapas en `docs/magic-frontiers.md`.
- **Cartera de poderes**: antes de cada pelea eliges 2 de 6 poderes (Q y E, o los botones de la barra): Grapadora relámpago (disparo a distancia), Café hirviendo (cono que atraviesa bloqueos), Escudo de carpetas (2 s sin daño), Viernes 17:59 (correr más rápido), Reunión sorpresa (daño y aturdimiento en área) y Curita de RR.HH. (cura). Cada uno tiene su recarga. Son los mismos para todos y no se venden.
- **Salas de batalla** privadas: creas una sala de Office Battle, Carrera de Sillas o A Toda Máquina (el anfitrión puede cambiar el modo), compartes el código de 5 letras (o invitas a contactos en línea), entran hasta 4 personas y el anfitrión empieza la pelea. Si el anfitrión sale, la sala pasa al siguiente.
- **Práctica 3D** contra 1 a 3 bots que también usan poderes, con tres dificultades, sin experiencia ni rating, para aprender los movimientos.
- Duelo animado en vivo: cada acierto lanza un proyectil al rival (fuego, estrella o avión de papel según tu avatar), cada error te hace tropezar, con barra de quién va ganando y combos.
- Mascotas que reaccionan en la batalla: saltan y muestran un corazón cuando aciertas (los dragones escupen fuego), se asustan cuando fallas o te golpean, y bailan con un combo o al cruzar la meta.
- 16 logros (bronce, plata y oro) otorgados por el servidor al terminar cada partida: primera victoria, rachas, velocidad, cero errores, carreras, niveles y más. Se muestran en la escena final, en el correo de resultado y en el perfil.
- Tienda del gremio con **doblones**, la moneda del juego: se ganan jugando (más al ganar o subir al podio) y con cada logro, y se gastan solo en cosméticos. Cada día hay 6 ofertas con 25 % de descuento. La compra es atómica en el servidor: no se puede gastar dos veces la misma moneda ni comprar dos veces un objeto. Los aportes con dinero real quedan como "Próximamente".
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
  src/office        Office Battle en 3D: oficina, avatares 3D, controles, predicción en línea y bot de práctica
  src/magic         Magic Frontiers en 3D: soldados, valle, cámara del comandante, controles y HUD
  src/zombies       Zona Zombi en 3D: mapa y fortalezas, zombis, vehículos, HUD con tiendas, controles y modo en línea
  src/views         Bandeja, sala de batalla, escena final, armería, ranking, perfil
```

### Prototipo de Office Battle sin servidor

```bash
node apps/web/demo/build-office-demo.mjs   # escribe apps/web/demo/office-practice.html
```

Es un solo archivo HTML con la práctica contra 1 a 3 bots y poderes, útil para probar la pelea sin base de datos.

## Cómo agregar un modo de juego

1. Agrega el modo en `packages/shared/src/modes.ts` con `available: true` y, si es de preguntas en secuencia, su generador en `prompts.ts`.
2. Implementa `GameMode` en `apps/server/src/modes/` (crear estado, aplicar acción, resultado, comparar) y regístralo en `registry.ts`.
   Para un modo en tiempo real (como Office Battle), define también `tickMs` y `tick`: el motor llama a `tick` en cada paso y envía lo que devuelve a todos con `match:frame`.
3. Crea su panel en `apps/web/src/battle/panels.tsx`. La sala, el reloj, la persistencia, el ranking y los correos ya funcionan para cualquier modo.

## Límites conocidos del MVP

- Un solo proceso de servidor mantiene las partidas en vivo. Para varios servidores hay que fijar cada partida a un proceso (sticky sessions o adaptador Redis de Socket.IO).
- Si el servidor se reinicia en medio de una partida, esa partida se anula.
- Calendario de torneos y pagos con dinero real quedan preparados en el modelo, pero no implementados.
- Office Battle admite hasta 4 jugadores; la partida rápida arma salas con quienes estén buscando y las salas privadas se arman por código.

## Publicar en Render

El archivo `render.yaml` crea el servidor web y la base de datos PostgreSQL. En Render: **New → Blueprint**, elige este repositorio y pulsa **Apply**. En unos minutos tendrás una URL pública (`https://inbox-arena-xxxx.onrender.com`).
En el plan gratuito el servidor se duerme tras unos minutos sin uso y tarda cerca de un minuto en despertar.
