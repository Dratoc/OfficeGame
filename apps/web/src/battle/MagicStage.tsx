import { useEffect, useRef } from 'react';
import type { MagicFrame } from '@inbox/shared';
import { getSocket, serverNow } from '../lib/socket';
import { OnlineMagic } from '../magic/online';

interface Props {
  matchId: string;
  meId: string;
  startAt: number;
  endAt: number;
}

/** The 3D valley of an online Magic Frontiers conquest. Loaded on demand, like the other 3D modes. */
export default function MagicStage({ matchId, meId, startAt, endAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const game = useRef<OnlineMagic | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const g = new OnlineMagic(ref.current!, { matchId, meId, startAt, endAt, serverNow, send: (batch) => socket.emit('magic:input', batch) });
    game.current = g;
    const onFrame = (d: { matchId: string; frame: MagicFrame }) => d.matchId === matchId && g.onFrame(d.frame);
    socket.on('magic:frame', onFrame);
    ref.current?.focus();
    return () => {
      socket.off('magic:frame', onFrame);
      g.dispose();
      game.current = null;
    };
    // The valley is built once per match; the clock is updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, meId]);

  useEffect(() => {
    game.current?.setClock(startAt, endAt);
  }, [startAt, endAt]);

  return <div className="office-stage magic-stage" ref={ref} tabIndex={0} aria-label="Valle 3D de Magic Frontiers" />;
}
