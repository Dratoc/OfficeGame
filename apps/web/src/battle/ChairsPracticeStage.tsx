import { useEffect, useRef } from 'react';
import type { PublicUser } from '@inbox/shared';
import { ChairsPractice } from '../chairs/practice';
import { PRACTICE_RIVALS } from './rivals';

interface Props {
  me: PublicUser;
  skill: number;
  bots: number;
  onEnd: (summary: string) => void;
}

/** Chair race against one to three bots, without the server. */
export default function ChairsPracticeStage({ me, skill, bots, onEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const r = new ChairsPractice(ref.current!, {
      me: { name: me.username, avatar: me.avatar },
      rivals: PRACTICE_RIVALS.slice(0, bots),
      skill,
      onEnd: (place, of) => end.current(`${place}:${of}`),
    });
    return () => r.dispose();
    // A new round is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage chairs-stage" ref={ref} tabIndex={0} aria-label="Pista 3D de práctica de la carrera de sillas" />;
}
