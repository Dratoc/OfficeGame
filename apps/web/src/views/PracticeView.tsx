import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Zap } from 'lucide-react';
import { useApp } from '../lib/store';
import { startQuickMatch } from '../components/QuickMatch';

const PracticeStage = lazy(() => import('../battle/PracticeStage'));

const LEVELS = [
  { id: 0.3, label: 'Tranquilo' },
  { id: 0.5, label: 'Normal' },
  { id: 0.85, label: 'Difícil' },
] as const;

/** Office Battle against a sparring bot, to learn the moves before a real fight. */
export function PracticeView() {
  const { me, go, queue } = useApp();
  const [skill, setSkill] = useState<number>(0.5);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  if (!me) return null;

  return (
    <div className="battle practice">
      <header className="battle-head">
        <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'mail', folder: 'inbox', mailId: null })}>
          <ArrowLeft size={16} /> Bandeja
        </button>
        <div className="battle-title">
          <span className="battle-kicker">Office Battle · Práctica</span>
          <strong>
            {me.username} <span className="vs">VS</span> Gerente Dragón
          </strong>
        </div>
        <div className="practice-levels" role="group" aria-label="Dificultad del rival">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`chip ${skill === l.id ? 'active' : ''}`}
              onClick={() => {
                setSkill(l.id);
                setResult(null);
                setRound((r) => r + 1);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>
      <Suspense fallback={<div className="office-stage office-loading">Cargando la oficina…</div>}>
        <PracticeStage key={round} me={me} skill={skill} onEnd={setResult} />
      </Suspense>
      <div className="practice-actions">
        {result && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setResult(null);
              setRound((r) => r + 1);
            }}
          >
            Revancha
          </button>
        )}
        <button className="btn btn-ghost" disabled={queue.searching} onClick={() => startQuickMatch('office')}>
          <Zap size={16} /> Buscar rival de verdad
        </button>
        <span className="muted small">La práctica no da experiencia ni cambia tu rating.</span>
      </div>
    </div>
  );
}
