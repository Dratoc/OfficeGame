import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Users, Zap } from 'lucide-react';
import type { PowerId, SalesWorld } from '@inbox/shared';
import { useApp } from '../lib/store';
import { startQuickMatch } from '../components/QuickMatch';
import { PowerPicker, saveLoadout, savedLoadout } from '../battle/PowerPicker';

const PracticeStage = lazy(() => import('../battle/PracticeStage'));
const ChairsPracticeStage = lazy(() => import('../battle/ChairsPracticeStage'));
const SalesPracticeStage = lazy(() => import('../battle/SalesPracticeStage'));

const GAMES = [
  { id: 'office', label: 'Pelea' },
  { id: 'chairs', label: 'Carrera de sillas' },
  { id: 'sales', label: 'Venta de maquinaria' },
] as const;
type Game = (typeof GAMES)[number]['id'];
const GAME_KEY = 'inbox-arena:practice-game';

function savedGame(): Game {
  try {
    const g = localStorage.getItem(GAME_KEY);
    return g === 'chairs' || g === 'sales' ? g : 'office';
  } catch {
    return 'office';
  }
}

const LEVELS = [
  { id: 0.3, label: 'Tranquilo' },
  { id: 0.5, label: 'Normal' },
  { id: 0.85, label: 'Difícil' },
] as const;

const KICKER: Record<Game, string> = { office: 'Office Battle', chairs: 'Carrera de Sillas', sales: 'A Toda Máquina' };

function salesSummary(w: SalesWorld): string {
  const days = w.day - 1;
  return `${days === 0 ? 'No cumplieron la meta del primer día' : days === 1 ? '1 jornada cumplida' : `${days} jornadas cumplidas`} · ${w.score} puntos · ${w.served} clientes atendidos`;
}

/** Office Battle or the chair race against one to three bots, or a sales shift with bot teammates. */
export function PracticeView() {
  const { me, go, queue } = useApp();
  const [game, setGame] = useState<Game>(savedGame);
  const [skill, setSkill] = useState<number>(0.5);
  const [bots, setBots] = useState(1);
  const [powers, setPowers] = useState<PowerId[]>(savedLoadout);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  if (!me) return null;
  const restart = () => {
    setResult(null);
    setRound((r) => r + 1);
  };

  return (
    <div className="battle practice">
      <header className="battle-head">
        <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })}>
          <ArrowLeft size={16} /> Bandeja
        </button>
        <div className="battle-title">
          <span className="battle-kicker">{KICKER[game]} · Práctica</span>
          <strong>
            {game === 'sales' ? (
              bots === 0 ? `${me.username}, solo en el local` : `${me.username} y ${bots === 1 ? '1 compañero bot' : `${bots} compañeros bot`}`
            ) : (
              <>
                {me.username} <span className="vs">VS</span> {bots === 1 ? 'Gerente Dragón' : `${bots} bots`}
              </>
            )}
          </strong>
        </div>
        <div className="practice-levels">
          <div role="group" aria-label="Juego" className="chip-row practice-game">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className={`chip ${game === g.id ? 'active' : ''}`}
                onClick={() => {
                  setGame(g.id);
                  if (g.id !== 'sales' && bots === 0) setBots(1);
                  try {
                    localStorage.setItem(GAME_KEY, g.id);
                  } catch {
                    /* private mode */
                  }
                  restart();
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label={game === 'sales' ? 'Cantidad de compañeros' : 'Cantidad de rivales'} className="chip-row">
            {(game === 'sales' ? [0, 1, 2, 3] : [1, 2, 3]).map((n) => (
              <button
                key={n}
                className={`chip ${bots === n ? 'active' : ''}`}
                onClick={() => {
                  setBots(n);
                  restart();
                }}
              >
                {game === 'sales' ? (n === 0 ? 'Solo' : n === 1 ? '1 compañero' : `${n} compañeros`) : n === 1 ? '1 rival' : `${n} rivales`}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Dificultad" className="chip-row">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                className={`chip ${skill === l.id ? 'active' : ''}`}
                onClick={() => {
                  setSkill(l.id);
                  restart();
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="office-stage office-loading">Cargando la oficina…</div>}>
        {game === 'sales' ? (
          <SalesPracticeStage key={`s${round}`} me={me} skill={skill} bots={bots} onEnd={(w) => setResult(salesSummary(w))} />
        ) : game === 'chairs' ? (
          <ChairsPracticeStage key={`c${round}`} me={me} skill={skill} bots={bots} onEnd={setResult} />
        ) : (
          <PracticeStage key={round} me={me} skill={skill} bots={bots} powers={powers.length === 2 ? powers : savedLoadout()} onEnd={setResult} />
        )}
      </Suspense>
      <div className="practice-actions">
        {result && (
          <button className="btn btn-primary" onClick={restart}>
            {game === 'sales' ? 'Otro turno' : game === 'chairs' ? 'Otra carrera' : 'Revancha'}
          </button>
        )}
        {game === 'sales' && result && <strong className="small">{result}</strong>}
        {game === 'sales' ? (
          <button className="btn btn-ghost" onClick={() => go({ kind: 'rooms' })}>
            <Users size={16} /> Jugar con tu equipo en una sala
          </button>
        ) : (
          <button className="btn btn-ghost" disabled={queue.searching} onClick={() => startQuickMatch(game)}>
            <Zap size={16} /> Buscar rivales de verdad
          </button>
        )}
        <span className="muted small">La práctica no da experiencia ni cambia tu rating.</span>
      </div>
      {game === 'office' && (
        <PowerPicker
          value={powers}
          onChange={(next) => {
            setPowers(next);
            if (next.length === 2) {
              saveLoadout(next);
              restart();
            }
          }}
        />
      )}
    </div>
  );
}
