import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import type { MatchGoEvent, MatchSummaryDto, RoomStateEvent, WordResultEvent } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { getSocket, serverNow, syncClock } from '../lib/socket';
import { useApp } from '../lib/store';
import { ResultScene } from './ResultScene';

type WordMark = 'pending' | 'ok' | 'bad' | 'rejected';

export function BattleView({ matchId }: { matchId: string }) {
  const { me, go, refreshMe } = useApp();
  const [room, setRoom] = useState<RoomStateEvent | null>(null);
  const [error, setError] = useState('');
  const [rtt, setRtt] = useState<number | null>(null);
  const [game, setGame] = useState<MatchGoEvent | null>(null);
  const [summary, setSummary] = useState<MatchSummaryDto | null>(null);
  const [marks, setMarks] = useState<WordMark[]>([]);
  const [progress, setProgress] = useState<Record<string, { correctWords: number; errors: number }>>({});
  const [buffer, setBuffer] = useState('');
  const [now, setNow] = useState(serverNow());
  const indexRef = useRef(0);
  const [, force] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const flushed = useRef(false);

  // Join the room, keep in sync with the server.
  useEffect(() => {
    const s = getSocket();
    let alive = true;
    const onState = (st: RoomStateEvent) => st.matchId === matchId && setRoom(st);
    const onGo = (g: MatchGoEvent) => {
      if (g.matchId !== matchId) return;
      setGame(g);
      setMarks((m) => (m.length ? m : new Array(g.words.length).fill('pending')));
      setTimeout(() => inputRef.current?.focus(), 30);
    };
    const onWord = (w: WordResultEvent) => {
      if (w.matchId !== matchId) return;
      setProgress((p) => ({ ...p, [w.userId]: { correctWords: w.correctWords, errors: w.errors } }));
      if (w.userId !== me?.id) return;
      setMarks((m) => {
        const next = [...m];
        next[w.index] = !w.accepted ? 'rejected' : w.correct ? 'ok' : 'bad';
        return next;
      });
      if (!w.accepted) {
        // The server is the source of truth: resume from where it says we are.
        indexRef.current = w.nextIndex;
        force((x) => x + 1);
      }
    };
    const onEnd = (sum: MatchSummaryDto) => {
      if (sum.id !== matchId) return;
      setSummary(sum);
      void refreshMe();
    };
    s.on('room:state', onState);
    s.on('match:go', onGo);
    s.on('match:word', onWord);
    s.on('match:end', onEnd);

    const join = async () => {
      const sync = await syncClock();
      if (alive && sync.rtt !== Infinity) setRtt(Math.round(sync.rtt));
      const res = await s.timeout(5000).emitWithAck('room:join', { matchId }).catch(() => ({ ok: false, error: 'El servidor no respondió' }));
      if (alive && !res.ok) setError(res.error ?? 'No se pudo entrar a la sala');
    };
    void join();
    s.on('connect', join);

    return () => {
      alive = false;
      s.emit('room:leave', { matchId });
      s.off('room:state', onState);
      s.off('match:go', onGo);
      s.off('match:word', onWord);
      s.off('match:end', onEnd);
      s.off('connect', join);
    };
  }, [matchId, me?.id, refreshMe]);

  // Animation clock in server time.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(serverNow());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const submit = useCallback(
    (word: string) => {
      if (!game || !word.trim()) return;
      const index = indexRef.current;
      if (index >= game.words.length) return;
      getSocket().emit('typing:word', { matchId, index, word: word.trim(), typedAt: Math.min(serverNow(), game.endAt) });
      indexRef.current = index + 1;
      force((x) => x + 1);
    },
    [game, matchId],
  );

  const playing = !!game && now >= game.startAt && now < game.endAt;
  const over = !!game && now >= game.endAt;

  // When time runs out, send the half-typed word: it counts only if it is complete and correct.
  useEffect(() => {
    if (over && !flushed.current) {
      flushed.current = true;
      if (buffer.trim()) submit(buffer);
      setBuffer('');
    }
  }, [over, buffer, submit]);

  if (summary) return <ResultScene summary={summary} />;

  if (error) {
    return (
      <div className="battle battle-message">
        <h2>{error}</h2>
        <button className="btn btn-primary" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })}>
          Volver a la bandeja
        </button>
      </div>
    );
  }

  const meP = room?.players.find((p) => p.user.id === me?.id);
  const opp = room?.players.find((p) => p.user.id !== me?.id);
  const phase = room?.phase ?? 'waiting';
  const countdown = room?.startAt ? Math.ceil((room.startAt - now) / 1000) : null;
  const remaining = game ? Math.max(0, game.endAt - now) : 10_000;
  const total = game ? game.endAt - game.startAt : 10_000;
  const myIndex = indexRef.current;

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!playing) return;
      submit(buffer);
      setBuffer('');
    }
  };

  const lane = (p: typeof meP, mine: boolean) => {
    if (!p) return null;
    const live = progress[p.user.id];
    const correctWords = Math.max(p.correctWords, live?.correctWords ?? 0);
    const errors = Math.max(p.errors, live?.errors ?? 0);
    const pct = Math.min(100, (correctWords / 20) * 100);
    return (
      <div className={`lane ${mine ? 'lane-me' : ''}`}>
        <div className="lane-name">
          <strong>{mine ? 'Tú' : p.user.username}</strong>
          <span className="muted small">
            {correctWords} palabras · {errors} errores
          </span>
        </div>
        <div className="lane-track">
          <motion.div className="lane-runner" animate={{ left: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
            <Avatar config={p.user.avatar} pose={playing ? 'run' : 'idle'} size={64} />
          </motion.div>
          <div className="lane-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="battle">
      <header className="battle-head">
        <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })} disabled={phase === 'countdown' || playing}>
          <ArrowLeft size={16} /> Bandeja
        </button>
        <div className="battle-title">
          <span className="battle-kicker">Typing Battle</span>
          <strong>
            {meP?.user.username ?? '…'} <span className="vs">VS</span> {opp?.user.username ?? '…'}
          </strong>
        </div>
        <span className={`net ${rtt !== null && rtt < 150 ? 'good' : 'meh'}`} title="Latencia con el servidor">
          {rtt === null ? <WifiOff size={14} /> : <Wifi size={14} />} {rtt === null ? '—' : `${rtt} ms`}
        </span>
      </header>

      {phase === 'waiting' && room && (
        <div className="lobby">
          <div className="lobby-stage">
            {[meP, opp].map(
              (p, i) =>
                p && (
                  <motion.div key={p.user.id} className={`lobby-player ${i === 1 ? 'flip' : ''}`} initial={{ opacity: 0, x: i === 0 ? -40 : 40 }} animate={{ opacity: 1, x: 0 }}>
                    <Avatar config={p.user.avatar} pose={p.ready ? 'wave' : 'idle'} size={190} />
                    <strong>{p.user.username}</strong>
                    <span className={`ready-tag ${p.ready ? 'on' : ''} ${!p.connected ? 'off' : ''}`}>{!p.connected ? 'Desconectado' : p.ready ? '¡Listo!' : 'Preparándose…'}</span>
                  </motion.div>
                ),
            )}
            <div className="lobby-vs">VS</div>
          </div>
          <div className="lobby-actions">
            {meP?.ready ? (
              <p className="muted">Esperando a {opp?.user.username}. La batalla comienza cuando ambos estén listos.</p>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={() => getSocket().emit('room:ready', { matchId })}>
                ¡Estoy listo!
              </button>
            )}
            <p className="muted small">Escribe cada palabra y pulsa espacio. Pegar texto no está permitido.</p>
          </div>
        </div>
      )}

      {(phase === 'countdown' || phase === 'playing' || phase === 'finished') && (
        <div className="arena">
          <div className="timer">
            <div className="timer-fill" style={{ width: `${(remaining / total) * 100}%` }} />
            <span>{(remaining / 1000).toFixed(1)} s</span>
          </div>
          <div className="lanes">
            {lane(meP, true)}
            {lane(opp, false)}
          </div>

          <AnimatePresence>
            {countdown !== null && countdown > 0 && !playing && !over && (
              <motion.div key={countdown} className="countdown" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                {countdown}
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`words ${playing ? '' : 'dim'}`}>
            {game ? (
              game.words.slice(Math.max(0, myIndex - 6), myIndex + 24).map((w, k) => {
                const i = Math.max(0, myIndex - 6) + k;
                const current = i === myIndex;
                const typedOk = current && w.startsWith(buffer.trim());
                return (
                  <span key={i} className={`word ${marks[i] ?? ''} ${i < myIndex && marks[i] === 'pending' ? 'sent' : ''} ${current ? (typedOk ? 'current' : 'current wrong') : ''}`}>
                    {w}
                  </span>
                );
              })
            ) : (
              <span className="muted">Las palabras aparecen cuando empieza la batalla…</span>
            )}
          </div>

          <input
            ref={inputRef}
            className="type-input"
            value={buffer}
            disabled={!playing}
            onChange={(e) => setBuffer(e.target.value.replace(/\s/g, ''))}
            onKeyDown={onKey}
            onPaste={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={playing ? '' : over ? 'Tiempo. Calculando el resultado en el servidor…' : 'Prepárate…'}
            aria-label="Escribe aquí"
          />
        </div>
      )}
    </div>
  );
}
