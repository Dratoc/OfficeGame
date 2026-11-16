import { mulberry32 } from './rng';
import { generateWords } from './words';
import type { PlayableModeId } from './modes';

/**
 * Every playable mode is a sequence of prompts answered one by one. The server keeps
 * the answers; clients only receive the prompts.
 */
export interface Prompt {
  kind: 'word' | 'math' | 'combo' | 'symbols' | 'choice' | 'puzzle';
  text: string;
  /** For 'combo': the keys to show as keycaps. */
  keys?: string[];
  /** For 'choice': the task this step belongs to and its options. */
  task?: string;
  step?: number;
  steps?: number;
  choices?: { id: string; label: string }[];
  /** For 'puzzle': what kind of answer it takes, and the instruction shown above it. */
  input?: 'number' | 'text' | 'choice';
  label?: string;
}

export interface PromptSet {
  prompts: Prompt[];
  answers: string[];
}

/** Answers are compared trimmed and lowercased. */
export const normalizeAnswer = (s: string) => s.trim().toLowerCase();

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const shuffle = <T>(rand: () => number, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

function mathPrompts(rand: () => number, count: number): PromptSet {
  const prompts: Prompt[] = [];
  const answers: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    let a: number, b: number, op: string, res: number;
    if (r < 0.45) {
      a = 2 + Math.floor(rand() * 48);
      b = 2 + Math.floor(rand() * 48);
      op = '+';
      res = a + b;
    } else if (r < 0.8) {
      a = 10 + Math.floor(rand() * 60);
      b = 1 + Math.floor(rand() * (a - 1));
      op = '−';
      res = a - b;
    } else {
      a = 2 + Math.floor(rand() * 8);
      b = 2 + Math.floor(rand() * 8);
      op = '×';
      res = a * b;
    }
    prompts.push({ kind: 'math', text: `${a} ${op} ${b}` });
    answers.push(String(res));
  }
  return { prompts, answers };
}

/**
 * Shortcuts the browser lets a page intercept. Ctrl+W/T/N/Q, Alt+F4 and Ctrl+Tab are left
 * out because browsers never hand them to the page. On Mac, ⌘ counts as Ctrl.
 */
const COMBOS: string[][] = [
  ['Ctrl', 'C'], ['Ctrl', 'V'], ['Ctrl', 'X'], ['Ctrl', 'Z'], ['Ctrl', 'Y'], ['Ctrl', 'S'],
  ['Ctrl', 'F'], ['Ctrl', 'B'], ['Ctrl', 'I'], ['Ctrl', 'U'], ['Ctrl', 'K'], ['Ctrl', 'A'],
  ['Ctrl', 'Shift', 'S'], ['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Shift', 'K'], ['Ctrl', 'Shift', 'L'],
  ['Alt', 'Shift', 'A'], ['Ctrl', 'Alt', 'M'], ['Ctrl', 'Enter'], ['Shift', 'Enter'],
];
const SYMBOLS = '@#$%&*!?+=/<>'.split('');

/** Canonical form of a key combination, shared by the client capture and the server check. */
export function comboId(keys: string[]): string {
  const order = ['ctrl', 'alt', 'shift'];
  const lower = keys.map((k) => k.toLowerCase());
  const mods = order.filter((m) => lower.includes(m));
  const rest = lower.filter((k) => !order.includes(k));
  return [...mods, ...rest].join('+');
}

function keysPrompts(rand: () => number, count: number): PromptSet {
  const prompts: Prompt[] = [];
  const answers: string[] = [];
  for (let i = 0; i < count; i++) {
    if (rand() < 0.65) {
      const keys = pick(rand, COMBOS);
      prompts.push({ kind: 'combo', text: keys.join(' + '), keys });
      answers.push(comboId(keys));
    } else {
      const len = 3 + Math.floor(rand() * 2);
      const s = Array.from({ length: len }, () => pick(rand, SYMBOLS)).join('');
      prompts.push({ kind: 'symbols', text: s });
      answers.push(s);
    }
  }
  return { prompts, answers };
}

interface TaskStep {
  q: string;
  ok: string;
  bad: [string, string];
}
interface TaskDef {
  name: string;
  steps: TaskStep[];
}

