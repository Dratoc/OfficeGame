import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Send, X } from 'lucide-react';
import { GAME_MODES, type GameModeId, type PublicUser } from '@inbox/shared';
import { useApp } from '../lib/store';
import { api, ApiError } from '../lib/api';
import { Bust } from './Bits';

export function ComposeDialog() {
  const { composeOpen, composeTo, closeCompose, toast, me } = useApp();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<GameModeId>('typing');
  const [suggestions, setSuggestions] = useState<PublicUser[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (composeOpen) {
      setTo(composeTo);
      setSubject('');
      setMessage('');
      setError('');
      setMode('typing');
    }
  }, [composeOpen, composeTo]);

  useEffect(() => {
    if (!composeOpen) return;
    const q = to.replace(/^@/, '');
    const t = setTimeout(() => {
      api<PublicUser[]>(`/api/users?search=${encodeURIComponent(q)}`)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 150);
    return () => clearTimeout(t);
  }, [to, composeOpen]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await api('/api/challenges', { body: { opponent: to, mode, subject: subject || undefined, message } });
      toast({ title: 'Desafío enviado', body: `Tu desafío salió hacia la bandeja de ${to}.`, tone: 'success' });
      closeCompose();
      if (useApp.getState().view.kind === 'mail') void useApp.getState().loadMail();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  };

  const exact = suggestions.some((s) => s.username.toLowerCase() === to.replace(/^@/, '').toLowerCase());

  return (
    <AnimatePresence>
      {composeOpen && (
        <motion.div className="compose-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="compose"
            role="dialog"
            aria-label="Nuevo desafío"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <header>
              <strong>Nuevo desafío</strong>
              <button className="icon-btn" onClick={closeCompose} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>
            <div className="compose-row">
              <span className="compose-label">De</span>
              <span className="compose-static">{me?.username}</span>
            </div>
            <div className="compose-row compose-to">
              <span className="compose-label">Para</span>
              <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="nombre de usuario" />
              {to && !exact && suggestions.length > 0 && (
                <div className="suggest">
                  {suggestions.map((u) => (
                    <button key={u.id} onClick={() => setTo(u.username)}>
                      <Bust user={u} size={28} />
                      <span>
                        <strong>{u.username}</strong>
                        <small>
                          Nivel {u.level} · {u.title}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="compose-row">
              <span className="compose-label">Asunto</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${GAME_MODES[mode].name}: ${me?.username} te desafía`} />
            </div>
            <div className="mode-picker">
              {Object.values(GAME_MODES).map((m) => (
                <button key={m.id} className={`mode-card ${mode === m.id ? 'selected' : ''}`} disabled={!m.available} onClick={() => setMode(m.id)}>
                  <strong>
                    {m.name} {!m.available && <Lock size={12} />}
                  </strong>
                  <small>{m.available ? m.tagline : 'Próximamente'}</small>
                </button>
              ))}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe un mensaje para tu rival (opcional). Ej.: ¿Duelo antes del almuerzo?" rows={4} />
            {error && <div className="form-error">{error}</div>}
            <footer>
              <button className="btn btn-primary" disabled={!to || sending} onClick={send}>
                <Send size={16} /> {sending ? 'Enviando…' : 'Enviar desafío'}
              </button>
              <button className="btn btn-ghost" onClick={closeCompose}>
                Descartar
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
