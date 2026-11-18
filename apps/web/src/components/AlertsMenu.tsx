import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, Volume2, VolumeX, X } from 'lucide-react';
import { enableNotifications, setPrefs, testAlert, unlockAudio, useAlerts, type Permission } from '../lib/alerts';

function permissionText(p: Permission) {
  if (p === 'granted') return 'Permitidos en este navegador';
  if (p === 'denied') return 'Bloqueados: actívalos desde el candado de la barra de direcciones';
  if (p === 'unsupported') return 'Este navegador no muestra avisos';
  return 'Falta darle permiso al navegador';
}

/** Bell in the top bar: turn background alerts and their sound on or off. */
export function AlertsMenu() {
  const { notify, sound, permission } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const on = notify && permission === 'granted';

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggleNotify = () => {
    if (on) setPrefs({ notify: false, asked: true });
    else void enableNotifications();
  };

  return (
    <div className="topbar-alerts" ref={ref}>
      <button className="topbar-bell" onClick={() => setOpen((o) => !o)} aria-label="Avisos" title="Avisos de invitaciones y desafíos">
        {on ? <Bell size={18} /> : <BellOff size={18} />}
        {permission === 'default' && <span className="topbar-bell-dot" />}
      </button>
      {open && (
        <div className="menu alerts-menu">
          <div className="menu-head">
            <strong>Avisos</strong>
            <small>Para enterarte de invitaciones a salas, desafíos y partidas listas aunque tengas el juego en otra pestaña.</small>
          </div>
          <button onClick={toggleNotify} disabled={permission === 'unsupported'} role="switch" aria-checked={on}>
            {on ? <Bell size={16} /> : <BellOff size={16} />}
            <span>
              Avisos del navegador
              <small>{notify || permission !== 'granted' ? permissionText(permission) : 'Apagados'}</small>
            </span>
            <span className={`switch ${on ? 'on' : ''}`} />
          </button>
          <button
            onClick={() => {
              unlockAudio();
              setPrefs({ sound: !sound });
            }}
            role="switch"
            aria-checked={sound}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>
              Sonido
              <small>Un timbre corto cuando llega algo</small>
            </span>
            <span className={`switch ${sound ? 'on' : ''}`} />
          </button>
          <hr />
          <button onClick={testAlert}>
            <BellRing size={16} /> Probar aviso
          </button>
        </div>
      )}
    </div>
  );
}

/** One-time suggestion to turn alerts on, shown until the player answers it. */
export function AlertsPrompt() {
  const { asked, permission } = useAlerts();
  if (asked || permission !== 'default') return null;
  return (
    <div className="alerts-prompt" role="dialog" aria-label="Activar avisos">
      <span className="alerts-prompt-icon">
        <BellRing size={20} />
      </span>
      <div>
        <strong>¿Te avisamos aunque estés en otra pestaña?</strong>
        <p>Si alguien te invita a una sala o te desafía mientras trabajas, te llega un aviso del navegador con sonido.</p>
        <div className="alerts-prompt-actions">
          <button className="btn btn-primary" onClick={() => void enableNotifications()}>
            Activar avisos
          </button>
          <button className="btn btn-ghost" onClick={() => setPrefs({ asked: true })}>
            Ahora no
          </button>
        </div>
      </div>
      <button className="icon-btn" onClick={() => setPrefs({ asked: true })} aria-label="Cerrar">
        <X size={16} />
      </button>
    </div>
  );
}
