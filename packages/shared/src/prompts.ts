import { mulberry32 } from './rng';
import { generateWords } from './words';
import type { PlayableModeId } from './modes';

/**
 * Every playable mode is a sequence of prompts answered one by one. The server keeps
 * the answers; clients only receive the prompts.
 */
export interface Prompt {
  kind: 'word' | 'math' | 'combo' | 'symbols' | 'choice';
  text: string;
  /** For 'combo': the keys to show as keycaps. */
  keys?: string[];
  /** For 'choice': the task this step belongs to and its options. */
  task?: string;
  step?: number;
  steps?: number;
  choices?: { id: string; label: string }[];
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

export function generatePrompts(mode: PlayableModeId, seed: number): PromptSet {
  const rand = mulberry32(seed ^ 0x5eed);
  switch (mode) {
    case 'math':
      return mathPrompts(rand, 80);
    case 'keys':
      return keysPrompts(rand, 80);
    case 'task':
      return taskPrompts(rand, 60);
    default: {
      const words = generateWords(seed, 80);
      return { prompts: words.map((w) => ({ kind: 'word', text: w })), answers: words };
    }
  }
}
