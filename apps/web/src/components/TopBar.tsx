import { Doubloons } from '../views/ShopView';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Search, Settings, Swords, User } from 'lucide-react';
import { Logo } from './Logo';
import { AlertsMenu } from './AlertsMenu';
import { LevelBadge, XpBar } from './Bits';
import { Avatar } from '../avatar/Avatar';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { closeSocket } from '../lib/socket';

export function TopBar() {
  const me = useApp((s) => s.me)!;
  const { go, search, setSearch, view } = useApp();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    closeSocket();
    useApp.setState({ me: null, mails: [], unread: 0, view: { kind: 'mail', folder: 'inbox', mailId: null } });
  };

  return (
    <header className="topbar">
      <Logo />
      <label className="topbar-search">
        <Search size={16} />
        <input
          placeholder="Buscar en el correo"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (view.kind !== 'mail') go({ kind: 'mail', folder: 'inbox', mailId: null });
          }}
        />
      </label>
      <div className="topbar-right">
        <button className="topbar-coins" onClick={() => go({ kind: 'shop' })} title="Doblones: gástalos en la Tienda">
          <Doubloons amount={me.stats.coins} />
        </button>
        <AlertsMenu />
        <div className="topbar-level">
          <LevelBadge level={me.stats.level} />
          <XpBar xp={me.stats.xp} compact />
        </div>
        <div className="topbar-me" ref={ref}>
          <button className="topbar-avatar" onClick={() => setMenu((m) => !m)} aria-label="Tu cuenta">
            <Avatar config={me.avatar} crop="bust" size={34} />
          </button>
          {menu && (
            <div className="menu">
              <div className="menu-head">
                <strong>{me.username}</strong>
                <small>{me.email}</small>
              </div>
              <button onClick={() => (setMenu(false), go({ kind: 'profile', username: me.username }))}>
                <User size={16} /> Mi perfil
              </button>
              <button onClick={() => (setMenu(false), go({ kind: 'armory' }))}>
                <Swords size={16} /> Armería (avatar)
              </button>
              <button disabled>
                <Settings size={16} /> Configuración <span className="pill">Pronto</span>
              </button>
              <hr />
              <button onClick={logout}>
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
