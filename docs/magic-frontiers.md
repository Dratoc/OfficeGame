# Magic Frontiers

Juego 3D de fantasía medieval: el jugador maneja a un **comandante** en tercera persona, y sus órdenes mueven a un ejército pequeño (hasta 50 unidades) que pelea solo.

## Motor y estructura

Three.js + TypeScript dentro de este monorepo, igual que Office Battle y Zona Zombi.

```
packages/shared/src/magic/   Reglas puras, sin Three.js (se pueden correr en el servidor más adelante)
  config.ts                    Estadísticas de unidades, órdenes y formación (todo lo ajustable)
  map.ts                       Valle del prototipo: camino, bosques, rocas, carpas, torres
  formation.ts                 Puestos de la formación de marcha y de la línea de defensa
  world.ts                     Simulación a 30 pasos/s: órdenes, comportamiento, combate, proyectiles
  ai.ts                        Comandante enemigo (usa las mismas órdenes que el jugador)
apps/web/src/magic/          Parte visual
  models.ts                    Guerrero, mago y comandante hechos con figuras simples
  scenery.ts                   Terreno, bosque instanciado, montañas, campamentos
  arena.ts                     Dibujo, animaciones, efectos, cámara detrás del comandante
  input.ts                     Teclado y mouse
  hud.ts                       Paneles de ejército, enemigo, vida y órdenes
  practice.ts                  Partida local contra la IA
```

## Controles

| Tecla | Acción |
| --- | --- |
| WASD | Mover al comandante (relativo a la cámara) |
| Mouse | Con el mouse capturado (clic en el campo): girar cámara y comandante, acercar o alejar la mira. Sin capturar: la mira sigue al cursor y ← → giran la cámara |
| Clic izquierdo | Golpe de espada del comandante |
| Clic derecho | Orden de **Ataque** (grito de guerra) contra el enemigo bajo la mira |
| Q | Orden de **Defensa** en el lugar, mirando hacia la mira |
| F | Orden de **Seguimiento** |
| E | **Descarga mágica**: todos los magos disparan a la mira |
| R | Cambiar la formación de marcha: línea, cuña o columna |
| 1 / 2 / 3 | Elegir guerreros, magos o dragones para las próximas órdenes; repetir la tecla (o 4) vuelve a todo el ejército |

## Comportamiento de las unidades

- **Seguimiento**: cada unidad va a su puesto (guerreros en línea a los lados y delante del comandante, magos detrás). La dirección de marcha solo gira cuando el comandante camina, así apuntar no hace correr al ejército. Los puestos se reasignan al soldado más cercano cuando la marcha gira mucho o cae alguien. Los guerreros solo se defienden a corta distancia; los magos disparan sin romper la formación.
- **Ataque**: todos priorizan el objetivo marcado; si muere, buscan el enemigo más cercano (sin alejarse demasiado del comandante). Los guerreros cargan; los magos se mantienen a distancia y retroceden si alguien se acerca.
- **Defensa**: los guerreros forman una línea delante del punto (reciben 40 % menos daño en su puesto) y solo salen un poco de ella; los magos atacan desde atrás; nadie persigue fuera de la zona.
- Separación entre aliados, cuerpos sólidos, rodeo de árboles y rocas, y un empujón lateral si una unidad se queda atascada.
- Proyectiles con trayectoria parabólica, velocidad, alcance, impacto directo y daño en área.

## Etapas

1. **Prototipo jugable** (hecho): valle, comandante, cámara, 10 soldados (6 guerreros, 4 magos), seguimiento, ataque, defensa, IA enemiga, combates automáticos, descarga mágica con el mouse, contador de unidades.
2. **Formaciones y 50 unidades** (hecho): línea, cuña y columna (R); ejércitos de 10, 25 o 50; cada soldado se dibuja con ~6 llamadas (partes fusionadas con colores en los vértices); la simulación de 50 contra 50 se mide en las pruebas.
3. **Dragones** (hecho): vuelan sobre árboles y soldados, aliento de fuego en cono, bolas de fuego a distancia, se suman a la descarga (E) y ocupan 5 lugares del ejército. Piedra, papel o tijera entre tipos (`DAMAGE_VS`): guerreros > magos, magos > dragones, dragones > guerreros.
4. Tres fortalezas: conquista, puertas que se rompen y regeneran, guarniciones.
5. Oro, puntos de victoria y reclutamiento en las fortalezas.
6. Partida completa contra un comandante de IA.
7. Partidas en línea 1 contra 1 (las reglas ya están en `packages/shared`).
8. Runas y defensa mágica con interacciones de piedra, papel o tijera.
