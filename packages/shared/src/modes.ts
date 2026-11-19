export type GameModeId = 'typing' | 'math' | 'keys' | 'task' | 'racing' | 'puzzle' | 'office' | 'chairs' | 'sales' | 'zombies' | 'magic';

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
  racing: { id: 'racing', name: 'Racing Battle', tagline: 'Carrera de 2 a 4 jugadores: cada palabra te acerca a la meta.', unit: 'palabras', minPlayers: 2, maxPlayers: 4, durationMs: 45_000, available: true },
  puzzle: { id: 'puzzle', name: 'Puzzle Battle', tagline: 'Series, intrusos, anagramas y patrones. De 2 a 4 jugadores.', unit: 'acertijos', minPlayers: 2, maxPlayers: 4, durationMs: 45_000, available: true },
  office: { id: 'office', name: 'Office Battle', tagline: 'Pelea 3D de 2 a 4 avatares en la oficina, con poderes.', unit: 'golpes', minPlayers: 2, maxPlayers: 4, durationMs: 60_000, available: true },
  chairs: { id: 'chairs', name: 'Carrera de Sillas', tagline: 'Carrera 3D en sillas de oficina: dispara hacia adelante y acelera con cada acierto.', unit: 'impactos', minPlayers: 2, maxPlayers: 4, durationMs: 120_000, available: true },
  zombies: { id: 'zombies', name: 'Zona Zombi', tagline: 'Sobrevive a hordas de zombis con tu equipo: armas, autos, tiendas y fortalezas.', unit: 'zombis', minPlayers: 1, maxPlayers: 4, durationMs: 60 * 60_000, available: true },
  magic: { id: 'magic', name: 'Magic Frontiers', tagline: 'Conquista 1 contra 1: dos comandantes, sus ejércitos y tres fortalezas.', unit: 'bajas', minPlayers: 2, maxPlayers: 2, durationMs: 15 * 60_000 + 5_000, available: true },
  sales: { id: 'sales', name: 'A Toda Máquina', tagline: 'Cooperativo de 1 a 4: atiende clientes, timbra órdenes y entrega la máquina correcta.', unit: 'pedidos', minPlayers: 1, maxPlayers: 4, durationMs: 30 * 60_000, available: true },
};

/** Modes where the whole team wins or loses together. */
export const COOP_MODES: readonly GameModeId[] = ['sales', 'zombies'];

/** Modes that a player can pick today, in display order. */
export const PLAYABLE_MODES = ['typing', 'math', 'keys', 'task', 'racing', 'puzzle', 'office', 'chairs'] as const;
export type PlayableModeId = (typeof PLAYABLE_MODES)[number];

/** Words to the finish line in Racing Battle. */
export const RACE_LENGTH = 30;
/** Puzzles to solve to finish a Puzzle Battle. */
export const PUZZLE_GOAL = 12;

/** Words or puzzles to reach the finish line, for modes that have one. */
export const FINISH_LINE: Partial<Record<GameModeId, number>> = { racing: RACE_LENGTH, puzzle: PUZZLE_GOAL };

/** A race starts with fewer than the maximum players once the first one waited this long. */
export const RACE_FILL_MS = 8_000;

/** Modes that private rooms (Salas de batalla) can host. */
export const LOBBY_MODES = ['office', 'chairs', 'sales', 'zombies', 'magic'] as const;

/** Modes whose matches anyone can find and join while they are being played. */
export const DROP_IN_MODES: readonly GameModeId[] = ['zombies'];
export type LobbyModeId = (typeof LOBBY_MODES)[number];
