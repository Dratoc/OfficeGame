import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { GAME_MODES, RACE_LENGTH, type GameModeId, type MatchGoEvent, type MatchSummaryDto, type RoomStateEvent, type WordResultEvent } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { getSocket, serverNow, syncClock } from '../lib/socket';
import { useApp } from '../lib/store';
import { ResultScene } from './ResultScene';
import { DuelStage, type DuelEffect } from '../battle/DuelStage';
import { ModePanel, type Mark } from '../battle/panels';
import { RaceTrack } from '../battle/RaceTrack';

const HOW_TO: Record<string, string> = {
  typing: 'Escribe cada palabra y pulsa espacio. Pegar texto no está permitido.',
  math: 'Escribe el resultado y pulsa Enter.',
  keys: 'Presiona la combinación que aparece (en Mac, ⌘ cuenta como Ctrl) o teclea los símbolos.',
  task: 'Elige la opción correcta de cada paso con el mouse o con las teclas 1, 2 y 3.',
  racing: `Escribe cada palabra y pulsa espacio. Gana quien llegue primero a ${RACE_LENGTH} palabras.`,
};

export function BattleView({ matchId }: { matchId: string }) {
  const { me, go, refreshMe } = useApp();
  const [room, setRoom] = useState<RoomStateEvent | null>(null);
  const [error, setError] = useState('');
  const [rtt, setRtt] = useState<number | null>(null);
  const [game, setGame] = useState<MatchGoEvent | null>(null);
  const [summary, setSummary] = useState<MatchSummaryDto | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [progress, setProgress] = useState<Record<string, { correctWords: number; errors: number }>>({});
  const [effects, setEffects] = useState<DuelEffect[]>([]);
  const [now, setNow] = useState(serverNow());
  const indexRef = useRef(0);
  const [, force] = useState(0);
  const effectId = useRef(0);

  // Join the room and keep in sync with the server.
  useEffect(() => {
    const s = getSocket();
    let alive = true;
    const onState = (st: RoomStateEvent) => st.matchId === matchId && setRoom(st);
    const onGo = (g: MatchGoEvent) => {
      if (g.matchId !== matchId) return;
      setGame(g);
      setMarks((m) => (m.length ? m : new Array(g.prompts.length).fill('pending')));
    };
    const onWord = (w: WordResultEvent) => {
      if (w.matchId !== matchId) return;
      setProgress((p) => ({ ...p, [w.userId]: { correctWords: w.correctWords, errors: w.errors } }));
      const fx: DuelEffect = { id: effectId.current++, userId: w.userId, kind: !w.accepted ? 'reject' : w.correct ? 'hit' : 'miss', at: serverNow() };
      setEffects((e) => [...e.filter((x) => serverNow() - x.at < 1500), fx]);
      if (w.userId !== me?.id) return;
      setMarks((m) => {
        const next = [...m];
        next[w.index] = fx.kind === 'reject' ? 'rejected' : fx.kind === 'hit' ? 'ok' : 'bad';
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
      setTimeout(() => setSummary(sum), 600);
      void refreshMe();
    };
    s.on('room:state', onState);
    s.on('match:go', onGo);
    s.on('match:word', onWord);
    s.on('match:end', onEnd);

    const join = async () => {
      const sync = await syncClock();
      if (alive && sync.rtt !== Infinity) setRtt(Math.round(sync.rtt));
      const res = await s
        .timeout(5000)
        .emitWithAck('room:join', { matchId })
        .catch(() => ({ ok: false, error: 'El servidor no respondió' }));
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

  // Animation clock, in server time.
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
    (answer: string) => {
      if (!game || !answer.trim()) return;
      const index = indexRef.current;
      if (index >= game.prompts.length) return;
      getSocket().emit('match:answer', { matchId, index, answer: answer.trim(), typedAt: Math.min(serverNow(), game.endAt) });
      indexRef.current = index + 1;
      force((x) => x + 1);
    },
    [game, matchId],
  );

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

  const mode: GameModeId = game?.mode ?? room?.mode ?? 'typing';
  const info = GAME_MODES[mode];
  const meP = room?.players.find((p) => p.user.id === me?.id);
  const opp = room?.players.find((p) => p.user.id !== me?.id);
  const race = mode === 'racing';
  // Me first, then everyone else in join order.
  const everyone = room ? [...(meP ? [meP] : []), ...room.players.filter((p) => p !== meP)] : [];
  const phase = room?.phase ?? 'waiting';
  const playing = !!game && now >= game.startAt && now < game.endAt;
  const over = !!game && now >= game.endAt;
  const countdown = room?.startAt ? Math.ceil((room.startAt - now) / 1000) : null;
  const total = game ? game.endAt - game.startAt : info.durationMs;
  const remaining = game ? Math.max(0, game.endAt - now) : total;
  const score = (p: typeof meP) => {
    if (!p) return { correctWords: 0, errors: 0 };
    const live = progress[p.user.id];
    return { correctWords: Math.max(p.correctWords, live?.correctWords ?? 0), errors: Math.max(p.errors, live?.errors ?? 0) };
  };

  return (
    <div className="battle">
      <header className="battle-head">
        <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })} disabled={phase === 'countdown' || playing}>
          <ArrowLeft size={16} /> Bandeja
        </button>
        <div className="battle-title">
          <span className="battle-kicker">{info.name}</span>
          <strong>
            {race && everyone.length > 2 ? (
              `Carrera de ${everyone.length} corredores`
            ) : (
              <>
                {meP?.user.username ?? '…'} <span className="vs">VS</span> {opp?.user.username ?? '…'}
              </>
            )}
          </strong>
        </div>
        <span className={`net ${rtt !== null && rtt < 150 ? 'good' : 'meh'}`} title="Latencia con el servidor">
          {rtt === null ? <WifiOff size={14} /> : <Wifi size={14} />} {rtt === null ? '—' : `${rtt} ms`}
        </span>
      </header>

      {phase === 'waiting' && room && (
        <div className="lobby">
          <div className="lobby-mode">
            <strong>{info.name}</strong>
            <span>
              {info.tagline} · {Math.round(info.durationMs / 1000)} segundos
            </span>
          </div>
          <div className={`lobby-stage ${everyone.length > 2 ? 'crowd' : ''}`}>
            {(everyone.length > 2 ? everyone : [meP, opp]).map(
              (p, i) =>
                p && (
                  <motion.div key={p.user.id} className={`lobby-player ${i === 1 && everyone.length <= 2 ? 'flip' : ''}`} initial={{ opacity: 0, x: i === 0 ? -40 : 40 }} animate={{ opacity: 1, x: 0 }}>
                    <Avatar config={p.user.avatar} pose={p.ready ? 'wave' : 'idle'} size={everyone.length > 2 ? 140 : 190} />
                    <strong>{p.user.username}</strong>
                    <span className={`ready-tag ${p.ready ? 'on' : ''} ${!p.connected ? 'off' : ''}`}>{!p.connected ? 'Desconectado' : p.ready ? '¡Listo!' : 'Preparándose…'}</span>
                  </motion.div>
                ),
            )}
            {everyone.length <= 2 && <div className="lobby-vs">VS</div>}
          </div>
          <div className="lobby-actions">
            {meP?.ready ? (
              <p className="muted">
                {everyone.length > 2 ? 'Esperando al resto. La carrera comienza cuando todos estén listos.' : `Esperando a ${opp?.user.username}. La batalla comienza cuando ambos estén listos.`}
              </p>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={() => getSocket().emit('room:ready', { matchId })}>
                ¡Estoy listo!
              </button>
            )}
            <p className="muted small">{HOW_TO[mode]}</p>
          </div>
        </div>
      )}

      {(phase === 'countdown' || phase === 'playing' || phase === 'finished') && meP && opp && (
        <div className="arena">
          <div className="timer">
            <div className="timer-fill" style={{ width: `${(remaining / total) * 100}%` }} />
            <span>{(remaining / 1000).toFixed(1)} s</span>
          </div>

          {race ? (
            <RaceTrack runners={everyone.map((p) => ({ user: p.user, ...score(p) }))} meId={meP.user.id} effects={effects} now={now} finished={over || phase === 'finished'} />
          ) : (
            <DuelStage
              me={{ user: meP.user, ...score(meP) }}
              opp={{ user: opp.user, ...score(opp) }}
              effects={effects}
              now={now}
              unit={info.unit}
              finished={over || phase === 'finished'}
            />
          )}

          <AnimatePresence>
            {countdown !== null && countdown > 0 && !playing && !over && (
              <motion.div key={countdown} className="countdown" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                {countdown}
              </motion.div>
            )}
          </AnimatePresence>

          {race && score(meP).correctWords >= RACE_LENGTH ? (
            <div className="race-done">
              <strong>¡Llegaste a la meta!</strong>
              <span className="muted">Espera a que lleguen los demás o a que se acabe el tiempo.</span>
            </div>
          ) : (
            <ModePanel mode={mode} prompts={game?.prompts ?? null} index={indexRef.current} marks={marks} playing={playing} over={over} onSubmit={submit} />
          )}
        </div>
      )}
    </div>
  );
}
