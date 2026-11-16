import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, RotateCcw, Sparkles } from 'lucide-react';
import { ACHIEVEMENTS_BY_ID, GAME_MODES, ITEMS_BY_ID, type MatchSummaryDto, type ParticipantResultDto } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { RarityBadge } from '../components/Bits';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { startQuickMatch } from '../components/QuickMatch';
import { AchievementMedal } from '../components/Achievements';

const RESULT_TEXT: Record<ParticipantResultDto['result'], string> = {
  win: '¡Victoria!',
  loss: 'Derrota',
  draw: 'Empate',
  abandon: 'Abandono',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COLORS = ['#c8962e', '#14757d', '#b4373a', '#7a5cff', '#f2c94c', '#3f7cc4'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.2 + Math.random() * 1.6,
        rot: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          style={{ left: `${p.left}%`, background: p.color, width: p.w, height: p.w * 0.45 }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: 420, rotate: p.rot, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/** Loads a finished match by id (used when opening a result from a mail). */
export function ResultLoader({ matchId }: { matchId: string }) {
  const [summary, setSummary] = useState<MatchSummaryDto | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<MatchSummaryDto>(`/api/matches/${matchId}`)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [matchId]);
  if (error) return <div className="battle battle-message">{error}</div>;
  if (!summary) return <div className="battle battle-message muted">Cargando…</div>;
  if (summary.status !== 'finished') return <div className="battle battle-message">Esta partida no terminó.</div>;
  return <ResultScene summary={summary} />;
}

export function ResultScene({ summary }: { summary: MatchSummaryDto }) {
  const { me, go, openCompose } = useApp();
  const mine = summary.participants.find((p) => p.user.id === me?.id) ?? summary.participants[0]!;
  const other = summary.participants.find((p) => p !== mine);
  const won = mine.result === 'win';
  const draw = mine.result === 'draw';
  const race = summary.participants.length > 2;
  const words = summary.mode === 'typing' || summary.mode === 'racing';
  const byPlace = [...summary.participants].sort((a, b) => a.placement - b.placement || (a.result === 'win' ? -1 : b.result === 'win' ? 1 : 0));
  // Duels: the winner stands on the left. Races: classic podium, first in the middle.
  const ordered = race ? [byPlace[1]!, byPlace[0]!, ...byPlace.slice(2)] : byPlace;
  const label = (p: ParticipantResultDto) => (race && p.result !== 'abandon' && p.result !== 'win' ? `${p.placement}.º lugar` : RESULT_TEXT[p.result]);
  const ratingDelta = mine.ratingAfter - mine.ratingBefore;

  return (
    <div className={`result ${won ? 'is-win' : draw ? 'is-draw' : 'is-loss'}`}>
      {won && <Confetti />}
      <motion.h1 className="result-title" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
        {label(mine)}
      </motion.h1>
      <p className="result-sub">
        {race
          ? mine.result === 'abandon'
            ? 'Te desconectaste demasiado tiempo.'
            : won
              ? `Llegaste primero entre ${summary.participants.length} corredores. ¡Nadie escribe más rápido en este piso!`
              : `Llegaste en el ${mine.placement}.º lugar de ${summary.participants.length}. ${byPlace[0]!.user.username} se llevó la carrera.`
          : won
          ? `Derrotaste a ${other?.user.username ?? 'tu rival'}. El Departamento de Duelos toma nota.`
          : draw
            ? 'Ni vencedores ni vencidos. Muy sinérgico.'
            : mine.result === 'abandon'
              ? 'Te desconectaste demasiado tiempo.'
              : `${other?.user.username ?? 'Tu rival'} ganó esta vez. La revancha está a un correo de distancia.`}
      </p>

      <div className={`result-stage ${race ? 'is-race' : ''}`}>
        {ordered.map((p, i) => {
          const pose = p.result === 'win' ? 'win' : p.result === 'draw' || (race && p.result === 'loss' && p.placement <= 3) ? 'idle' : 'lose';
          return (
            <motion.div
              key={p.user.id}
              className={`podium podium-${p.result} ${race ? `place-${p.result === 'abandon' ? 9 : p.placement}` : ''}`}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.15, type: 'spring' }}
            >
              {p.result === 'win' && (
                <motion.div className="podium-crown" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8, type: 'spring' }}>
                  <Crown size={28} />
                </motion.div>
              )}
              <Avatar config={p.user.avatar} pose={pose} size={race ? (p.result === 'win' ? 180 : 140) : p.result === 'win' ? 220 : 180} />
              <div className="podium-block">
                <strong>{p.user.username}</strong>
                <span>{label(p)}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="result-table">
        <table>
          <thead>
            <tr>
              <th />
              {ordered.map((p) => (
                <th key={p.user.id}>{p.user.id === me?.id ? 'Tú' : p.user.username}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                [words ? 'Palabras correctas' : `${cap(GAME_MODES[summary.mode].unit)} correctos`, 'correctWords'],
                ['Errores', 'errors'],
                [words ? 'Velocidad (PPM)' : 'Ritmo (aciertos/min)', 'wpm'],
                ['Precisión', 'accuracy'],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td>{label}</td>
                {ordered.map((p) => (
                  <td key={p.user.id}>
                    {p[key]}
                    {key === 'accuracy' ? '%' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rewards">
        <motion.div className="reward" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
          <span className="reward-label">Experiencia</span>
          <strong>+{mine.xpGained} XP</strong>
        </motion.div>
        <motion.div className="reward" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15 }}>
          <span className="reward-label">Rating</span>
          <strong className={ratingDelta >= 0 ? 'up' : 'down'}>
            {mine.ratingAfter} ({ratingDelta >= 0 ? '+' : ''}
            {ratingDelta})
          </strong>
        </motion.div>
        {mine.levelAfter > mine.levelBefore && (
          <motion.div className="reward reward-level" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.3, type: 'spring' }}>
            <span className="reward-label">¡Subiste de nivel!</span>
            <strong>Nivel {mine.levelAfter}</strong>
          </motion.div>
        )}
      </div>

      {mine.achievements.length > 0 && (
        <div className="ach-unlocked">
          {mine.achievements.map((id, i) => (
            <motion.div key={id} className="ach-pop" initial={{ scale: 0.4, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 1.4 + i * 0.25, type: 'spring', stiffness: 300, damping: 15 }}>
              <AchievementMedal id={id} size="lg" />
              <div>
                <span className="reward-label">Logro desbloqueado</span>
                <strong>{ACHIEVEMENTS_BY_ID.get(id)?.name}</strong>
                <small>{ACHIEVEMENTS_BY_ID.get(id)?.description}</small>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {mine.unlocked.length > 0 && (
        <motion.div className="unlocks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
          <h3>
            <Sparkles size={16} /> Nuevos objetos en tu armería
          </h3>
          <div className="unlock-list">
            {mine.unlocked.map((id) => {
              const item = ITEMS_BY_ID.get(id);
              return item ? (
                <span key={id} className="unlock">
                  {item.name} <RarityBadge rarity={item.rarity} />
                </span>
              ) : null;
            })}
          </div>
          <button className="link" onClick={() => go({ kind: 'armory' })}>
            Ir a la Armería
          </button>
        </motion.div>
      )}

      <div className="result-actions">
        {race && (
          <button className="btn btn-primary" onClick={() => startQuickMatch('racing')}>
            <RotateCcw size={16} /> Otra carrera
          </button>
        )}
        {other && !race && (
          <button className="btn btn-primary" onClick={() => openCompose(other.user.username)}>
            <RotateCcw size={16} /> Pedir revancha
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })}>
          <ArrowLeft size={16} /> Volver a la bandeja
        </button>
      </div>
    </div>
  );
}
