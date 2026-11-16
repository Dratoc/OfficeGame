import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { comboId, type GameModeId, type Prompt } from '@inbox/shared';

export type Mark = 'pending' | 'ok' | 'bad' | 'rejected';

interface PanelProps {
  prompts: Prompt[] | null;
  index: number;
  marks: Mark[];
  playing: boolean;
  over: boolean;
  onSubmit: (answer: string) => void;
}

/** The input area of a battle: one panel per mode, all answering a sequence of prompts. */
export function ModePanel({ mode, ...props }: PanelProps & { mode: GameModeId }) {
  if (mode === 'math') return <MathPanel {...props} />;
  if (mode === 'keys') return <KeysPanel {...props} />;
  if (mode === 'task') return <TaskPanel {...props} />;
  if (mode === 'puzzle') return <PuzzlePanel {...props} />;
  return <TypingPanel {...props} />;
}

const markClass = (m: Mark | undefined) => (m === 'ok' ? 'ok' : m === 'bad' ? 'bad' : m === 'rejected' ? 'rejected' : '');

function useFocus(playing: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (playing) ref.current?.focus();
  }, [playing]);
  return ref;
}

/* ---------------- Typing ---------------- */

function TypingPanel({ prompts, index, marks, playing, over, onSubmit }: PanelProps) {
  const [buffer, setBuffer] = useState('');
  const input = useFocus(playing);
  const words = prompts ?? [];
  const current = words[index]?.text ?? '';
  const flushed = useRef(false);

  // When time runs out, whatever is in the box still counts (the server applies the grace window).
  useEffect(() => {
    if (over && !flushed.current) {
      flushed.current = true;
      if (buffer.trim()) onSubmit(buffer);
      setBuffer('');
    }
  }, [over, buffer, onSubmit]);

  // Show a window of words around the current one.
  const start = Math.max(0, index - 6);
  const visible = words.slice(start, start + 22);
  const wrong = buffer.length > 0 && !current.startsWith(buffer.trim());

  return (
    <>
      <div className={`words ${!playing ? 'dim' : ''}`} aria-live="off">
        {visible.length === 0 && <span className="muted">Las palabras aparecen cuando empieza la cuenta…</span>}
        {visible.map((w, i) => {
          const at = start + i;
          const cls = at === index ? `current ${wrong ? 'wrong' : ''}` : at < index ? markClass(marks[at]) || 'sent' : '';
          return (
            <span key={at} className={`word ${cls}`}>
              {w.text}
            </span>
          );
        })}
      </div>
      <input
        ref={input}
        className="type-input"
        value={buffer}
        disabled={!playing}
        placeholder={playing ? 'Escribe aquí…' : over ? 'Tiempo' : 'Prepárate…'}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(' ')) {
            if (v.trim()) onSubmit(v);
            setBuffer('');
          } else setBuffer(v.slice(0, 40));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (buffer.trim()) onSubmit(buffer);
            setBuffer('');
          }
        }}
      />
    </>
  );
}

/* ---------------- Math ---------------- */

function MathPanel({ prompts, index, marks, playing, onSubmit }: PanelProps) {
  const [buffer, setBuffer] = useState('');
  const input = useFocus(playing);
  const list = prompts ?? [];
  const current = list[index];
  const history = list.slice(Math.max(0, index - 5), index).map((p, i, arr) => ({ p, at: index - arr.length + i }));

  const send = () => {
    if (!buffer.trim()) return;
    onSubmit(buffer);
    setBuffer('');
  };

  return (
    <div className={`panel math-panel ${!playing ? 'dim' : ''}`}>
      <div className="math-history">
        {history.map(({ p, at }) => (
          <span key={at} className={`chip-done ${markClass(marks[at])}`}>
            {p.text}
          </span>
        ))}
      </div>
      <div className="math-card">
        <AnimatePresence mode="popLayout">
          <motion.div key={index} className="math-problem" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.14 }}>
            {current ? `${current.text} =` : playing ? '¡Completaste todo!' : '¿ + ? ='}
          </motion.div>
        </AnimatePresence>
        <input
          ref={input}
          className="type-input math-input"
          inputMode="numeric"
          value={buffer}
          disabled={!playing}
          placeholder={playing ? '?' : ''}
          autoComplete="off"
          onPaste={(e) => e.preventDefault()}
          onChange={(e) => setBuffer(e.target.value.replace(/[^0-9-]/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
      <p className="muted small">Escribe el resultado y pulsa Enter.</p>
    </div>
  );
}

/* ---------------- Keys ---------------- */

const MODIFIERS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'CapsLock', 'AltGraph', 'OS', 'Fn']);

