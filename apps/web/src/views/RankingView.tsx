import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { LeaderboardEntryDto } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { Bust, LevelBadge } from '../components/Bits';
import { useApp } from '../lib/store';
import { api } from '../lib/api';

export function RankingView() {
  const { me, go } = useApp();
  const [rows, setRows] = useState<LeaderboardEntryDto[] | null>(null);
  useEffect(() => {
    api<LeaderboardEntryDto[]>('/api/leaderboard').then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows) return <div className="page muted">Cargando ranking…</div>;
  const podium = rows.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as LeaderboardEntryDto[];

  return (
    <div className="page ranking">
      <header className="page-head">
        <h2>
          <Trophy size={22} /> Ranking global
        </h2>
        <p className="muted">Ordenado por rating (Elo). Solo cuentan partidas terminadas en el servidor.</p>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <Trophy size={40} />
          <p>Nadie ha batallado todavía. El primer duelo te pone en el podio.</p>
        </div>
      ) : (
        <>
          <div className="podium-row">
            {order.map((r) => (
              <motion.button key={r.user.id} className={`podium-card place-${r.rank}`} onClick={() => go({ kind: 'profile', username: r.user.username })} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: r.rank * 0.1 }}>
                <Avatar config={r.user.avatar} size={r.rank === 1 ? 150 : 120} pose={r.rank === 1 ? 'win' : 'idle'} />
                <div className="podium-plinth">
                  <span className="place">{r.rank}</span>
                  <strong>{r.user.username}</strong>
                  <small>{r.rating} pts</small>
                </div>
              </motion.button>
            ))}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>Nivel</th>
                <th>Rating</th>
                <th>V / D / E</th>
                <th>% victorias</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user.id} className={r.user.id === me?.id ? 'me' : ''} onClick={() => go({ kind: 'profile', username: r.user.username })}>
                  <td className="rank">{r.rank}</td>
                  <td>
                    <span className="cell-user">
                      <Bust user={r.user} size={32} />
                      <span>
                        <strong>{r.user.username}</strong>
                        <small className="muted">{r.user.title}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <LevelBadge level={r.user.level} />
                  </td>
                  <td>
                    <strong>{r.rating}</strong>
                  </td>
                  <td>
                    {r.wins} / {r.losses} / {r.draws}
                  </td>
                  <td>{r.winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
