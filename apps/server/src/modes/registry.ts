import type { GameModeId } from '@inbox/shared';
import type { GameMode } from './types';
import { officeMode } from './office';
import { chairsMode } from './chairs';
import { salesMode } from './sales';
import { zombiesMode } from './zombies';
import { keysMode, mathMode, puzzleMode, racingMode, taskMode, typingMode } from './sequence';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODE_REGISTRY: Partial<Record<GameModeId, GameMode<any, any, any, any>>> = {
  typing: typingMode,
  math: mathMode,
  keys: keysMode,
  task: taskMode,
  racing: racingMode,
  puzzle: puzzleMode,
  office: officeMode,
  chairs: chairsMode,
  sales: salesMode,
  zombies: zombiesMode,
};
