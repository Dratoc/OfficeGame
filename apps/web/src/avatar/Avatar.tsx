import { useId, type ReactNode } from 'react';
import { HAIR_COLORS, SKIN_TONES, type AvatarConfig } from '@inbox/shared';

export type Pose = 'idle' | 'win' | 'lose' | 'run' | 'wave';

interface Props {
  config: AvatarConfig;
  pose?: Pose;
  /** 'full' shows the whole character, 'bust' crops to head and shoulders for lists. */
  crop?: 'full' | 'bust';
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Layered SVG avatar. Every equipped item draws one layer; poses are CSS animations
 * on named groups (body, arms, head, pet), so new items only need new shapes.
 */
export function Avatar({ config, pose = 'idle', crop = 'full', size = 160, className = '', title }: Props) {
  const uid = useId().replace(/:/g, '');
  const eq = config.equipped;
  const skin = SKIN_TONES[config.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[config.hairColor] ?? HAIR_COLORS[0];
  const head = eq.head ?? 'head_human';
  const isDragon = head === 'head_dragon';
  const faceColor = head === 'head_orc' ? '#86a95d' : isDragon ? '#3f9b74' : skin;
  const viewBox = crop === 'bust' ? '58 20 124 124' : '0 0 240 240';

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      className={`avatar crop-${crop} pose-${pose} ${className}`}
      role="img"
      aria-label={title ?? 'Avatar'}
    >
      <defs>
        <radialGradient id={`aura-${uid}`}>
          <stop offset="0%" stopColor="#ffb347" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ff6a2b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff6a2b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`myth-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5fa2" />
          <stop offset="50%" stopColor="#7a5cff" />
          <stop offset="100%" stopColor="#38d6e0" />
        </linearGradient>
        <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#c8892a" />
        </linearGradient>
        <linearGradient id={`flame-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff4d1f" />
          <stop offset="60%" stopColor="#ff9f1c" />
          <stop offset="100%" stopColor="#ffe066" />
        </linearGradient>
        <linearGradient id={`phoenix-${uid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff3d2e" />
          <stop offset="55%" stopColor="#ff9a1f" />
          <stop offset="100%" stopColor="#ffe36b" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      {crop === 'full' && <ellipse className="av-shadow" cx="120" cy="222" rx="46" ry="7" fill="#000" opacity="0.12" />}

      <g className="av-root">
        {eq.effect === 'effect_fire' && <ellipse className="fx-fire" cx="120" cy="140" rx="86" ry="100" fill={`url(#aura-${uid})`} />}
        {eq.effect === 'effect_mythic' && (
          <g className="fx-mythic">
            <circle cx="120" cy="130" r="92" fill="none" stroke={`url(#myth-${uid})`} strokeWidth="5" strokeDasharray="14 10" opacity="0.8" />
            <circle cx="120" cy="130" r="80" fill={`url(#myth-${uid})`} opacity="0.12" />
          </g>
        )}

        <g className="av-body">
          {wings(eq.wings, uid)}
          {cape(eq.cape)}
          {legs(eq.outfit)}
          {torso(eq.outfit, uid)}
          <g className="av-arm av-arm-l">{arm(eq.outfit, skin, 'l', faceColor)}</g>

          <g className="av-head">
            {eq.hair === 'hair_long' && !isDragon && <path d="M78 78 Q74 138 92 150 L148 150 Q166 138 162 78 Z" fill={hair} />}
            {headShape(head, faceColor)}
            {eyes(eq.eyes, isDragon)}
            {mouth(pose, isDragon)}
            {!isDragon && beard(eq.beard, hair)}
            {!isDragon && hairFront(eq.hair, hair, uid)}
            {headgear(eq.headgear, uid)}
          </g>

          <g className="av-arm av-arm-r">
            {arm(eq.outfit, skin, 'r', faceColor)}
            {weapon(eq.weapon)}
          </g>
        </g>

        {eq.effect === 'effect_sparkles' && (
          <g className="fx-sparkles" fill="#ffd95e">
            {sparkle(60, 60, 7, 0)}
            {sparkle(184, 84, 5, 1)}
            {sparkle(176, 168, 6, 2)}
            {sparkle(56, 160, 5, 3)}
          </g>
        )}
        {eq.effect === 'effect_fire' && (
          <g className="fx-embers" fill="#ffb347">
            <circle cx="70" cy="190" r="3" />
            <circle cx="170" cy="200" r="2.5" />
            <circle cx="150" cy="186" r="2" />
          </g>
        )}
      </g>

      {eq.pet && <g className={`av-pet pet-${eq.pet}`}>{pet(eq.pet, uid)}</g>}
      {pose === 'lose' && crop === 'full' && (
        <g className="av-cloud">
          <ellipse cx="108" cy="16" rx="22" ry="12" fill="#9aa5b1" />
          <ellipse cx="130" cy="14" rx="18" ry="11" fill="#aab4bf" />
          <g stroke="#6aa3d8" strokeWidth="2" strokeLinecap="round" className="av-rain">
            <line x1="104" y1="30" x2="101" y2="38" />
            <line x1="118" y1="30" x2="115" y2="38" />
            <line x1="132" y1="28" x2="129" y2="36" />
          </g>
        </g>
      )}
    </svg>
  );
}

function sparkle(x: number, y: number, r: number, i: number) {
  return <path key={i} className={`spark spark-${i}`} d={`M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z`} />;
}

/* ---------- outfit ---------- */

const OUTFIT: Record<string, { main: string; dark: string; pants: string; shoes: string }> = {
  outfit_suit: { main: '#2d3f5c', dark: '#22314a', pants: '#26354e', shoes: '#1b1b1f' },
  outfit_sweater: { main: '#4f8a6d', dark: '#3f7159', pants: '#b59b74', shoes: '#5b4636' },
  outfit_iron: { main: '#9aa4ae', dark: '#77818b', pants: '#5f6871', shoes: '#4a4f55' },
  outfit_mage: { main: '#5b3f93', dark: '#47307a', pants: '#47307a', shoes: '#2d1f4d' },
  outfit_gold: { main: '#d9a93a', dark: '#b88a26', pants: '#8a6a22', shoes: '#5e4818' },
};
const outfitOf = (id?: string | null) => OUTFIT[id ?? 'outfit_suit'] ?? OUTFIT.outfit_suit!;

function legs(id?: string | null) {
  const o = outfitOf(id);
  if (id === 'outfit_mage') {
    return (
      <g className="av-legs">
        <path d="M86 168 L80 212 L160 212 L154 168 Z" fill={o.main} />
        <path d="M80 206 L160 206 L160 212 L80 212 Z" fill="#e8c766" />
        <ellipse cx="104" cy="214" rx="11" ry="5" fill={o.shoes} />
        <ellipse cx="136" cy="214" rx="11" ry="5" fill={o.shoes} />
      </g>
    );
  }
  return (
    <g className="av-legs">
      <g className="av-leg av-leg-l">
        <rect x="100" y="172" width="16" height="38" rx="6" fill={o.pants} />
        <ellipse cx="106" cy="212" rx="12" ry="6" fill={o.shoes} />
      </g>
      <g className="av-leg av-leg-r">
        <rect x="124" y="172" width="16" height="38" rx="6" fill={o.pants} />
        <ellipse cx="134" cy="212" rx="12" ry="6" fill={o.shoes} />
      </g>
    </g>
  );
}

function torso(id: string | null | undefined, uid: string) {
  const o = outfitOf(id);
  switch (id) {
    case 'outfit_sweater':
      return (
        <g>
          <rect x="92" y="118" width="56" height="60" rx="16" fill={o.main} />
          <path d="M94 140 H146 M94 150 H146 M94 160 H146" stroke={o.dark} strokeWidth="3" />
          <path d="M108 118 Q120 130 132 118" fill="#f4efe6" />
        </g>
      );
    case 'outfit_iron':
      return (
        <g>
          <rect x="90" y="118" width="60" height="60" rx="14" fill={o.main} />
          <path d="M90 138 H150" stroke={o.dark} strokeWidth="3" />
          <path d="M90 158 H150" stroke={o.dark} strokeWidth="3" />
          <circle cx="98" cy="128" r="2.5" fill={o.dark} />
          <circle cx="142" cy="128" r="2.5" fill={o.dark} />
          <path d="M116 120 L124 120 L126 128 L120 158 L114 128 Z" fill="#b4373a" />
          <rect x="88" y="114" width="20" height="14" rx="6" fill="#b7c0c9" />
          <rect x="132" y="114" width="20" height="14" rx="6" fill="#b7c0c9" />
        </g>
      );
    case 'outfit_mage':
      return (
        <g>
          <path d="M92 124 Q120 112 148 124 L154 172 L86 172 Z" fill={o.main} />
          <path d="M112 118 L120 172 L128 118" fill="none" stroke="#e8c766" strokeWidth="3" />
          <path d="M100 146 l3 6 l6 1 l-5 4 l1 6 l-5 -3 l-5 3 l1 -6 l-5 -4 l6 -1 Z" fill="#e8c766" />
          <path d="M136 156 l2 4 l4 0.5 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -0.5 Z" fill="#e8c766" />
        </g>
      );
    case 'outfit_gold':
      return (
        <g>
          <rect x="90" y="118" width="60" height="60" rx="14" fill={`url(#gold-${uid})`} />
          <path d="M90 140 Q120 150 150 140" stroke={o.dark} strokeWidth="3" fill="none" />
          <path d="M116 120 L124 120 L126 128 L120 154 L114 128 Z" fill="#2d3f5c" />
          <circle cx="120" cy="164" r="5" fill="#d64545" stroke="#fff3c4" strokeWidth="2" />
          <rect x="86" y="112" width="22" height="16" rx="7" fill={`url(#gold-${uid})`} />
          <rect x="132" y="112" width="22" height="16" rx="7" fill={`url(#gold-${uid})`} />
          <path d="M100 126 L106 136" stroke="#fff6d0" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="92" y="118" width="56" height="60" rx="16" fill={o.main} />
          <path d="M108 118 L120 146 L132 118 Z" fill="#f6f4ef" />
          <path d="M117 124 L123 124 L125 130 L120 150 L115 130 Z" fill="#c0392b" />
          <path d="M108 118 L120 146 L106 152 L98 122 Z" fill={o.dark} />
          <path d="M132 118 L120 146 L134 152 L142 122 Z" fill={o.dark} />
        </g>
      );
  }
}

function arm(outfitId: string | null | undefined, skin: string, side: 'l' | 'r', face: string) {
  const o = outfitOf(outfitId);
  const sleeve = outfitId === 'outfit_gold' ? '#c99a30' : o.main;
  const hand = outfitId === 'outfit_iron' ? '#b7c0c9' : outfitId === 'outfit_gold' ? '#e0b44a' : face === skin ? skin : face;
  return side === 'l' ? (
    <g>
      <rect x="78" y="122" width="16" height="44" rx="8" fill={sleeve} transform="rotate(12 86 126)" />
      <circle cx="80" cy="168" r="8" fill={hand} />
    </g>
  ) : (
    <g>
      <rect x="146" y="122" width="16" height="44" rx="8" fill={sleeve} transform="rotate(-12 154 126)" />
      <circle cx="160" cy="168" r="8" fill={hand} />
    </g>
  );
}

/* ---------- back items ---------- */

function cape(id?: string | null) {
  if (!id) return null;
  const main = id === 'cape_royal' ? '#6c2bb3' : '#b4373a';
  const lining = id === 'cape_royal' ? '#f3ecdc' : '#7d2427';
  return (
    <g className="av-cape">
      <path d="M92 120 Q70 170 74 206 Q120 216 166 206 Q170 170 148 120 Z" fill={main} />
      <path d="M92 120 Q84 160 86 200 L96 202 Q94 160 100 124 Z" fill={lining} opacity="0.6" />
      {id === 'cape_royal' && (
        <g fill="#1d1d1d">
          <circle cx="98" cy="194" r="2" />
          <circle cx="120" cy="200" r="2" />
          <circle cx="142" cy="194" r="2" />
        </g>
      )}
    </g>
  );
}

function wings(id: string | null | undefined, uid: string) {
  if (!id) return null;
  if (id === 'wings_angel') {
    return (
      <g className="av-wings">
        <g className="wing wing-l">
          <path d="M96 132 Q50 90 30 120 Q44 126 40 136 Q56 136 54 148 Q72 146 76 158 Q90 150 98 146 Z" fill="#ffffff" stroke="#d5dbe3" strokeWidth="2" />
        </g>
        <g className="wing wing-r">
          <path d="M144 132 Q190 90 210 120 Q196 126 200 136 Q184 136 186 148 Q168 146 164 158 Q150 150 142 146 Z" fill="#ffffff" stroke="#d5dbe3" strokeWidth="2" />
        </g>
      </g>
    );
  }
  const fill = id === 'wings_phoenix' ? `url(#phoenix-${uid})` : '#7a2430';
  const membrane = id === 'wings_phoenix' ? `url(#phoenix-${uid})` : '#a8384a';
  return (
    <g className="av-wings">
      <g className="wing wing-l">
        <path d="M98 130 L40 84 L46 110 L24 112 L40 130 L26 146 L58 144 L64 160 L96 146 Z" fill={membrane} stroke={fill} strokeWidth="3" strokeLinejoin="round" />
      </g>
      <g className="wing wing-r">
        <path d="M142 130 L200 84 L194 110 L216 112 L200 130 L214 146 L182 144 L176 160 L144 146 Z" fill={membrane} stroke={fill} strokeWidth="3" strokeLinejoin="round" />
      </g>
    </g>
  );
}

/* ---------- head ---------- */

function headShape(id: string, color: string) {
  switch (id) {
    case 'head_elf':
      return (
        <g>
          <path d="M82 80 L60 62 L84 92 Z" fill={color} />
          <path d="M158 80 L180 62 L156 92 Z" fill={color} />
          <ellipse cx="120" cy="84" rx="40" ry="38" fill={color} />
          <ellipse cx="96" cy="98" rx="6" ry="3.5" fill="#ff8a8a" opacity="0.35" />
          <ellipse cx="144" cy="98" rx="6" ry="3.5" fill="#ff8a8a" opacity="0.35" />
        </g>
      );
    case 'head_orc':
      return (
        <g>
          <ellipse cx="80" cy="86" rx="9" ry="12" fill={color} />
          <ellipse cx="160" cy="86" rx="9" ry="12" fill={color} />
          <ellipse cx="120" cy="86" rx="42" ry="38" fill={color} />
          <path d="M104 108 L106 98 L110 108 Z" fill="#fffbe8" />
          <path d="M130 108 L134 98 L136 108 Z" fill="#fffbe8" />
          <path d="M92 70 Q104 64 112 70" stroke="#5f7d3e" strokeWidth="3" fill="none" />
          <path d="M128 70 Q136 64 148 70" stroke="#5f7d3e" strokeWidth="3" fill="none" />
        </g>
      );
    case 'head_dragon':
      return (
        <g>
          <path d="M88 56 L76 24 L100 50 Z" fill="#e8d9a8" />
          <path d="M152 56 L164 24 L140 50 Z" fill="#e8d9a8" />
          <path d="M104 46 L110 34 L116 46 M120 44 L126 32 L132 44" fill="#2e7a59" />
          <ellipse cx="120" cy="80" rx="40" ry="36" fill={color} />
          <ellipse cx="120" cy="102" rx="30" ry="18" fill="#58b38c" />
          <ellipse cx="112" cy="98" rx="3" ry="2" fill="#1f4d3a" />
          <ellipse cx="128" cy="98" rx="3" ry="2" fill="#1f4d3a" />
          <path d="M96 62 Q100 58 104 62 M136 62 Q140 58 144 62" stroke="#2e7a59" strokeWidth="2" fill="none" />
          <path d="M84 84 l-6 4 l6 4 M156 84 l6 4 l-6 4" stroke="#2e7a59" strokeWidth="2" fill="none" />
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx="81" cy="88" rx="7" ry="9" fill={color} />
          <ellipse cx="159" cy="88" rx="7" ry="9" fill={color} />
          <ellipse cx="120" cy="84" rx="40" ry="38" fill={color} />
          <ellipse cx="96" cy="98" rx="6" ry="3.5" fill="#ff8a8a" opacity="0.35" />
          <ellipse cx="144" cy="98" rx="6" ry="3.5" fill="#ff8a8a" opacity="0.35" />
        </g>
      );
  }
}

function eyes(id: string | null | undefined, dragon: boolean) {
  const y = dragon ? 74 : 86;
  const lx = 104;
  const rx = 136;
  switch (id) {
    case 'eyes_happy':
      return (
        <g className="av-eyes" stroke="#1d2a33" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d={`M${lx - 6} ${y + 2} Q${lx} ${y - 6} ${lx + 6} ${y + 2}`} />
          <path d={`M${rx - 6} ${y + 2} Q${rx} ${y - 6} ${rx + 6} ${y + 2}`} />
        </g>
      );
    case 'eyes_sharp':
      return (
        <g className="av-eyes">
          <path d={`M${lx - 9} ${y - 9} L${lx + 7} ${y - 5}`} stroke="#1d2a33" strokeWidth="3" strokeLinecap="round" />
          <path d={`M${rx + 9} ${y - 9} L${rx - 7} ${y - 5}`} stroke="#1d2a33" strokeWidth="3" strokeLinecap="round" />
          <g className="blink">
            <path d={`M${lx - 7} ${y} L${lx + 7} ${y - 2} L${lx + 3} ${y + 4} Z`} fill="#1d2a33" />
            <path d={`M${rx + 7} ${y} L${rx - 7} ${y - 2} L${rx - 3} ${y + 4} Z`} fill="#1d2a33" />
          </g>
        </g>
      );
    case 'eyes_glow':
      return (
        <g className="av-eyes eyes-glow">
          <ellipse cx={lx} cy={y} rx="9" ry="7" fill="#7af5ff" opacity="0.35" />
          <ellipse cx={rx} cy={y} rx="9" ry="7" fill="#7af5ff" opacity="0.35" />
          <g className="blink">
            <ellipse cx={lx} cy={y} rx="5" ry="5.5" fill="#bffbff" stroke="#22c3d6" strokeWidth="1.5" />
            <ellipse cx={rx} cy={y} rx="5" ry="5.5" fill="#bffbff" stroke="#22c3d6" strokeWidth="1.5" />
          </g>
        </g>
      );
    default:
      return (
        <g className="av-eyes">
          <g className="blink">
            <ellipse cx={lx} cy={y} rx="4.5" ry="6" fill="#1d2a33" />
            <ellipse cx={rx} cy={y} rx="4.5" ry="6" fill="#1d2a33" />
            <circle cx={lx + 1.5} cy={y - 2} r="1.5" fill="#fff" />
            <circle cx={rx + 1.5} cy={y - 2} r="1.5" fill="#fff" />
          </g>
        </g>
      );
  }
}

function mouth(pose: Pose, dragon: boolean) {
  const y = dragon ? 108 : 104;
  if (pose === 'win') return <path d={`M108 ${y - 2} Q120 ${y + 12} 132 ${y - 2} Z`} fill="#7a2a2a" />;
  if (pose === 'lose') return <path d={`M110 ${y + 4} Q120 ${y - 4} 130 ${y + 4}`} stroke="#1d2a33" strokeWidth="3" fill="none" strokeLinecap="round" />;
  return <path d={`M111 ${y} Q120 ${y + 7} 129 ${y}`} stroke="#1d2a33" strokeWidth="3" fill="none" strokeLinecap="round" />;
}

function beard(id: string | null | undefined, color: string) {
  switch (id) {
    case 'beard_stubble':
      return <path d="M88 96 Q92 122 120 124 Q148 122 152 96 Q146 112 120 114 Q94 112 88 96 Z" fill={color} opacity="0.35" />;
    case 'beard_viking':
      return (
        <g>
          <path d="M84 92 Q86 132 120 138 Q154 132 156 92 Q146 112 132 108 Q120 116 108 108 Q94 112 84 92 Z" fill={color} />
          <path d="M108 134 L106 152 M132 134 L134 152" stroke={color} strokeWidth="6" strokeLinecap="round" />
          <circle cx="106" cy="154" r="3" fill="#c8962e" />
          <circle cx="134" cy="154" r="3" fill="#c8962e" />
          <path d={`M111 104 Q120 108 129 104`} stroke="#1d2a33" strokeWidth="2.5" fill="none" />
        </g>
      );
    case 'beard_wizard':
      return (
        <g>
          <path d="M86 94 Q90 120 104 128 L120 176 L136 128 Q150 120 154 94 Q144 112 120 112 Q96 112 86 94 Z" fill="#e9e6df" />
          <path d="M110 128 L120 160 L130 128" stroke="#cfcac0" strokeWidth="2" fill="none" />
          <path d="M104 104 Q112 98 120 104 Q128 98 136 104" stroke="#e9e6df" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

function hairFront(id: string | null | undefined, color: string, uid: string) {
  switch (id) {
    case 'hair_short':
      return <path d="M80 82 Q78 44 120 42 Q162 44 160 82 Q152 64 132 62 Q126 70 110 66 Q92 66 80 82 Z" fill={color} />;
    case 'hair_long':
      return <path d="M80 86 Q76 42 120 42 Q164 42 160 86 Q150 60 120 58 Q90 60 80 86 Z" fill={color} />;
    case 'hair_bun':
      return (
        <g>
          <circle cx="120" cy="38" r="14" fill={color} />
          <path d="M80 82 Q80 46 120 44 Q160 46 160 82 Q148 60 120 60 Q92 60 80 82 Z" fill={color} />
          <line x1="110" y1="26" x2="134" y2="46" stroke="#e8c766" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'hair_mohawk':
      return (
        <g>
          <path d="M108 60 L104 30 L114 42 L118 22 L124 42 L132 28 L132 60 Q120 56 108 60 Z" fill={color} />
          <path d="M84 76 Q90 62 104 60 L104 64 Q92 66 84 76 Z" fill={color} opacity="0.5" />
          <path d="M156 76 Q150 62 136 60 L136 64 Q148 66 156 76 Z" fill={color} opacity="0.5" />
        </g>
      );
    case 'hair_flame':
      return (
        <g className="hair-flame">
          <path d="M80 80 Q74 50 92 40 Q90 54 100 52 Q98 30 118 20 Q114 40 126 40 Q130 26 146 26 Q140 42 152 48 Q166 58 160 80 Q150 62 120 60 Q92 62 80 80 Z" fill={`url(#flame-${uid})`} />
        </g>
      );
    default:
      return null;
  }
}

function headgear(id: string | null | undefined, uid: string) {
  switch (id) {
    case 'headgear_knight':
      return (
        <g>
          <path d="M78 84 Q76 38 120 36 Q164 38 162 84 L150 84 Q150 66 120 64 Q90 66 90 84 Z" fill="#a9b2bb" />
          <rect x="88" y="68" width="64" height="8" rx="3" fill="#7d8790" />
          <path d="M120 36 Q126 14 146 12 Q132 22 134 36 Z" fill="#c0392b" />
        </g>
      );
    case 'headgear_viking':
      return (
        <g>
          <path d="M80 70 Q82 36 120 34 Q158 36 160 70 Z" fill="#8a929b" />
          <rect x="78" y="64" width="84" height="10" rx="4" fill="#6b5238" />
          <path d="M82 58 Q60 50 58 22 Q72 40 88 46 Z" fill="#f2ead2" />
          <path d="M158 58 Q180 50 182 22 Q168 40 152 46 Z" fill="#f2ead2" />
          <circle cx="100" cy="69" r="2.5" fill="#d4c08a" />
          <circle cx="140" cy="69" r="2.5" fill="#d4c08a" />
        </g>
      );
    case 'headgear_wizard':
      return (
        <g>
          <ellipse cx="120" cy="56" rx="54" ry="10" fill="#3a2766" />
          <path d="M84 56 Q110 40 118 -2 Q128 30 156 56 Z" fill="#5b3f93" />
          <path d="M92 50 Q120 46 150 50" stroke="#e8c766" strokeWidth="5" fill="none" />
          <path d="M116 22 l2 4 l4 0.5 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -0.5 Z" fill="#e8c766" />
        </g>
      );
    case 'headgear_crown':
      return (
        <g>
          <path d="M90 54 L92 28 L106 42 L120 22 L134 42 L148 28 L150 54 Z" fill={`url(#gold-${uid})`} stroke="#a8761c" strokeWidth="1.5" />
          <circle cx="120" cy="44" r="4" fill="#d64545" />
          <circle cx="102" cy="48" r="3" fill="#3f7cc4" />
          <circle cx="138" cy="48" r="3" fill="#2f9e6a" />
        </g>
      );
    case 'headgear_mythic':
      return (
        <g className="crown-mythic">
          <path d="M88 54 L90 24 L104 40 L112 14 L120 34 L128 14 L136 40 L150 24 L152 54 Z" fill={`url(#myth-${uid})`} stroke="#fff" strokeWidth="1.5" />
          <circle cx="120" cy="44" r="4.5" fill="#fff" />
          <g fill="#fff" className="fx-orbit">
            {sparkle(84, 18, 5, 10)}
            {sparkle(158, 12, 4, 11)}
            {sparkle(120, 0, 4, 12)}
          </g>
        </g>
      );
    default:
      return null;
  }
}

/* ---------- held items ---------- */

function weapon(id: string | null | undefined) {
  switch (id) {
    case 'weapon_mug':
      return (
        <g>
          <rect x="160" y="152" width="18" height="20" rx="3" fill="#f4efe6" stroke="#cdbfa8" strokeWidth="1.5" />
          <path d="M178 156 Q186 162 178 168" stroke="#cdbfa8" strokeWidth="3" fill="none" />
          <rect x="163" y="158" width="12" height="4" fill="#0f5c63" opacity="0.6" />
          <g className="steam" stroke="#b9c2ca" strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M164 146 Q160 140 165 134" />
            <path d="M172 146 Q168 140 173 134" />
          </g>
        </g>
      );
    case 'weapon_sword':
      return (
        <g>
          <rect x="157" y="104" width="7" height="58" rx="2" fill="#dfe6ec" stroke="#9aa4ae" strokeWidth="1" />
          <path d="M157 104 L160.5 94 L164 104 Z" fill="#dfe6ec" />
          <rect x="150" y="160" width="21" height="5" rx="2" fill="#c8962e" />
          <rect x="158" y="164" width="5" height="12" rx="2" fill="#6b4029" />
        </g>
      );
    case 'weapon_staff':
      return (
        <g>
          <rect x="157" y="96" width="6" height="110" rx="3" fill="#7a5233" />
          <circle cx="160" cy="92" r="10" fill="#7af5ff" opacity="0.4" className="orb-glow" />
          <circle cx="160" cy="92" r="6" fill="#bffbff" stroke="#22c3d6" strokeWidth="1.5" />
        </g>
      );
    case 'weapon_stapler':
      return (
        <g>
          <rect x="157" y="112" width="6" height="66" rx="3" fill="#6b4029" />
          <path d="M150 110 L178 104 L178 128 L150 124 Z" fill="#c0392b" />
          <rect x="148" y="106" width="32" height="6" rx="2" fill="#2d2d33" />
          <path d="M178 104 Q190 116 178 128" fill="#b7c0c9" stroke="#7d8790" strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

/* ---------- pets ---------- */

function pet(id: string, uid: string): ReactNode {
  if (id === 'pet_cat') {
    return (
      <g transform="translate(196 186)">
        <path d="M14 26 Q30 22 26 6" stroke="#f0a35e" strokeWidth="5" fill="none" strokeLinecap="round" className="cat-tail" />
        <ellipse cx="0" cy="22" rx="16" ry="12" fill="#f0a35e" />
        <circle cx="0" cy="4" r="12" fill="#f0a35e" />
        <path d="M-10 -2 L-10 -14 L-2 -6 Z M10 -2 L10 -14 L2 -6 Z" fill="#f0a35e" />
        <circle cx="-4" cy="3" r="1.8" fill="#1d2a33" />
        <circle cx="4" cy="3" r="1.8" fill="#1d2a33" />
        <path d="M-2 8 Q0 10 2 8" stroke="#1d2a33" strokeWidth="1.2" fill="none" />
        <path d="M-6 16 h12" stroke="#d9874a" strokeWidth="2" />
      </g>
    );
  }
  const body = id === 'pet_dragon_red' ? '#d84a3a' : id === 'pet_dragon_gold' ? `url(#gold-${uid})` : '#4fb07c';
  const belly = id === 'pet_dragon_red' ? '#f3b07a' : id === 'pet_dragon_gold' ? '#fff3c4' : '#c8eac0';
  const wing = id === 'pet_dragon_red' ? '#a8322a' : id === 'pet_dragon_gold' ? '#c8892a' : '#2f8a5c';
  return (
    <g transform="translate(200 120)">
      <g className="dragon-pet">
      <g className="dragon-wing">
        <path d="M-2 -6 L-22 -24 L-18 -10 L-28 -8 L-6 4 Z" fill={wing} />
      </g>
      <path d="M8 14 Q24 20 22 6 Q20 0 26 -2" stroke={body} strokeWidth="5" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="6" rx="13" ry="11" fill={body} />
      <ellipse cx="2" cy="9" rx="7" ry="6" fill={belly} />
      <circle cx="-6" cy="-10" r="10" fill={body} />
      <path d="M-12 -18 L-14 -28 L-8 -19 Z M-2 -19 L0 -28 L2 -17 Z" fill={belly} />
      <circle cx="-9" cy="-11" r="2" fill="#1d2a33" />
      <circle cx="-3" cy="-11" r="2" fill="#1d2a33" />
      <ellipse cx="-12" cy="-5" rx="5" ry="3.5" fill={belly} />
      <g className="dragon-fire">
        <path d="M-17 -5 Q-26 -9 -30 -4 Q-26 -1 -17 -3 Z" fill="#ffb347" />
      </g>
      </g>
    </g>
  );
}
