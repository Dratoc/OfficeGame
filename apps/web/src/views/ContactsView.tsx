import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Swords, UserMinus, UserPlus, Users, X } from 'lucide-react';
import type { FriendsDto } from '@inbox/shared';
import { Bust, LevelBadge, timeAgo } from '../components/Bits';
import { useApp } from '../lib/store';
import { api, ApiError } from '../lib/api';

export function ContactsView() {
  const { socialVersion, openCompose, go, toast, refreshSocial } = useApp();
  const [data, setData] = useState<FriendsDto | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<FriendsDto>('/api/friends').then(setData).catch(() => setData({ friends: [], incoming: [], outgoing: [] }));
  }, [socialVersion]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ title: ok, tone: 'success' });
      await refreshSocial();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Algo salió mal', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void act(async () => {
      const r = await api<{ status: string }>('/api/friends', { body: { username: name } });
      toast({ title: r.status === 'friends' ? `${name} ya está en tus contactos` : `Solicitud enviada a ${name}`, tone: 'success' });
      setName('');
    });
  };

  if (!data) return <div className="page muted">Cargando contactos…</div>;
  const online = data.friends.filter((f) => f.online).length;

  return (
    <div className="page contacts">
      <header className="page-head">
        <h2>
          <Users size={22} /> Contactos
        </h2>
        <p className="muted">
          {data.friends.length} contactos · {online} en línea ahora
        </p>
      </header>

      <form className="add-friend" onSubmit={add}>
        <UserPlus size={18} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agregar por nombre de usuario" maxLength={40} />
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
          Enviar solicitud
        </button>
      </form>

      {data.incoming.length > 0 && (
        <section>
          <h3>Solicitudes recibidas</h3>
          <div className="contact-list">
            {data.incoming.map((r) => (
              <div key={r.id} className="contact contact-request">
                <Bust user={r.user} size={40} />
                <div className="contact-main">
                  <strong>{r.user.username}</strong>
                  <small className="muted">
                    {r.user.title} · {timeAgo(r.createdAt)}
                  </small>
                </div>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => api(`/api/friends/requests/${r.id}/accept`, { method: 'POST' }), `${r.user.username} ahora es tu contacto`)}>
                  <Check size={14} /> Aceptar
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api(`/api/friends/requests/${r.id}`, { method: 'DELETE' }))}>
                  <X size={14} /> Rechazar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Tus contactos</h3>
        {data.friends.length === 0 ? (
          <div className="empty">
            <Users size={36} />
            <p>Aún no tienes contactos. Agrega a tus colegas por su nombre de usuario.</p>
          </div>
        ) : (
          <div className="contact-list">
            <AnimatePresence initial={false}>
              {data.friends.map((f) => (
                <motion.div key={f.user.id} layout className="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span className="presence-wrap">
                    <Bust user={f.user} size={40} />
                    <span className={`presence ${f.online ? 'on' : ''}`} title={f.online ? 'En línea' : 'Desconectado'} />
                  </span>
                  <button className="contact-main as-link" onClick={() => go({ kind: 'profile', username: f.user.username })}>
                    <strong>{f.user.username}</strong>
                    <small className="muted">
                      {f.online ? 'En línea' : 'Desconectado'} · {f.user.title}
                    </small>
                  </button>
                  <LevelBadge level={f.user.level} />
                  <button className="btn btn-primary btn-sm" onClick={() => openCompose(f.user.username)}>
                    <Swords size={14} /> Desafiar
                  </button>
                  <button
                    className="icon-btn"
                    title="Quitar de contactos"
                    disabled={busy}
                    onClick={() => act(() => api(`/api/friends/${f.user.id}`, { method: 'DELETE' }), `${f.user.username} ya no está en tus contactos`)}
                  >
                    <UserMinus size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section>
          <h3>Solicitudes enviadas</h3>
          <div className="contact-list">
            {data.outgoing.map((r) => (
              <div key={r.id} className="contact">
                <Bust user={r.user} size={40} />
                <div className="contact-main">
                  <strong>{r.user.username}</strong>
                  <small className="muted">Esperando respuesta · {timeAgo(r.createdAt)}</small>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api(`/api/friends/requests/${r.id}`, { method: 'DELETE' }))}>
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
