import type { GameModeId } from '@inbox/shared';
import type { GameMode } from './types';
import { keysMode, mathMode, racingMode, taskMode, typingMode } from './sequence';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODE_REGISTRY: Partial<Record<GameModeId, GameMode<any, any, any>>> = {
  typing: typingMode,
  math: mathMode,
  keys: keysMode,
  task: taskMode,
  racing: racingMode,
};
