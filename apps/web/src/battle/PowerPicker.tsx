import { LOADOUT_SIZE, POWER_IDS, POWERS, DEFAULT_LOADOUT, type PowerId } from '@inbox/shared';

export const POWER_ICON: Record<PowerId, string> = {
  stapler: '📎',
  coffee: '☕',
  folders: '🗂️',
  sprint: '⚡',
  meeting: '📣',
  bandage: '🩹',
};

const KEY = 'inbox-arena:office-loadout';

/** The last pair of powers you picked, so you do not have to choose every time. */
export function savedLoadout(): PowerId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(v) && v.length === LOADOUT_SIZE && v.every((x) => (POWER_IDS as readonly string[]).includes(x)) && v[0] !== v[1]) return v as PowerId[];
  } catch {
    /* storage may be blocked */
  }
  return [...DEFAULT_LOADOUT];
}

export function saveLoadout(l: PowerId[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage may be blocked */
  }
}

/**
 * The power wallet: pick two of the six powers. The first goes on Q, the second on E.
 * Clicking a picked power removes it; picking a third replaces the oldest.
 */
export function PowerPicker({ value, onChange, disabled }: { value: PowerId[]; onChange: (v: PowerId[]) => void; disabled?: boolean }) {
  const toggle = (id: PowerId) => {
    if (disabled) return;
    let next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    if (next.length > LOADOUT_SIZE) next = next.slice(next.length - LOADOUT_SIZE);
    onChange(next);
  };
  return (
    <div className="power-picker">
      <div className="power-picker-head">
        <strong>Cartera de poderes</strong>
        <span className="muted small">
          Elige {LOADOUT_SIZE}: el primero va en <kbd>Q</kbd> y el segundo en <kbd>E</kbd>. Todos tienen los mismos poderes disponibles.
        </span>
      </div>
      <div className="power-grid">
        {POWER_IDS.map((id) => {
          const slot = value.indexOf(id);
          return (
            <button key={id} type="button" className={`power-card ${slot >= 0 ? 'on' : ''}`} onClick={() => toggle(id)} disabled={disabled} aria-pressed={slot >= 0}>
              <span className="power-icon" aria-hidden="true">
                {POWER_ICON[id]}
              </span>
              <span className="power-text">
                <strong>{POWERS[id].name}</strong>
                <small>{POWERS[id].description}</small>
                <small className="power-cd">Recarga: {POWERS[id].cooldown} s</small>
              </span>
              {slot >= 0 && <span className="power-key">{slot === 0 ? 'Q' : 'E'}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LoadoutBadges({ loadout }: { loadout?: PowerId[] }) {
  if (!loadout?.length) return null;
  return (
    <span className="loadout-badges" title={loadout.map((id) => POWERS[id].name).join(' y ')}>
      {loadout.map((id) => (
        <span key={id}>{POWER_ICON[id]}</span>
      ))}
    </span>
  );
}
