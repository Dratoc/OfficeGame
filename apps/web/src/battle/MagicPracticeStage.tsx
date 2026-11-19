import { useEffect, useRef } from 'react';
import type { MfWorld } from '@inbox/shared';
import { MagicPractice } from '../magic/practice';

interface Props {
  skill: number;
  onEnd: (world: MfWorld) => void;
}

/** Magic Frontiers: your commander and army against an AI army, without the server. */
export default function MagicPracticeStage({ skill, onEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const g = new MagicPractice(ref.current!, { skill, onEnd: (w) => end.current(w) });
    return () => g.dispose();
    // A new battle is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage magic-stage" ref={ref} tabIndex={0} aria-label="Campo de batalla 3D de Magic Frontiers" />;
}