function keyFromCode(e: KeyboardEvent): string | null {
  const c = e.code;
  if (c.startsWith('Key')) return c.slice(3).toLowerCase();
  if (c.startsWith('Digit')) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c.toLowerCase();
  const map: Record<string, string> = { Enter: 'enter', Space: 'space', Backspace: 'backspace', Tab: 'tab', Escape: 'esc', Delete: 'delete', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end' };
  return map[c] ?? (e.key.length === 1 ? e.key.toLowerCase() : null);
}

function Keycap({ k }: { k: string }) {
  return <kbd className="keycap">{k}</kbd>;
}

function KeysPanel({ prompts, index, marks, playing, onSubmit }: PanelProps) {
  const [buffer, setBuffer] = useState('');
  const [pressed, setPressed] = useState<string[]>([]);
  const list = prompts ?? [];
  const current = list[index];
  const state = useRef({ current, buffer, onSubmit });
  state.current = { current, buffer, onSubmit };

  useEffect(() => setBuffer(''), [index]);

  useEffect(() => {
    if (!playing) return;
    const down = (e: KeyboardEvent) => {
      const { current: p, buffer: buf, onSubmit: submit } = state.current;
      if (!p) return;
      e.preventDefault();
      if (e.repeat) return;
      if (MODIFIERS.has(e.key)) {
        setPressed(mods(e));
        return;
      }
      if (p.kind === 'combo') {
        const key = keyFromCode(e);
        if (!key) return;
        const keys = [...mods(e).map((m) => m.toLowerCase()), key];
        setPressed([]);
        submit(comboId(keys));
      } else {
        if (e.key === 'Backspace') return setBuffer(buf.slice(0, -1));
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
        const next = buf + e.key;
        if (next.length >= p.text.length) {
          setBuffer('');
          submit(next);
        } else setBuffer(next);
      }
    };
    const up = (e: KeyboardEvent) => setPressed(mods(e));
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [playing]);

  return (
    <div className={`panel keys-panel ${!playing ? 'dim' : ''}`}>
      <div className="keys-history">
        {list.slice(Math.max(0, index - 6), index).map((p, i, arr) => {
          const at = index - arr.length + i;
          return (
            <span key={at} className={`chip-done ${markClass(marks[at])}`}>
              {p.kind === 'combo' ? p.keys!.join('+') : p.text}
            </span>
          );
        })}
      </div>
      <AnimatePresence mode="popLayout">
        <motion.div key={index} className="keys-prompt" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }} transition={{ duration: 0.12 }}>
          {!current ? (
            <span className="muted">{playing ? '¡Completaste todo!' : 'Prepara los dedos…'}</span>
          ) : current.kind === 'combo' ? (
            <>
              <span className="keys-label">{current.text}</span>
              <div className="keycaps">
                {current.keys!.map((k, i) => (
                  <span key={i} className="keycap-wrap">
                    {i > 0 && <span className="plus">+</span>}
                    <Keycap k={k} />
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="keys-label">Teclea los símbolos</span>
              <div className="symbols">
                {current.text.split('').map((ch, i) => (
                  <span key={i} className={`symbol ${i < buffer.length ? (buffer[i] === ch ? 'ok' : 'bad') : i === buffer.length ? 'current' : ''}`}>
                    {ch}
                  </span>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="keys-live" aria-hidden="true">
        {pressed.map((m) => (
          <Keycap key={m} k={m} />
        ))}
      </div>
      <p className="muted small">En Mac, ⌘ cuenta como Ctrl. Los atajos no afectan al navegador durante la batalla.</p>
    </div>
  );
}

function mods(e: KeyboardEvent) {
  const out: string[] = [];
  if (e.ctrlKey || e.metaKey) out.push('Ctrl');
  if (e.altKey) out.push('Alt');
  if (e.shiftKey) out.push('Shift');
  return out;
}

/* ---------------- Task ---------------- */

function TaskPanel({ prompts, index, marks, playing, onSubmit }: PanelProps) {
  const list = prompts ?? [];
  const current = list[index];
  const state = useRef({ current, onSubmit });
  state.current = { current, onSubmit };

  useEffect(() => {
    if (!playing) return;
    const down = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const choice = state.current.current?.choices?.[n - 1];
      if (choice) {
        e.preventDefault();
        state.current.onSubmit(choice.id);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [playing]);

  return (
    <div className={`panel task-panel ${!playing ? 'dim' : ''}`}>
      <div className="task-window">
        <div className="task-titlebar">
          <span className="task-dots">
            <i />
            <i />
            <i />
          </span>
          <strong>{current?.task ?? 'Tarea Express'}</strong>
          {current && (
            <span className="task-step">
              Paso {current.step} de {current.steps}
            </span>
          )}
        </div>
        <div className="task-progress">
          {current &&
            Array.from({ length: current.steps ?? 0 }, (_, i) => {
              const at = index - (current.step! - 1) + i;
              return <span key={i} className={`task-seg ${i < current.step! - 1 ? markClass(marks[at]) || 'ok' : i === current.step! - 1 ? 'current' : ''}`} />;
            })}
        </div>
        <AnimatePresence mode="popLayout">
          <motion.div key={index} className="task-body" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.14 }}>
            {current ? (
              <>
                <p className="task-question">{current.text}</p>
                <div className="task-choices">
                  {current.choices!.map((c, i) => (
                    <button key={c.id} className="task-choice" disabled={!playing} onClick={() => onSubmit(c.id)}>
                      <kbd className="keycap small">{i + 1}</kbd>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="task-question muted">{playing ? '¡Bandeja impecable!' : 'Abriendo tu primera tarea…'}</p>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="task-foot muted small">Usa el mouse o las teclas 1, 2 y 3.</div>
      </div>
    </div>
  );
}

/* ---------------- Puzzle ---------------- */

function PuzzlePanel({ prompts, index, marks, playing, onSubmit }: PanelProps) {
  const [buffer, setBuffer] = useState('');
  const list = prompts ?? [];
  const current = list[index];
  const input = useRef<HTMLInputElement>(null);
  const state = useRef({ current, onSubmit });
  state.current = { current, onSubmit };

  useEffect(() => {
    setBuffer('');
    if (playing && current?.input !== 'choice') input.current?.focus();
  }, [index, playing, current?.input]);

  // Choices can be picked with the number keys.
  useEffect(() => {
    if (!playing) return;
    const down = (e: KeyboardEvent) => {
      const p = state.current.current;
      if (p?.input !== 'choice') return;
      const choice = p.choices?.[Number(e.key) - 1];
      if (choice) {
        e.preventDefault();
        state.current.onSubmit(choice.id);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [playing]);

  const send = () => {
    if (!buffer.trim()) return;
    onSubmit(buffer);
    setBuffer('');
  };

  return (
    <div className={`panel puzzle-panel ${!playing ? 'dim' : ''}`}>
      <div className="math-history">
        {list.slice(Math.max(0, index - 8), index).map((p, i, arr) => {
          const at = index - arr.length + i;
          return <span key={at} className={`puzzle-dot ${markClass(marks[at])}`} />;
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={index} className="puzzle-card" initial={{ rotateX: -60, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 60, opacity: 0 }} transition={{ duration: 0.1 }}>
          {!current ? (
            <p className="puzzle-text muted">{playing ? '¡Resolviste todo!' : 'Barajando acertijos…'}</p>
          ) : (
            <>
              <span className="puzzle-label">{current.label}</span>
              <p className={`puzzle-text ${current.input === 'text' ? 'anagram' : ''}`}>{current.text}</p>
              {current.input === 'choice' ? (
                <div className={`puzzle-choices n${current.choices!.length}`}>
                  {current.choices!.map((c, i) => (
                    <button key={c.id} className="puzzle-choice" disabled={!playing} onClick={() => onSubmit(c.id)}>
                      <kbd className="keycap small">{i + 1}</kbd>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  ref={input}
                  className="type-input puzzle-input"
                  autoFocus
                  inputMode={current.input === 'number' ? 'numeric' : 'text'}
                  value={buffer}
                  disabled={!playing}
                  placeholder={current.input === 'number' ? '?' : 'Escribe la palabra'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onPaste={(e) => e.preventDefault()}
                  onChange={(e) => setBuffer((current.input === 'number' ? e.target.value.replace(/[^0-9-]/g, '') : e.target.value.replace(/\s/g, '')).slice(0, 20))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
