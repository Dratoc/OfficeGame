import { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { levelProgress, type ProfileDto } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { Bust, LevelBadge, XpBar, timeAgo } from '../components/Bits';
import { useApp } from '../lib/store';
import { api, ApiError } from '../lib/api';

const RESULT_LABEL = { win: 'Victoria', loss: 'Derrota', draw: 'Empate', abandon: 'Abandono' } as const;

export function ProfileView({ username }: { username: string }) {
  const { me, openCompose, go } = useApp();
  const [p, setP] = useState<ProfileDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setP(null);
    api<ProfileDto>(`/api/users/${encodeURIComponent(username)}`)
      .then(setP)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error'));
  }, [username, me?.stats.xp]);

  if (error) return <div className="page">{error}</div>;
  if (!p) return <div className="page muted">Cargando perfil…</div>;
  const mine = p.user.id === me?.id;
  const lp = levelProgress(p.stats.xp);

  return (
    <div className="page profile">
      <section className="profile-hero">
        <div className="profile-avatar">
          <Avatar config={p.user.avatar} size={240} pose="idle" />
        </div>
        <div className="profile-info">
          <span className="muted small">{mine ? 'Tu perfil' : 'Perfil de jugador'}</span>
          <h2>{p.user.username}</h2>
          <p className="profile-title">{p.user.title}</p>
          <div className="profile-level">
            <LevelBadge level={p.stats.level} />
            <div>
              <strong>Nivel {p.stats.level}</strong>
              <XpBar xp={p.stats.xp} />
              <small className="muted">
                {lp.needed - lp.current} XP para el nivel {lp.level + 1}
              </small>
            </div>
          </div>
          <div className="profile-actions">
            {mine ? (
              <button className="btn btn-ghost" onClick={() => go({ kind: 'armory' })}>
                Editar avatar
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => openCompose(p.user.username)}>
                <Swords size={16} /> Desafiar
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="stat-cards">
        <div className="stat">
          <span>Victorias</span>
          <strong>{p.stats.wins}</strong>
        </div>
        <div className="stat">
          <span>Derrotas</span>
          <strong>{p.stats.losses}</strong>
        </div>
        <div className="stat">
          <span>% victorias</span>
          <strong>{p.stats.winRate}%</strong>
        </div>
        <div className="stat">
          <span>Rating</span>
          <strong>{p.stats.rating}</strong>
        </div>
        <div className="stat">
          <span>Ranking</span>
          <strong>{p.stats.rank ? `#${p.stats.rank}` : '—'}</strong>
        </div>
        <div className="stat">
          <span>Objetos</span>
          <strong>{p.inventoryCount}</strong>
        </div>
      </section>

      <section>
        <h3>Historial de competencias</h3>
        {p.history.length === 0 ? (
          <p className="muted">Todavía no hay batallas. {mine ? 'Envía tu primer desafío.' : ''}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Resultado</th>
                <th>Rival</th>
                <th>Palabras</th>
                <th>PPM</th>
                <th>Rating</th>
                <th>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {p.history.map((h) => (
                <tr key={h.matchId} onClick={() => mine && go({ kind: 'result', matchId: h.matchId })} className={mine ? '' : 'static'}>
                  <td>
                    <span className={`tag tag-${h.result}`}>{RESULT_LABEL[h.result]}</span>
                  </td>
                  <td>
                    {h.opponent ? (
                      <span className="cell-user">
                        <Bust user={h.opponent} size={28} />
                        {h.opponent.username}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{h.correctWords}</td>
                  <td>{h.wpm}</td>
                  <td className={h.ratingDelta >= 0 ? 'up' : 'down'}>
                    {h.ratingDelta >= 0 ? '+' : ''}
                    {h.ratingDelta}
                  </td>
                  <td className="muted">{timeAgo(h.endedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
