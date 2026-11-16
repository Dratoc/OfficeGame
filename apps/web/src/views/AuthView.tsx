import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_AVATAR, type AvatarConfig } from '@inbox/shared';
import { Logo } from '../components/Logo';
import { Avatar } from '../avatar/Avatar';
import { api, ApiError } from '../lib/api';
import { useApp } from '../lib/store';

const HERO: AvatarConfig[] = [
  { skin: 1, hairColor: 0, equipped: { head: 'head_dragon', eyes: 'eyes_dot', outfit: 'outfit_suit', weapon: 'weapon_mug', pet: 'pet_dragon_red' } },
  { skin: 0, hairColor: 3, equipped: { head: 'head_human', eyes: 'eyes_happy', hair: 'hair_long', beard: 'beard_viking', outfit: 'outfit_iron', headgear: 'headgear_viking', weapon: 'weapon_sword', cape: 'cape_red' } },
  { skin: 2, hairColor: 5, equipped: { head: 'head_elf', eyes: 'eyes_glow', hair: 'hair_bun', outfit: 'outfit_mage', headgear: 'headgear_wizard', weapon: 'weapon_staff', wings: 'wings_angel' } },
];

export function AuthView() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refreshMe = useApp((s) => s.refreshMe);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await api('/api/auth/register', { body: { email, username, password } });
      else await api('/api/auth/login', { body: { login, password } });
      await refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos conectar con el servidor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <Logo />
        <h1>
          Your office. Your inbox.
          <br />
          <em>Your battles.</em>
        </h1>
        <p>Una bandeja de entrada que parece trabajo y esconde duelos de 10 segundos contra tus colegas.</p>
        <div className="auth-cast">
          {HERO.map((c, i) => (
            <motion.div key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 * i, type: 'spring' }}>
              <Avatar config={c} size={i === 1 ? 210 : 170} pose={i === 1 ? 'wave' : 'idle'} />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          <p className="muted">{mode === 'login' ? 'Bienvenido de vuelta a la oficina.' : 'Tu primer día empieza con un correo de bienvenida.'}</p>
          {mode === 'register' ? (
            <>
              <label>
                Correo electrónico
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label>
                Nombre de usuario
                <input required minLength={3} maxLength={20} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="sir_gerald" />
              </label>
            </>
          ) : (
            <label>
              Correo o nombre de usuario
              <input required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
            </label>
          )}
          <label>
            Contraseña
            <input type="password" required minLength={mode === 'register' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
          <p className="auth-switch">
            {mode === 'login' ? '¿Primera vez en la oficina?' : '¿Ya tienes cuenta?'}{' '}
            <button type="button" className="link" onClick={() => (setMode(mode === 'login' ? 'register' : 'login'), setError(''))}>
              {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </p>
        </form>
        <p className="auth-foot">Solo cosméticos. Ninguna compra da ventajas en una batalla.</p>
      </section>
    </div>
  );
}

export { DEFAULT_AVATAR };
