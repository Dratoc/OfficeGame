import { mulberry32 } from './rng';

/**
 * Office + medieval vocabulary for typing battles. Lowercase, no punctuation,
 * so the only thing that matters is typing the word exactly.
 */
export const TYPING_WORDS_ES: readonly string[] = [
  'correo', 'reunion', 'informe', 'dragon', 'castillo', 'espada', 'escudo', 'gerente',
  'caballero', 'pergamino', 'tesoro', 'oficina', 'agenda', 'plazo', 'proyecto', 'equipo',
  'mago', 'hechizo', 'corona', 'reino', 'torre', 'cafe', 'impresora', 'grapadora',
  'archivo', 'carpeta', 'firma', 'sello', 'banquete', 'heraldo', 'mensaje', 'bandeja',
  'urgente', 'adjunto', 'respuesta', 'cliente', 'contrato', 'tablero', 'meta', 'bono',
  'escriba', 'vikingo', 'armadura', 'casco', 'capa', 'alas', 'mascota', 'fuego',
  'batalla', 'duelo', 'victoria', 'gloria', 'honor', 'lealtad', 'consejo', 'rey',
  'reina', 'princesa', 'bufon', 'jefe', 'pasante', 'nomina', 'vacaciones', 'lunes',
  'viernes', 'almuerzo', 'pizarra', 'teclado', 'pantalla', 'planilla', 'grafico', 'ventas',
  'recursos', 'humanos', 'puente', 'foso', 'muralla', 'catapulta', 'arquero', 'posada',
  'gremio', 'mercado', 'oro', 'plata', 'cobre', 'llave', 'puerta', 'sala',
  'trono', 'mapa', 'ruta', 'brujula', 'pocion', 'runa', 'gema', 'cristal',
  'calendario', 'tarea', 'lista', 'prioridad', 'revision', 'entrega', 'cierre', 'balance',
];

/** Builds the word list for a match from a seed. Same seed, same words, for every player. */
export function generateWords(seed: number, count = 60, pool: readonly string[] = TYPING_WORDS_ES): string[] {
  const rand = mulberry32(seed);
  const words: string[] = [];
  let prev = '';
  while (words.length < count) {
    const w = pool[Math.floor(rand() * pool.length)]!;
    if (w === prev) continue;
    words.push(w);
    prev = w;
  }
  return words;
}
