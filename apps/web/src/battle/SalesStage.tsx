import { useEffect, useRef } from 'react';
import type { PublicUser, SalesFrame } from '@inbox/shared';
import { getSocket, serverNow } from '../lib/socket';
import { OnlineSales } from '../sales/online';

interface Props {
  matchId: string;
  meId: string;
  players: PublicUser[];
  startAt: number;
  endAt: number;
}

/** The 3D dealership of an online shift of A Toda Máquina. Loaded on demand, like the other 3D modes. */
export default function SalesStage({ matchId, meId, players, startAt, endAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const game = useRef<OnlineSales | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const g = new OnlineSales(ref.current!, {
      matchId,
      meId,
      team: players.map((u) => ({ id: u.id, name: u.username, avatar: u.avatar, me: u.id === meId })),
      startAt,
      endAt,
      serverNow,
      send: (batch) => socket.emit('sales:input', batch),
    });
    game.current = g;
    const onFrame = (d: { matchId: string; frame: SalesFrame }) => d.matchId === matchId && g.onFrame(d.frame);
    socket.on('sales:frame', onFrame);
    ref.current?.focus();
    return () => {
      socket.off('sales:frame', onFrame);
      g.dispose();
      game.current = null;
    };
    // The floor is built once per match; the clock is updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, meId]);

  useEffect(() => {
    game.current?.setClock(startAt, endAt);
  }, [startAt, endAt]);

  return <div className="office-stage sales-stage" ref={ref} tabIndex={0} aria-label="Local 3D de A Toda Máquina" />;
}
