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
  conquest.ts                  Modo Conquista: fortalezas, captura, puertas, oro, reclutamiento, guarniciones
  net.ts                       En línea: entrada compacta del comandante, imagen comprimida del campo y predicción
  ai.ts                        Comandantes enemigos de batalla y de conquista (usan las mismas órdenes que el jugador)
apps/web/src/magic/          Parte visual
  models.ts                    Guerrero, mago y comandante hechos con figuras simples
  scenery.ts                   Terreno, bosque instanciado, montañas, campamentos
  arena.ts                     Dibujo, animaciones, efectos, cámara detrás del comandante
  input.ts                     Teclado y mouse
  hud.ts                       Paneles de ejército, enemigo, vida y órdenes
  practice.ts                  Partida local contra la IA
  online.ts                    Partida en línea: envía la entrada, predice al comandante e interpola al resto
apps/server/src/modes/magic.ts  El servidor corre la conquista 1 contra 1
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
| Z / X / C | Conquista: entrenar guerrero (40 de oro), mago (60) o dragón (220) en el campamento o la fortaleza propia más cercana |
| G / H | Conquista: dejar 3 soldados de guarnición en la fortaleza donde está el comandante, o recogerlos |
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
4. **Tres fortalezas** (hecho): Oeste, Central y Este, con muros y cuatro puertas cada una. La puerta frena al enemigo y deja pasar a los aliados; se rompe a golpes y se reconstruye a los 40 s si no hay enemigos cerca. Se captura quedándose dentro sin enemigos (más rápido con más soldados); al cambiar de dueño las puertas quedan rotas. Las guarniciones (G/H) defienden solas.
5. **Oro, puntos y reclutamiento** (hecho): cada fortaleza da 1 punto y 2,5 de oro por segundo; también hay oro por bajas. Se entrena un soldado a la vez, respetando el tope de 50 lugares. Gana quien llega a 300 puntos, o quien tenga más al terminar los 15 minutos. El comandante caído vuelve al campamento a los 10 s.
6. **Partida completa contra la IA** (hecho): el rival compra tropas, elige fortalezas según su valor y el peligro, rompe puertas, se retira si está en desventaja y deja guarniciones. Se juega en Práctica 3D → Magic Frontiers → Conquista.
7. **En línea 1 contra 1** (hecho): se juega desde Salas de batalla → Magic Frontiers (2 jugadores). El servidor corre la misma simulación a 30 pasos por segundo y manda la imagen del campo 15 veces por segundo (unos 2 a 6 KB). Cada jugador solo envía la entrada de su comandante; su propio comandante se predice en el navegador para que responda al instante y el resto se dibuja 110 ms en el pasado, mezclando dos imágenes. Cada uno ve su ejército en azul y su campamento abajo. Si un jugador se va, gana el otro.
8. Runas y defensa mágica con interacciones de piedra, papel o tijera.
