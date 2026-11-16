import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RACE_LENGTH, type PublicUser } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import type { DuelEffect } from './DuelStage';

interface Runner {
  user: PublicUser;
  correctWords: number;
  errors: number;
}

const ORD = ['1.º', '2.º', '3.º', '4.º'];

/**
 * Racing Battle: one lane per player. Every correct word moves the runner forward; the first
 * to type RACE_LENGTH words crosses the finish line. Positions come from the server.
 */
export function RaceTrack({ runners, meId, effects, now, finished }: { runners: Runner[]; meId: string; effects: DuelEffect[]; now: number; finished: boolean }) {
  // Finish order as seen live. The final places come from the server in the result scene.
  const order = useRef<string[]>([]);
  for (const r of runners) if (r.correctWords >= RACE_LENGTH && !order.current.includes(r.user.id)) order.current.push(r.user.id);

  const leader = Math.max(...runners.map((r) => r.correctWords));

  return (
    <div className="race">
      {runners.map((r, lane) => {
        const pct = Math.min(1, r.correctWords / RACE_LENGTH);
        const done = order.current.indexOf(r.user.id);
        const moving = effects.some((e) => e.userId === r.user.id && e.kind === 'hit' && now - e.at < 650);
        const stumble = effects.some((e) => e.userId === r.user.id && e.kind !== 'hit' && now - e.at < 450);
        const last = [...effects].reverse().find((e) => e.userId === r.user.id);
        const emote = done >= 0 ? 'cheer' : moving ? 'happy' : stumble ? 'sad' : undefined;
        const pose = done >= 0 ? (done === 0 ? 'win' : 'wave') : finished ? (r.correctWords === leader ? 'win' : 'idle') : moving ? 'run' : 'idle';
        return (
          <div key={r.user.id} className={`race-lane ${r.user.id === meId ? 'mine' : ''}`}>
            <div className="race-name">
              <strong>{r.user.id === meId ? 'Tú' : r.user.username}</strong>
              <span>
                {Math.min(r.correctWords, RACE_LENGTH)}/{RACE_LENGTH} · {r.errors} errores
              </span>
            </div>
            <div className="race-track">
              <div className="race-fill" style={{ width: `${pct * 100}%` }} />
              <div className="race-flag" aria-hidden="true" />
              <motion.div className={`race-runner ${stumble ? 'stumble' : ''}`} animate={{ left: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 160, damping: 20 }} style={{ zIndex: 10 - lane }}>
                <Avatar config={r.user.avatar} pose={pose} size={74} emote={emote} emoteKey={last?.id} />
                <AnimatePresence>
                  {done >= 0 && (
                    <motion.span className={`race-place p${done + 1}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
                      {ORD[done]}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
