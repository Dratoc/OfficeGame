import type { GameModeId } from '@inbox/shared';
import type { GameMode } from './types';
import { typingMode } from './typing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODE_REGISTRY: Partial<Record<GameModeId, GameMode<any, any, any>>> = {
  typing: typingMode,
};