export const OFFICE_TASKS: readonly TaskDef[] = [
  {
    name: 'Configurar la videollamada',
    steps: [
      { q: 'Elige la cámara', ok: 'Cámara HD integrada', bad: ['Tostadora USB', 'Espejo mágico del castillo'] },
      { q: 'Elige el micrófono', ok: 'Micrófono del headset', bad: ['Cuerno de batalla', 'Paloma mensajera'] },
      { q: 'Elige el fondo virtual', ok: 'Oficina neutra', bad: ['Dragón en llamas', 'Tu cama sin hacer'] },
      { q: 'Acabas de entrar a la reunión', ok: 'Silenciar el micrófono', bad: ['Gritar ¡A LA CARGA!', 'Comer sopa'] },
      { q: 'Comparte tu pantalla', ok: 'La presentación', bad: ['Tu chat con el rey', 'El solitario a medias'] },
    ],
  },
  {
    name: 'Enviar el informe trimestral',
    steps: [
      { q: 'Elige el formato', ok: 'PDF', bad: ['Pergamino enrollado', 'Tabla de piedra'] },
      { q: 'Elige el destinatario', ok: 'Gerencia', bad: ['Responder a todo el reino', 'El dragón'] },
      { q: 'Escribe el asunto', ok: 'Informe Q3', bad: ['asdfgh', 'URGENTE!!!!!'] },
      { q: 'Adjunta el archivo', ok: 'informe_final_v2.pdf', bad: ['foto_del_gato.jpg', 'contraseñas.txt'] },
    ],
  },
  {
    name: 'Reservar sala para 6 personas',
    steps: [
      { q: 'Elige la sala', ok: 'Sala Roble · 8 puestos', bad: ['Armario de escobas · 1', 'Mazmorra · 40'] },
      { q: 'Elige el horario', ok: '10:00 a 10:30', bad: ['03:00 de la madrugada', 'Durante el banquete real'] },
      { q: 'Pide el equipo', ok: 'Proyector', bad: ['Catapulta', 'Arpa'] },
      { q: 'Invita a los asistentes', ok: 'Equipo del proyecto', bad: ['Toda la empresa', 'Nadie'] },
    ],
  },
  {
    name: 'Pedir vacaciones',
    steps: [
      { q: 'Elige las fechas', ok: 'La próxima semana', bad: ['El día del cierre trimestral', 'Para siempre'] },
      { q: '¿Quién aprueba?', ok: 'Tu jefe directo', bad: ['El bufón', 'Tu mascota'] },
      { q: 'Motivo', ok: 'Descanso', bad: ['Huir de un dragón (sin pruebas)', 'Solo un emoji'] },
      { q: 'Deja una respuesta automática', ok: 'Vuelvo el lunes 18', bad: ['Nunca volveré', 'jajaja'] },
    ],
  },
  {
    name: 'Configurar la impresora',
    steps: [
      { q: 'Conecta la impresora', ok: 'Red de la oficina', bad: ['Wifi del vecino', 'Hechizo de enlace'] },
      { q: 'Tamaño de papel', ok: 'Carta', bad: ['Tamaño mural', 'Servilleta'] },
      { q: 'Imprime 2 copias', ok: '2', bad: ['200', '0'] },
      { q: 'Ahorra tinta', ok: 'Escala de grises', bad: ['Todo en dorado', 'Arcoíris'] },
    ],
  },
  {
    name: 'Ordenar la bandeja de entrada',
    steps: [
      { q: 'Correo: "Cena de fin de año"', ok: 'Mover a Eventos', bad: ['Eliminar sin leer', 'Responder a todos'] },
      { q: 'Correo: "Ganaste un dragón gratis"', ok: 'Marcar como spam', bad: ['Hacer clic en el enlace', 'Reenviar al jefe'] },
      { q: 'Correo: "Firma del contrato hoy"', ok: 'Marcar como importante', bad: ['Archivar para el año próximo', 'Imprimir 50 copias'] },
    ],
  },
];

function taskPrompts(rand: () => number, minSteps: number): PromptSet {
  const prompts: Prompt[] = [];
  const answers: string[] = [];
  let order: TaskDef[] = [];
  while (prompts.length < minSteps) {
    if (order.length === 0) order = shuffle(rand, [...OFFICE_TASKS]);
    const task = order.shift()!;
    task.steps.forEach((s, i) => {
      const options = shuffle(rand, [s.ok, ...s.bad]);
      const choices = options.map((label, k) => ({ id: String.fromCharCode(97 + k), label }));
      prompts.push({ kind: 'choice', text: s.q, task: task.name, step: i + 1, steps: task.steps.length, choices });
      answers.push(choices.find((c) => c.label === s.ok)!.id);
    });
  }
  return { prompts, answers };
}

/* ---------------- Puzzle Battle ---------------- */

