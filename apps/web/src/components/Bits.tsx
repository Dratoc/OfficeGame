import { RARITY_LABEL, levelProgress, type PublicUser, type Rarity } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { useApp } from '../lib/store';

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <span className={`rarity rarity-${rarity}`}>{RARITY_LABEL[rarity]}</span>;
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="level-badge" title={`Nivel ${level}`}>
      <svg viewBox="0 0 24 28" width="20" height="23" aria-hidden="true">
        <path d="M12 1 L23 5 L23 14 Q23 23 12 27 Q1 23 1 14 L1 5 Z" fill="currentColor" />
      </svg>
      <span>{level}</span>
    </span>
  );
}

export function XpBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const p = levelProgress(xp);
  return (
    <div className={`xpbar ${compact ? 'xpbar-compact' : ''}`} title={`${p.current} / ${p.needed} XP para el nivel ${p.level + 1}`}>
      <div className="xpbar-fill" style={{ width: `${p.pct}%` }} />
      {!compact && (
        <span className="xpbar-label">
          {p.current} / {p.needed} XP
        </span>
      )}
    </div>
  );
}

export function UserChip({ user, size = 36, link = true }: { user: PublicUser; size?: number; link?: boolean }) {
  const go = useApp((s) => s.go);
  const content = (
    <>
      <span className="bust" style={{ width: size, height: size }}>
        <Avatar config={user.avatar} crop="bust" size={size} />
      </span>
      <span className="userchip-text">
        <strong>{user.username}</strong>
        <small>{user.title}</small>
      </span>
    </>
  );
  return link ? (
    <button className="userchip" onClick={() => go({ kind: 'profile', username: user.username })}>
      {content}
    </button>
  ) : (
    <span className="userchip">{content}</span>
  );
}

export function Bust({ user, size = 36 }: { user: PublicUser; size?: number }) {
  return (
    <span className="bust" style={{ width: size, height: size }}>
      <Avatar config={user.avatar} crop="bust" size={size} />
    </span>
  );
}

export function SystemSeal({ size = 36 }: { size?: number }) {
  return (
    <span className="bust bust-system" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size * 0.62} height={size * 0.62} aria-hidden="true">
        <path d="M20 3 L34 8 L34 20 Q34 32 20 37 Q6 32 6 20 L6 8 Z" fill="#c8962e" stroke="#fbf7ef" strokeWidth="2.5" />
        <path d="M20 12 L20 28 M13 19 L27 19" stroke="#fbf7ef" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400) return d.toLocaleDateString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
