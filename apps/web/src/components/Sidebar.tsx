import { CalendarDays, Inbox, PenSquare, Send, Shield, ShoppingBag, Sword, Swords, Trophy, UserRound, Users, Zap } from 'lucide-react';
import { startQuickMatch } from './QuickMatch';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GAME_MODES, PLAYABLE_MODES } from '@inbox/shared';
import { useApp, type Folder, type View } from '../lib/store';

function Item({ icon, label, active, count, onClick, badge }: { icon: ReactNode; label: string; active: boolean; count?: number; onClick: () => void; badge?: string }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge && <span className="pill">{badge}</span>}
      {!!count && <span className="nav-count">{count}</span>}
    </button>
  );
}

export function Sidebar() {
  const { view, go, unread, openCompose, me, queue, friendRequests } = useApp();
  const folder = view.kind === 'mail' ? view.folder : null;
  const toFolder = (f: Folder) => go({ kind: 'mail', folder: f, mailId: null });
  const is = (k: View['kind']) => view.kind === k;
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => !pickRef.current?.contains(e.target as Node) && setPicking(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [picking]);

  return (
    <nav className="sidebar">
      <button className="btn btn-primary compose-btn" onClick={() => openCompose()}>
        <PenSquare size={18} /> Nuevo desafío
      </button>
      <div className="quick-wrap" ref={pickRef}>
        <button className="btn btn-ghost quick-btn" disabled={queue.searching} onClick={() => setPicking((x) => !x)} aria-expanded={picking}>
          <Zap size={16} /> {queue.searching ? 'Buscando…' : 'Partida rápida'}
        </button>
        {picking && !queue.searching && (
          <div className="quick-menu" role="menu">
            <span className="quick-menu-title">Elige el modo</span>
            {PLAYABLE_MODES.map((id) => (
              <button
                key={id}
                role="menuitem"
                className="quick-mode"
                onClick={() => {
                  setPicking(false);
                  startQuickMatch(id);
                }}
              >
                <strong>{GAME_MODES[id].name}</strong>
                <small>
                  {Math.round(GAME_MODES[id].durationMs / 1000)} s · {GAME_MODES[id].tagline}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="nav-group">
        <div className="nav-title">Correo</div>
        <Item icon={<Inbox size={18} />} label="Bandeja de entrada" active={folder === 'inbox'} count={unread} onClick={() => toFolder('inbox')} />
        <Item icon={<Swords size={18} />} label="Desafíos" active={folder === 'challenges'} onClick={() => toFolder('challenges')} />
        <Item icon={<Send size={18} />} label="Enviados" active={folder === 'sent'} onClick={() => toFolder('sent')} />
      </div>

      <div className="nav-group">
        <div className="nav-title">Arena</div>
 <Item icon={<Users size={18} />} label="Contactos" active={is('contacts')} count={friendRequests} onClick={() => go({ kind: 'contacts' })} />
        <Item icon={<Trophy size={18} />} label="Ranking" active={is('ranking')} onClick={() => go({ kind: 'ranking' })} />
        <Item icon={<Shield size={18} />} label="Armería" active={is('armory')} onClick={() => go({ kind: 'armory' })} />
        <Item icon={<Sword size={18} />} label="Práctica 3D" active={is('practice')} onClick={() => go({ kind: 'practice' })} />
        <Item icon={<ShoppingBag size={18} />} label="Tienda" active={is('shop')} onClick={() => go({ kind: 'shop' })} />
        <Item icon={<UserRound size={18} />} label="Mi perfil" active={is('profile') && (view as { username: string }).username === me?.username} onClick={() => go({ kind: 'profile', username: me!.username })} />
        <Item icon={<CalendarDays size={18} />} label="Calendario" active={is('calendar')} badge="Pronto" onClick={() => go({ kind: 'calendar' })} />
      </div>

      <div className="sidebar-foot">
        <div className="tip">
          <strong>Consejo del gremio</strong>
          <p>Cada batalla dura entre 10 y 20 segundos. Perfecto entre reunión y reunión.</p>
        </div>
      </div>
    </nav>
  );
}