function seriesPuzzle(rand: () => number): [Prompt, string] {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const kind = int(0, 5);
  let terms: number[];
  if (kind === 0) {
    const a = int(1, 20), d = int(2, 9);
    terms = [0, 1, 2, 3, 4].map((i) => a + d * i);
  } else if (kind === 1) {
    const a = int(1, 5), r = int(2, 3);
    terms = [0, 1, 2, 3, 4].map((i) => a * r ** i);
  } else if (kind === 2) {
    const n = int(1, 6);
    terms = [0, 1, 2, 3, 4].map((i) => (n + i) ** 2);
  } else if (kind === 3) {
    const a = int(1, 10), x = int(1, 5), y = int(6, 12);
    terms = [a];
    for (let i = 1; i < 6; i++) terms.push(terms[i - 1]! + (i % 2 ? x : y));
  } else if (kind === 4) {
    terms = [int(1, 4), int(1, 5)];
    while (terms.length < 6) terms.push(terms[terms.length - 1]! + terms[terms.length - 2]!);
  } else {
    const a = int(60, 99), d = int(3, 9);
    terms = [0, 1, 2, 3, 4].map((i) => a - d * i);
  }
  const answer = terms.pop()!;
  return [{ kind: 'puzzle', input: 'number', label: 'Completa la serie', text: `${terms.join(', ')}, ?` }, String(answer)];
}

const GROUPS: Record<string, string[]> = {
  oficina: ['grapadora', 'teclado', 'monitor', 'carpeta', 'impresora', 'clip', 'agenda', 'escritorio'],
  medieval: ['espada', 'escudo', 'castillo', 'dragón', 'armadura', 'lanza', 'catapulta', 'corona'],
  comida: ['manzana', 'pan', 'queso', 'café', 'galleta', 'sopa', 'tortilla', 'pera'],
  animales: ['gato', 'caballo', 'búho', 'lobo', 'zorro', 'ciervo', 'oso', 'cuervo'],
  colores: ['rojo', 'azul', 'verde', 'amarillo', 'morado', 'naranja', 'gris', 'blanco'],
};

function oddOnePuzzle(rand: () => number): [Prompt, string] {
  const [inGroup, outGroup] = shuffle(rand, Object.keys(GROUPS));
  const three = shuffle(rand, GROUPS[inGroup!]!).slice(0, 3);
  const intruder = pick(rand, GROUPS[outGroup!]!);
  const choices = shuffle(rand, [...three, intruder]).map((label, k) => ({ id: String.fromCharCode(97 + k), label }));
  return [{ kind: 'puzzle', input: 'choice', label: '¿Cuál no pertenece al grupo?', text: 'Encuentra al intruso', choices }, choices.find((c) => c.label === intruder)!.id];
}

/** Accent-free words, so anagrams are typed without fighting the keyboard. */
const ANAGRAM_WORDS = ['teclado', 'oficina', 'correo', 'informe', 'castillo', 'espada', 'escudo', 'corona', 'agenda', 'carpeta', 'monitor', 'cliente', 'tarea', 'gremio', 'caballero', 'armadura', 'pasante', 'tablero', 'archivo', 'mensaje', 'planilla', 'reino', 'torre', 'bandeja'];

function anagramPuzzle(rand: () => number): [Prompt, string] {
  const word = pick(rand, ANAGRAM_WORDS);
  let scrambled = word;
  for (let tries = 0; scrambled === word && tries < 10; tries++) scrambled = shuffle(rand, word.split('')).join('');
  return [{ kind: 'puzzle', input: 'text', label: 'Ordena las letras', text: scrambled.toUpperCase() }, word];
}

const SHAPES = ['▲', '●', '■', '◆', '★'];

function patternPuzzle(rand: () => number): [Prompt, string] {
  const cycle = shuffle(rand, SHAPES).slice(0, 2 + Math.floor(rand() * 2));
  const shown = 5 + Math.floor(rand() * 2);
  const seq = Array.from({ length: shown }, (_, i) => cycle[i % cycle.length]!);
  const next = cycle[shown % cycle.length]!;
  const others = shuffle(rand, SHAPES.filter((x) => x !== next)).slice(0, 2);
  const choices = shuffle(rand, [next, ...others]).map((label, k) => ({ id: String.fromCharCode(97 + k), label }));
  return [{ kind: 'puzzle', input: 'choice', label: '¿Qué sigue?', text: `${seq.join(' ')} ?`, choices }, choices.find((c) => c.label === next)!.id];
}

function puzzlePrompts(rand: () => number, count: number): PromptSet {
  const prompts: Prompt[] = [];
  const answers: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    const [p, a] = r < 0.35 ? seriesPuzzle(rand) : r < 0.6 ? oddOnePuzzle(rand) : r < 0.8 ? anagramPuzzle(rand) : patternPuzzle(rand);
    prompts.push(p);
    answers.push(a);
  }
  return { prompts, answers };
}

export function generatePrompts(mode: PlayableModeId, seed: number): PromptSet {
  const rand = mulberry32(seed ^ 0x5eed);
  switch (mode) {
    case 'math':
      return mathPrompts(rand, 80);
    case 'keys':
      return keysPrompts(rand, 80);
    case 'task':
      return taskPrompts(rand, 60);
    case 'puzzle':
      return puzzlePrompts(rand, 60);
    default: {
      const words = generateWords(seed, 80);
      return { prompts: words.map((w) => ({ kind: 'word', text: w })), answers: words };
    }
  }
}
