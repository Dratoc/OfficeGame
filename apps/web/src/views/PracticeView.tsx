import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Zap } from 'lucide-react';
import type { PowerId } from '@inbox/shared';
import { useApp } from '../lib/store';
import { startQuickMatch } from '../components/QuickMatch';
import { PowerPicker, saveLoadout, savedLoadout } from '../battle/PowerPicker';

const PracticeStage = lazy(() => import('../battle/PracticeStage'));

const LEVELS = [
  { id: 0.3, label: 'Tranquilo' },
  { id: 0.5, label: 'Normal' },
  { id: 0.85, label: 'Difícil' },
] as const;

/** Office Battle against one to three sparring bots, to learn the moves and the powers. */
export function PracticeView() {
  const { me, go, queue } = useApp();
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
          <span className="battle-kicker">Office Battle · Práctica</span>
          <strong>
            {me.username} <span className="vs">VS</span> {bots === 1 ? 'Gerente Dragón' : `${bots} bots`}
          </strong>
        </div>
        <div className="practice-levels">
          <div role="group" aria-label="Cantidad de rivales" className="chip-row">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                className={`chip ${bots === n ? 'active' : ''}`}
                onClick={() => {
                  setBots(n);
                  restart();
                }}
              >
                {n === 1 ? '1 rival' : `${n} rivales`}
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
        <PracticeStage key={round} me={me} skill={skill} bots={bots} powers={powers.length === 2 ? powers : savedLoadout()} onEnd={setResult} />
      </Suspense>
      <div className="practice-actions">
        {result && (
          <button className="btn btn-primary" onClick={restart}>
            Revancha
          </button>
        )}
        <button className="btn btn-ghost" disabled={queue.searching} onClick={() => startQuickMatch('office')}>
          <Zap size={16} /> Buscar rivales de verdad
        </button>
        <span className="muted small">La práctica no da experiencia ni cambia tu rating.</span>
      </div>
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
    </div>
  );
}
