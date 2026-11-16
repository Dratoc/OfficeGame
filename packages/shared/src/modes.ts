export type GameModeId = 'typing' | 'math' | 'keys' | 'task' | 'racing' | 'puzzle' | 'office';

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  tagline: string;
  /** What one correct answer is called in results ("palabras", "cálculos"...). */
  unit: string;
  minPlayers: number;
  maxPlayers: number;
  durationMs: number;
  available: boolean;
}

export const GAME_MODES: Record<GameModeId, GameModeInfo> = {
  typing: { id: 'typing', name: 'Typing Battle', tagline: '10 segundos. Dos teclados. Un ganador.', unit: 'palabras', minPlayers: 2, maxPlayers: 2, durationMs: 10_000, available: true },
  math: { id: 'math', name: 'Cálculo Express', tagline: 'Sumas, restas y multiplicaciones contra el reloj.', unit: 'cálculos', minPlayers: 2, maxPlayers: 2, durationMs: 20_000, available: true },
  keys: { id: 'keys', name: 'Atajos de Teclado', tagline: 'Ctrl + lo que sea. Rápido y sin mirar.', unit: 'atajos', minPlayers: 2, maxPlayers: 2, durationMs: 15_000, available: true },
  task: { id: 'task', name: 'Tarea Express', tagline: 'Tareas de oficina ficticias, paso a paso.', unit: 'pasos', minPlayers: 2, maxPlayers: 2, durationMs: 20_000, available: true },
  racing: { id: 'racing', name: 'Racing Battle', tagline: 'Cada palabra correcta te hace avanzar.', unit: 'palabras', minPlayers: 2, maxPlayers: 4, durationMs: 30_000, available: false },
  puzzle: { id: 'puzzle', name: 'Puzzle Battle', tagline: 'Acertijos, secuencias y lógica.', unit: 'acertijos', minPlayers: 2, maxPlayers: 4, durationMs: 30_000, available: false },
  office: { id: 'office', name: 'Office Battle', tagline: 'Habilidades y duelos entre personajes.', unit: 'golpes', minPlayers: 2, maxPlayers: 2, durationMs: 30_000, available: false },
};

/** Modes that a player can pick today, in display order. */
export const PLAYABLE_MODES = ['typing', 'math', 'keys', 'task'] as const;
export type PlayableModeId = (typeof PLAYABLE_MODES)[number];
