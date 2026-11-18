import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Inbox, Swords, Trophy, X } from 'lucide-react';
import type { MailDto } from '@inbox/shared';
import { useApp, type Folder } from '../lib/store';
import { api, ApiError } from '../lib/api';
import { Bust, SystemSeal, timeAgo } from '../components/Bits';

const FOLDER_TITLE: Record<Folder, string> = { inbox: 'Bandeja de entrada', challenges: 'Desafíos', sent: 'Enviados' };

export function MailView({ folder, mailId }: { folder: Folder; mailId: string | null }) {
  const { mails, loadMail, go, search, markRead } = useApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadMail(folder).finally(() => setLoading(false));
  }, [folder, loadMail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mails;
    return mails.filter((m) => [m.subject, m.body, m.from?.username ?? 'sistema', m.to.username].some((t) => t.toLowerCase().includes(q)));
  }, [mails, search]);

  const selected = mails.find((m) => m.id === mailId) ?? null;

  useEffect(() => {
    if (selected && folder !== 'sent') markRead(selected.id);
  }, [selected, folder, markRead]);

  return (
    <div className={`mail ${selected ? 'has-selection' : ''}`}>
      <section className="mail-list">
        <header className="pane-head">
          <h2>{FOLDER_TITLE[folder]}</h2>
          {folder !== 'sent' && (
            <button className="link small" onClick={() => api('/api/mail/read-all', { method: 'POST' }).then(() => loadMail(folder))}>
              Marcar todo como leído
            </button>
          )}
        </header>
        {loading && mails.length === 0 ? (
          <div className="skeletons">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Inbox size={36} />
            <p>{search ? 'Nada coincide con tu búsqueda.' : folder === 'sent' ? 'Aún no envías desafíos.' : 'Bandeja vacía. Disfruta la paz (mientras dure).'}</p>
          </div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {filtered.map((m) => (
                <motion.li key={m.id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <MailRow mail={m} folder={folder} active={m.id === mailId} onOpen={() => go({ kind: 'mail', folder, mailId: m.id })} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
      <section className="reading">
        {selected ? <Reading mail={selected} folder={folder} /> : <EmptyReading />}
      </section>
    </div>
  );
}

function expiresIn(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (mins < 60) return `Vence en ${Math.max(1, mins)} min`;
  return `Vence en ${Math.round(mins / 60)} h`;
}

function KindIcon({ mail }: { mail: MailDto }) {
  if (mail.kind === 'challenge') return <Swords size={14} className="kind-icon challenge" />;
  if (mail.kind === 'result') return <Trophy size={14} className="kind-icon result" />;
  return null;
}

function MailRow({ mail, folder, active, onOpen }: { mail: MailDto; folder: Folder; active: boolean; onOpen: () => void }) {
  const unread = !mail.readAt && folder !== 'sent';
  const who = folder === 'sent' ? mail.to : mail.from;
  const pending = mail.challenge?.status === 'pending' && folder !== 'sent' && mail.challenge.opponentId === mail.to.id;
  return (
    <button className={`mail-row ${active ? 'active' : ''} ${unread ? 'unread' : ''}`} onClick={onOpen}>
      {who ? <Bust user={who} size={38} /> : <SystemSeal size={38} />}
      <span className="mail-row-main">
        <span className="mail-row-top">
          <span className="mail-from">{folder === 'sent' ? `Para: ${mail.to.username}` : (mail.from?.username ?? 'Inbox Arena')}</span>
          <span className="mail-time">{timeAgo(mail.createdAt)}</span>
        </span>
        <span className="mail-subject">
          <KindIcon mail={mail} />
          {mail.subject}
        </span>
        <span className="mail-preview">{mail.body.split('\n').find((l) => l.trim()) ?? ''}</span>
        {pending && <span className="tag tag-gold">Esperando tu respuesta</span>}
      </span>
    </button>
  );
}

function EmptyReading() {
  return (
    <div className="reading-empty">
      <svg viewBox="0 0 120 90" width="140" aria-hidden="true">
        <rect x="10" y="20" width="100" height="60" rx="10" fill="var(--brand-50)" stroke="var(--brand)" strokeWidth="2" />
        <path d="M12 24 L60 56 L108 24" fill="none" stroke="var(--brand)" strokeWidth="2.5" />
        <path d="M60 48 L72 52 L72 62 Q72 72 60 76 Q48 72 48 62 L48 52 Z" fill="var(--gold)" />
      </svg>
      <p>Selecciona un correo para leerlo</p>
      <small>Los desafíos llegan aquí. Ninguna reunión fue interrumpida.</small>
    </div>
  );
}

function Reading({ mail, folder }: { mail: MailDto; folder: Folder }) {
  const { me, go, toast, loadMail, openCompose } = useApp();
  const [busy, setBusy] = useState(false);
  const ch = mail.challenge;
  const iAmOpponent = ch?.opponentId === me?.id;
  const expired = ch && new Date(ch.expiresAt) < new Date() && ch.status === 'pending';

  const accept = async () => {
    setBusy(true);
    try {
      const { matchId } = await api<{ matchId: string }>(`/api/challenges/${ch!.id}/accept`, { method: 'POST' });
      useApp.getState().removeInvite(`challenge:${ch!.id}`);
      go({ kind: 'battle', matchId });
    } catch (e) {
      toast({ title: 'No se pudo aceptar', body: e instanceof ApiError ? e.message : undefined, tone: 'error' });
      void loadMail(folder);
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await api(`/api/challenges/${ch!.id}/decline`, { method: 'POST' });
      useApp.getState().removeInvite(`challenge:${ch!.id}`);
      toast({ title: 'Desafío rechazado', body: 'Le avisamos con mucha diplomacia.' });
      void loadMail(folder);
    } catch (e) {
      toast({ title: 'No se pudo rechazar', body: e instanceof ApiError ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article key={mail.id} className="letter" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <h1>{mail.subject}</h1>
      <div className="letter-meta">
        {mail.from ? <Bust user={mail.from} size={44} /> : <SystemSeal size={44} />}
        <div>
          <div>
            <strong>{mail.from?.username ?? 'Inbox Arena'}</strong>{' '}
            <span className="muted">{mail.from ? `· ${mail.from.title}` : '· Departamento de Duelos'}</span>
          </div>
          <div className="muted small">
            Para: {mail.to.username} · {new Date(mail.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
        {mail.from && (
          <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'profile', username: mail.from!.username })}>
            Ver perfil
          </button>
        )}
      </div>

      {ch && (
        <div className={`challenge-card status-${expired ? 'expired' : ch.status}`}>
          <div className="challenge-card-head">
            <Swords size={20} />
            <div>
              <strong>Typing Battle · 1 contra 1</strong>
              <small>10 segundos. Gana quien escriba más palabras correctas.</small>
            </div>
          </div>
          {ch.status === 'pending' && !expired && iAmOpponent && (
            <div className="challenge-actions">
              <button className="btn btn-primary" disabled={busy} onClick={accept}>
                <Check size={16} /> Aceptar y entrar a la sala
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={decline}>
                <X size={16} /> Rechazar
              </button>
              <span className="muted small">
                <Clock size={13} /> {expiresIn(ch.expiresAt)}
              </span>
            </div>
          )}
          {ch.status === 'pending' && !expired && !iAmOpponent && <p className="muted">Esperando que {mail.to.id === me?.id ? 'tu rival' : mail.to.username} responda.</p>}
          {ch.status === 'accepted' && ch.matchId && (
            <div className="challenge-actions">
              <button className="btn btn-primary" onClick={() => go({ kind: 'battle', matchId: ch.matchId! })}>
                <Swords size={16} /> Ir a la sala de batalla
              </button>
              <span className="muted small">Si la partida ya terminó, verás el resultado.</span>
            </div>
          )}
          {ch.status === 'declined' && <p className="muted">Este desafío fue rechazado.</p>}
          {(expired || ch.status === 'expired') && <p className="muted">Este desafío venció.</p>}
        </div>
      )}

      <div className="letter-body">
        {mail.body.split('\n').map((line, i) => (line.trim() ? <p key={i}>{line}</p> : <br key={i} />))}
      </div>

      {mail.kind === 'result' && mail.matchId && (
        <div className="challenge-actions">
          <button className="btn btn-primary" onClick={() => go({ kind: 'result', matchId: mail.matchId! })}>
            <Trophy size={16} /> Ver la escena final
          </button>
        </div>
      )}
      {mail.from && mail.from.id !== me?.id && (
        <div className="letter-foot">
          <button className="btn btn-ghost" onClick={() => openCompose(mail.from!.username)}>
            <Swords size={16} /> Responder con un desafío
          </button>
        </div>
      )}
    </motion.article>
  );
}
