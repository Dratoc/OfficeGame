import { AnimatePresence, motion } from 'framer-motion';
import type { PublicUser } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';

export interface DuelEffect {
  id: number;
  userId: string;
  kind: 'hit' | 'miss' | 'reject';
  /** Server time when it happened. */
  at: number;
}

interface Side {
  user: PublicUser;
  correctWords: number;
  errors: number;
}

const FLY_MS = 380;

/** Each player's projectile depends on their look: dragons breathe fire, wizards cast stars. */
function projectileOf(user: PublicUser): 'fire' | 'star' | 'plane' {
  const eq = user.avatar.equipped;
  if (eq.head === 'head_dragon' || eq.pet?.startsWith('pet_dragon')) return 'fire';
  if (eq.weapon === 'weapon_staff' || eq.weapon === 'weapon_sword' || eq.weapon === 'weapon_stapler' || eq.headgear === 'headgear_wizard') return 'star';
  return 'plane';
}

function Projectile({ type }: { type: 'fire' | 'star' | 'plane' }) {
  if (type === 'fire') {
    return (
      <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">
        <path d="M46 16 Q30 2 10 8 Q0 16 10 24 Q30 30 46 16 Z" fill="#ff9f1c" />
        <path d="M40 16 Q28 8 16 12 Q10 16 16 20 Q28 24 40 16 Z" fill="#ffe066" />
      </svg>
    );
  }
  if (type === 'star') {
    return (
      <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
        <path d="M16 2 L20 12 L30 13 L22 20 L25 30 L16 24 L7 30 L10 20 L2 13 L12 12 Z" fill="#ffd95e" stroke="#c8962e" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 28" width="42" height="30" aria-hidden="true">
      <path d="M2 14 L38 2 L26 26 L18 17 Z" fill="#fff" stroke="#9aa5b1" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 17 L38 2" stroke="#9aa5b1" strokeWidth="1.2" />
    </svg>
  );
}

function recent(effects: DuelEffect[], userId: string, kind: DuelEffect['kind'], now: number, ms: number) {
  return effects.some((e) => e.userId === userId && e.kind === kind && now - e.at < ms);
}

function streak(effects: DuelEffect[], userId: string) {
  let n = 0;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.userId !== userId) continue;
    if (e.kind !== 'hit') break;
    n++;
  }
  return n;
}

/**
 * Live duel shown during every battle mode: each correct answer fires a projectile at the
 * rival, who flinches when it lands; each mistake makes your own character stumble.
 */
export function DuelStage({ me, opp, effects, now, unit, finished }: { me: Side; opp: Side; effects: DuelEffect[]; now: number; unit: string; finished: boolean }) {
  const total = me.correctWords + opp.correctWords;
  const share = total === 0 ? 50 : (me.correctWords / total) * 100;
  const sides = [
    { side: me, foe: opp, left: true },
    { side: opp, foe: me, left: false },
  ];
  const comboMe = streak(effects, me.user.id);

  return (
    <div className="duel">
      <div className="duel-score">
        <div className="duel-name">
          <strong>Tú</strong>
          <span>
            {me.correctWords} {unit} · {me.errors} errores
          </span>
        </div>
        <div className="duel-bar" aria-label="Quién va ganando">
          <div className="duel-bar-me" style={{ width: `${share}%` }} />
          <div className="duel-bar-knot" style={{ left: `${share}%` }} />
        </div>
        <div className="duel-name right">
          <strong>{opp.user.username}</strong>
          <span>
            {opp.correctWords} {unit} · {opp.errors} errores
          </span>
        </div>
      </div>

      <div className="duel-floor">
        {sides.map(({ side, foe, left }) => {
          const attacking = recent(effects, side.user.id, 'hit', now, 260);
          const hurt = recent(effects, foe.user.id, 'hit', now - FLY_MS * 0.8, 320);
          const stumble = recent(effects, side.user.id, 'miss', now, 450) || recent(effects, side.user.id, 'reject', now, 450);
          const leading = left ? me.correctWords > opp.correctWords : opp.correctWords > me.correctWords;
          const last = [...effects].reverse().find((e) => e.userId === side.user.id || (e.userId === foe.user.id && e.kind === 'hit'));
          const combo = streak(effects, side.user.id) >= 3;
          const emote = finished ? (leading ? 'cheer' : undefined) : attacking ? 'happy' : stumble || hurt ? 'sad' : combo ? 'cheer' : undefined;
          return (
            <div key={side.user.id} className={`duelist ${left ? 'left' : 'right'} ${attacking ? 'attack' : ''} ${hurt ? 'hurt' : ''} ${stumble ? 'stumble' : ''}`}>
              <div className="duelist-inner">
                <Avatar config={side.user.avatar} pose={finished ? (leading ? 'win' : 'idle') : 'idle'} size={150} emote={emote} emoteKey={last?.id} />
              </div>
              <AnimatePresence>
                {stumble && (
                  <motion.span className="bubble" initial={{ y: 6, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    ¡Ups!
                  </motion.span>
                )}
                {hurt && (
                  <motion.span className="bubble bubble-hit" initial={{ y: 6, opacity: 0, scale: 0.6 }} animate={{ y: -6, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    ¡Pum!
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <AnimatePresence>
          {effects
            .filter((e) => e.kind === 'hit' && now - e.at < FLY_MS)
            .map((e) => {
              const fromMe = e.userId === me.user.id;
              const shooter = fromMe ? me.user : opp.user;
              return (
                <motion.div
                  key={e.id}
                  className={`projectile ${fromMe ? '' : 'reverse'}`}
                  initial={{ left: fromMe ? '22%' : '78%', opacity: 1, rotate: 0 }}
                  animate={{ left: fromMe ? '74%' : '26%', rotate: fromMe ? 8 : -8 }}
                  exit={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: FLY_MS / 1000, ease: 'easeIn' }}
                >
                  <Projectile type={projectileOf(shooter)} />
                </motion.div>
              );
            })}
        </AnimatePresence>

        <AnimatePresence>
          {comboMe >= 3 && !finished && (
            <motion.div key={comboMe} className="combo" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              ×{comboMe} combo
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
