import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Mail, Swords, X } from 'lucide-react';
import { GAME_MODES } from '@inbox/shared';
import { useApp, type Invite } from '../lib/store';
import { api, ApiError } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Bust, timeAgo } from './Bits';

function expiresIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Vencido';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `Vence en ${h} h` : `Vence en ${Math.max(1, Math.round(ms / 60_000))} min`;
}

/** Accepts an invitation: joins the room, or accepts the challenge and opens the battle room. */
async function accept(inv: Invite): Promise<string | null> {
  const { go } = useApp.getState();
  if (inv.kind === 'room') {
    const r = await getSocket().emitWithAck('lobby:join', { code: inv.code! });
    if (!r.ok) return r.error ?? 'No se pudo entrar a la sala';
    go({ kind: 'rooms' });
    return null;
  }
  try {
    const { matchId } = await api<{ matchId: string }>(`/api/challenges/${inv.challengeId}/accept`, { method: 'POST' });
    go({ kind: 'battle', matchId });
    return null;
  } catch (e) {
    return e instanceof ApiError ? e.message : 'No se pudo aceptar';
  }
}

async function decline(inv: Invite): Promise<string | null> {
  if (inv.kind === 'room') {
    getSocket().emit('lobby:decline', { code: inv.code! });
    return null;
  }
  try {
    await api(`/api/challenges/${inv.challengeId}/decline`, { method: 'POST' });
    return null;
  } catch (e) {
    return e instanceof ApiError ? e.message : 'No se pudo rechazar';
  }
}

/**
 * Invitations to a room and challenges open as a mail window that stays on screen
 * until the player accepts, declines or closes it. Several queue up one after another.
 */
export function InviteWindow() {
  const { invites, removeInvite, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const inv = invites[0];

  const answer = async (yes: boolean) => {
    if (!inv || busy) return;
    setBusy(true);
    const error = await (yes ? accept(inv) : decline(inv)).catch(() => 'Algo falló, inténtalo de nuevo');
    setBusy(false);
    removeInvite(inv.id);
    if (error) toast({ title: yes ? 'No se pudo aceptar' : 'No se pudo rechazar', body: error, tone: 'error' });
    else if (!yes) toast({ title: inv.kind === 'room' ? 'Invitación rechazada' : 'Desafío rechazado', body: `Le avisamos a ${inv.from.username} con mucha diplomacia.` });
    if (!error && inv.mailId) useApp.getState().markRead(inv.mailId);
  };

  const mode = inv ? GAME_MODES[inv.mode] : null;

  return (
    <AnimatePresence>
      {inv && (
        <motion.section
          key={inv.id}
          className="invite-window"
          role="alertdialog"
          aria-label={inv.subject}
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <header>
            <span className="invite-window-title">
              <Mail size={16} /> {inv.kind === 'room' ? 'Invitación a una sala' : 'Nuevo desafío'}
            </span>
            {invites.length > 1 && <span className="invite-window-count">1 de {invites.length}</span>}
            <button className="icon-btn" onClick={() => removeInvite(inv.id)} aria-label="Cerrar" title={inv.kind === 'challenge' ? 'Cerrar (sigue en tu bandeja)' : 'Cerrar'}>
              <X size={16} />
            </button>
          </header>
          <div className="invite-window-meta">
            <Bust user={inv.from} size={42} />
            <div>
              <div>
                <strong>{inv.from.username}</strong> <span className="muted">· {inv.from.title}</span>
              </div>
              <div className="muted small">Para: ti · {timeAgo(inv.at)}</div>
            </div>
          </div>
          <div className="invite-window-body">
            <h3>{inv.subject}</h3>
            <p>{inv.body}</p>
            {mode && (
              <div className="invite-window-mode">
                <Swords size={18} />
                <div>
                  <strong>{mode.name}</strong>
                  <small>{inv.kind === 'room' ? `Código de sala ${inv.code}` : mode.tagline}</small>
                </div>
              </div>
            )}
          </div>
          <footer>
            <button className="btn btn-primary" disabled={busy} onClick={() => void answer(true)}>
              <Check size={16} /> {inv.kind === 'room' ? 'Aceptar y entrar' : 'Aceptar desafío'}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void answer(false)}>
              <X size={16} /> Rechazar
            </button>
            {inv.expiresAt && (
              <span className="muted small invite-window-expires">
                <Clock size={13} /> {expiresIn(inv.expiresAt)}
              </span>
            )}
          </footer>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
