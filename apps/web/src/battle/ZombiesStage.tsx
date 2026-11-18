import { useEffect, useRef } from 'react';
import type { PublicUser, ZombieFrame } from '@inbox/shared';
import { getSocket, serverNow } from '../lib/socket';
import { OnlineZombies } from '../zombies/online';

interface Props {
  matchId: string;
  meId: string;
  players: PublicUser[];
  startAt: number;
  endAt: number;
}

/** The 3D map of an online Zona Zombi match. Loaded on demand, like the other 3D modes. */
export default function ZombiesStage({ matchId, meId, players, startAt, endAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const game = useRef<OnlineZombies | null>(null);
  const team = players.map((u) => ({ id: u.id, name: u.username, avatar: u.avatar, me: u.id === meId }));

  useEffect(() => {
    const socket = getSocket();
    const g = new OnlineZombies(ref.current!, { matchId, meId, team, startAt, endAt, serverNow, send: (batch) => socket.emit('zombies:input', batch) });
    game.current = g;
    const onFrame = (d: { matchId: string; frame: ZombieFrame }) => d.matchId === matchId && g.onFrame(d.frame);
    socket.on('zombies:frame', onFrame);
    ref.current?.focus();
    return () => {
      socket.off('zombies:frame', onFrame);
      g.dispose();
      game.current = null;
    };
    // The map is built once per match; the clock and the players are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, meId]);

  useEffect(() => {
    game.current?.setClock(startAt, endAt);
  }, [startAt, endAt]);

  const key = players.map((p) => p.id).join(',');
  useEffect(() => {
    game.current?.setTeam(team);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div className="office-stage zombies-stage" ref={ref} tabIndex={0} aria-label="Mapa 3D de Zona Zombi" />;
}
