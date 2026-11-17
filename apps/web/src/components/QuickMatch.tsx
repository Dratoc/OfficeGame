import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { GAME_MODES, type PlayableModeId } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { useApp } from '../lib/store';
import { getSocket } from '../lib/socket';

/** Floating card shown while the server looks for a rival. */
export function QuickMatch() {
  const { queue, me } = useApp();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!queue.searching) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [queue.searching]);
  const group = queue.mode ? GAME_MODES[queue.mode].maxPlayers > 2 && queue.mode !== 'puzzle' : false;
  const secs = queue.since ? Math.max(0, Math.floor((now - queue.since) / 1000)) : 0;

  return (
    <AnimatePresence>
      {queue.searching && me && (
        <motion.div className="qm" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }} role="status">
          <div className="qm-avatar">
            <Avatar config={me.avatar} pose="run" size={64} />
          </div>
          <div className="qm-text">
            <strong>{group ? `${queue.mode === 'office' ? 'Armando sala' : 'Armando carrera'}… ${queue.players ?? 1} de ${GAME_MODES[queue.mode!].maxPlayers}` : 'Buscando rival…'}</strong>
            <span className="muted small">
              {GAME_MODES[queue.mode ?? 'typing'].name} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
            <span className="qm-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
          <button className="icon-btn" onClick={() => getSocket().emit('queue:leave')} aria-label="Cancelar búsqueda">
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function startQuickMatch(mode: PlayableModeId) {
  useApp.setState((st) => ({ queue: { ...st.queue, mode } }));
  getSocket().emit('queue:join', { mode });
}
