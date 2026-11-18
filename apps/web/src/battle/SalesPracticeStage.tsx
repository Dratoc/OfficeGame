import { useEffect, useRef } from 'react';
import type { PublicUser, SalesWorld } from '@inbox/shared';
import { SalesPractice } from '../sales/practice';
import { PRACTICE_RIVALS } from './rivals';

interface Props {
  me: PublicUser;
  skill: number;
  bots: number;
  onEnd: (world: SalesWorld) => void;
}

/** A shift of A Toda Máquina with zero to three bot teammates, without the server. */
export default function SalesPracticeStage({ me, skill, bots, onEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const g = new SalesPractice(ref.current!, {
      me: { name: me.username, avatar: me.avatar },
      mates: PRACTICE_RIVALS.slice(0, bots),
      skill,
      onEnd: (w) => end.current(w),
    });
    return () => g.dispose();
    // A new shift is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage sales-stage" ref={ref} tabIndex={0} aria-label="Local 3D de práctica de A Toda Máquina" />;
}
