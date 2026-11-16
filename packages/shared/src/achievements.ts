import type { GameModeId } from './modes';
import type { MatchResult } from './progression';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Emoji-free short icon key; the web maps it to an icon. */
  icon: 'star' | 'sword' | 'crown' | 'flame' | 'zap' | 'target' | 'calc' | 'keyboard' | 'layers' | 'flag' | 'trend' | 'briefcase' | 'users' | 'paw' | 'coffee';
  tier: 'bronze' | 'silver' | 'gold';
}

/** Everything the server knows about a player right after a match, to check achievements. */
export interface AchievementContext {
  mode: GameModeId;
  result: MatchResult;
  placement: number;
  players: number;
  correct: number;
  errors: number;
  wpm: number;
  level: number;
  wins: number;
  played: number;
  winStreak: number;
  modesWon: number;
  friends: number;
  hasPet: boolean;
}

const a = (id: string, name: string, description: string, icon: AchievementDef['icon'], tier: AchievementDef['tier'], check: (c: AchievementContext) => boolean) => ({ id, name, description, icon, tier, check });

export const ACHIEVEMENTS = [
  a('first_match', 'Primer día en la oficina', 'Juega tu primera partida.', 'coffee', 'bronze', (c) => c.played >= 1),
  a('first_win', 'Primera sangre (de tinta)', 'Gana tu primera partida.', 'sword', 'bronze', (c) => c.wins >= 1),
  a('streak_3', 'Imparable', 'Gana 3 partidas seguidas.', 'flame', 'silver', (c) => c.winStreak >= 3),
  a('wins_10', 'Empleado del mes', 'Gana 10 partidas.', 'crown', 'silver', (c) => c.wins >= 10),
  a('played_50', 'Veterano del open space', 'Juega 50 partidas.', 'briefcase', 'gold', (c) => c.played >= 50),
  a('fast_fingers', 'Dedos de rayo', 'Escribe a 80 PPM o más en Typing Battle o Racing Battle.', 'zap', 'silver', (c) => (c.mode === 'typing' || c.mode === 'racing') && c.result !== 'abandon' && c.wpm >= 80),
  a('flawless', 'Cero errores', 'Gana con 10 aciertos o más y ningún error.', 'target', 'silver', (c) => c.result === 'win' && c.correct >= 10 && c.errors === 0),
  a('accountant', 'Contador real', 'Resuelve 25 cálculos correctos en una partida de Cálculo Express.', 'calc', 'silver', (c) => c.mode === 'math' && c.correct >= 25),
  a('shortcut_master', 'Maestro de atajos', 'Acierta 30 atajos en una partida de Atajos de Teclado.', 'keyboard', 'gold', (c) => c.mode === 'keys' && c.correct >= 30),
  a('sage', 'Sabio del reino', 'Resuelve 12 acertijos en una partida de Puzzle Battle.', 'star', 'silver', (c) => c.mode === 'puzzle' && c.correct >= 12),
  a('multitask', 'Multitarea', 'Gana al menos una vez en 5 modos distintos.', 'layers', 'gold', (c) => c.modesWon >= 5),
  a('race_winner', 'Primero en la meta', 'Gana una carrera de 3 o más jugadores.', 'flag', 'silver', (c) => c.mode === 'racing' && c.players >= 3 && c.result === 'win'),
  a('level_5', 'Ascenso', 'Llega al nivel 5.', 'trend', 'bronze', (c) => c.level >= 5),
  a('level_10', 'Gerencia', 'Llega al nivel 10.', 'trend', 'gold', (c) => c.level >= 10),
  a('networking', 'Networking', 'Juega una partida teniendo 3 contactos o más.', 'users', 'bronze', (c) => c.friends >= 3),
  a('best_friend', 'Mejor amigo', 'Gana con una mascota a tu lado.', 'paw', 'bronze', (c) => c.result === 'win' && c.hasPet),
] as const satisfies readonly (AchievementDef & { check: (c: AchievementContext) => boolean })[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];
export const ACHIEVEMENTS_BY_ID = new Map<string, AchievementDef>(ACHIEVEMENTS.map((x) => [x.id, x]));

/** Achievements earned with this context that the player does not have yet. */
export function newAchievements(ctx: AchievementContext, owned: Iterable<string>): string[] {
  const have = new Set(owned);
  return ACHIEVEMENTS.filter((x) => !have.has(x.id) && x.check(ctx)).map((x) => x.id);
}
