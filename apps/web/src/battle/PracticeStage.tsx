import { useEffect, useRef } from 'react';
import type { AvatarConfig, PublicUser } from '@inbox/shared';
import { PracticeMatch } from '../office/practice';

/** The sparring partner: a dragon executive who never misses a meeting. */
const RIVAL: AvatarConfig = {
  skin: 0,
  hairColor: 0,
  equipped: { head: 'head_dragon', eyes: 'eyes_glow', outfit: 'outfit_gold', headgear: 'headgear_crown', cape: 'cape_royal', weapon: 'weapon_mug', pet: 'pet_dragon_red' },
};

export default function PracticeStage({ me, skill, onEnd }: { me: PublicUser; skill: number; onEnd: (r: 'win' | 'loss' | 'draw') => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const m = new PracticeMatch(ref.current!, {
      me: { name: me.username, avatar: me.avatar },
      rival: { name: 'Gerente Dragón', avatar: RIVAL },
      skill,
      onEnd: (r) => end.current(r),
    });
    return () => m.dispose();
  }, [me.username, me.avatar, skill]);
  return <div className="office-stage" ref={ref} tabIndex={0} aria-label="Arena 3D de práctica" />;
}
