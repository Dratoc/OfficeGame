import { useEffect, useRef } from 'react';
import type { AvatarConfig, PowerId, PublicUser } from '@inbox/shared';
import { PracticeMatch } from '../office/practice';

/** Sparring partners: office executives who never miss a meeting. */
const RIVALS: { name: string; avatar: AvatarConfig }[] = [
  {
    name: 'Gerente Dragón',
    avatar: { skin: 0, hairColor: 0, equipped: { head: 'head_dragon', eyes: 'eyes_glow', outfit: 'outfit_gold', headgear: 'headgear_crown', cape: 'cape_royal', weapon: 'weapon_mug', pet: 'pet_dragon_red' } },
  },
  {
    name: 'Contadora Elfa',
    avatar: { skin: 0, hairColor: 3, equipped: { head: 'head_elf', eyes: 'eyes_sharp', hair: 'hair_long', outfit: 'outfit_mage', headgear: 'headgear_wizard', weapon: 'weapon_staff', wings: 'wings_angel' } },
  },
  {
    name: 'Orco de Logística',
    avatar: { skin: 2, hairColor: 4, equipped: { head: 'head_orc', eyes: 'eyes_dot', hair: 'hair_mohawk', beard: 'beard_viking', outfit: 'outfit_iron', headgear: 'headgear_viking', weapon: 'weapon_stapler' } },
  },
];

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
      rivals: RIVALS.slice(0, bots),
      skill,
      onEnd: (r, place) => end.current(`${r}:${place}`),
    });
    return () => m.dispose();
    // A new round is started by remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="office-stage" ref={ref} tabIndex={0} aria-label="Arena 3D de práctica" />;
}
