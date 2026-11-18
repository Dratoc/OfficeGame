import { useEffect, useRef } from 'react';
import type { ChairsFrame, PublicUser } from '@inbox/shared';
import { getSocket, serverNow } from '../lib/socket';
import { OnlineChairsRace } from '../chairs/online';

interface Props {
  matchId: string;
  meId: string;
  players: PublicUser[];
  startAt: number;
  endAt: number;
}

/** The 3D track of an online chair race. Loaded on demand, like the Office Battle arena. */
export default function ChairsStage({ matchId, meId, players, startAt, endAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const race = useRef<OnlineChairsRace | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const r = new OnlineChairsRace(ref.current!, {
      matchId,
      meId,
      racers: players.map((u) => ({ id: u.id, name: u.username, avatar: u.avatar, me: u.id === meId })),
      startAt,
      endAt,
      serverNow,
      send: (batch) => socket.emit('chairs:input', batch),
    });
    race.current = r;
    const onFrame = (d: { matchId: string; frame: ChairsFrame }) => d.matchId === matchId && r.onFrame(d.frame);
    socket.on('chairs:frame', onFrame);
    ref.current?.focus();
    return () => {
      socket.off('chairs:frame', onFrame);
      r.dispose();
      race.current = null;
    };
    // The track is built once per match; the clock is updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, meId]);

  useEffect(() => {
    race.current?.setClock(startAt, endAt);
  }, [startAt, endAt]);

  return <div className="office-stage chairs-stage" ref={ref} tabIndex={0} aria-label="Pista 3D de la carrera de sillas" />;
}
