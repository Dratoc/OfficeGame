import { useEffect, useRef } from 'react';
import type { PowerId, PublicUser } from '@inbox/shared';
import { PracticeMatch } from '../office/practice';
import { PRACTICE_RIVALS } from './rivals';

interface Props {
  me: PublicUser;
  skill: number;
  bots: number;
  powers: PowerId[];
  onEnd: (summary: string) => void;
}

export default function PracticeStage({ me, skill, bots, powers, onEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const m = new PracticeMatch(ref.current!, {
      me: { name: me.username, avatar: me.avatar, powers },
      rivals: PRACTICE_RIVALS.slice(0, bots),
      skill,
      onEnd: (r, place) => end.current(`${r}:${place}`),
    });
    return () => m.dispose();
    // A new round is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage" ref={ref} tabIndex={0} aria-label="Arena 3D de práctica" />;
}
