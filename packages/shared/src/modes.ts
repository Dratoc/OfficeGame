export type GameModeId = 'typing' | 'racing' | 'puzzle' | 'office';

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  durationMs: number;
  available: boolean;
}

export const GAME_MODES: Record<GameModeId, GameModeInfo> = {
  typing: { id: 'typing', name: 'Typing Battle', tagline: '10 segundos. Dos teclados. Un ganador.', minPlayers: 2, maxPlayers: 2, durationMs: 10_000, available: true },
  racing: { id: 'racing', name: 'Racing Battle', tagline: 'Cada palabra correcta te hace avanzar.', minPlayers: 2, maxPlayers: 4, durationMs: 30_000, available: false },
  puzzle: { id: 'puzzle', name: 'Puzzle Battle', tagline: 'Acertijos, secuencias y lógica.', minPlayers: 2, maxPlayers: 4, durationMs: 30_000, available: false },
  office: { id: 'office', name: 'Office Battle', tagline: 'Habilidades y duelos entre personajes.', minPlayers: 2, maxPlayers: 2, durationMs: 30_000, available: false },
};
