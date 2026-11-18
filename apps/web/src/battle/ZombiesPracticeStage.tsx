import { useEffect, useRef } from 'react';
import type { PublicUser, ZombieWorld } from '@inbox/shared';
import { ZombiePractice } from '../zombies/practice';
import { PRACTICE_RIVALS } from './rivals';

interface Props {
  me: PublicUser;
  skill: number;
  bots: number;
  onEnd: (world: ZombieWorld) => void;
}

/** A Zona Zombi match with zero to three bot teammates, without the server. */
export default function ZombiesPracticeStage({ me, skill, bots, onEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const g = new ZombiePractice(ref.current!, {
      me: { name: me.username, avatar: me.avatar },
      mates: PRACTICE_RIVALS.slice(0, bots),
      skill,
      onEnd: (w) => end.current(w),
    });
    return () => g.dispose();
    // A new match is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage zombies-stage" ref={ref} tabIndex={0} aria-label="Mapa 3D de práctica de Zona Zombi" />;
}
