import { useEffect, useRef } from 'react';
import type { PublicUser } from '@inbox/shared';
import { getSocket, serverNow } from '../lib/socket';
import { OnlineOfficeMatch } from '../office/online';

interface Props {
  matchId: string;
  meId: string;
  players: PublicUser[];
  startAt: number;
  endAt: number;
}

/**
 * The 3D arena of an online Office Battle. Loaded on demand so the 3D engine only downloads
 * for players who fight.
 */
export default function OfficeStage({ matchId, meId, players, startAt, endAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const match = useRef<OnlineOfficeMatch | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const m = new OnlineOfficeMatch(ref.current!, {
      matchId,
      meId,
      players: players.map((u) => ({ id: u.id, name: u.username, avatar: u.avatar, me: u.id === meId })),
      startAt,
      endAt,
      serverNow,
      send: (batch) => socket.emit('office:input', batch),
    });
    match.current = m;
    const onFrame = (d: { matchId: string; frame: Parameters<OnlineOfficeMatch['onFrame']>[0] }) => d.matchId === matchId && m.onFrame(d.frame);
    socket.on('match:frame', onFrame);
    ref.current?.focus();
    return () => {
      socket.off('match:frame', onFrame);
      m.dispose();
      match.current = null;
    };
    // The arena is built once per match; the clock is updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, meId]);

  useEffect(() => {
    match.current?.setClock(startAt, endAt);
  }, [startAt, endAt]);

  return <div className="office-stage" ref={ref} tabIndex={0} aria-label="Arena 3D de Office Battle" />;
}
