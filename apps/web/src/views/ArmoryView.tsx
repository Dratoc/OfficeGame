import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Save, Undo2 } from 'lucide-react';
import { HAIR_COLORS, ITEM_CATALOG, OPTIONAL_SLOTS, RARITIES, SKIN_TONES, SLOTS, SLOT_LABEL, type AvatarConfig, type Slot } from '@inbox/shared';
import { Avatar, type Pose } from '../avatar/Avatar';
import { RarityBadge } from '../components/Bits';
import { useApp } from '../lib/store';
import { api, ApiError } from '../lib/api';

export function ArmoryView() {
  const { me, refreshMe, toast, go } = useApp();
  const [draft, setDraft] = useState<AvatarConfig>(me!.avatar);
  const [slot, setSlot] = useState<Slot>('head');
  const [pose, setPose] = useState<Pose>('idle');
  const [saving, setSaving] = useState(false);
  const owned = useMemo(() => new Set(me!.inventory), [me]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(me!.avatar);

  useEffect(() => setDraft(me!.avatar), [me]);

  const items = ITEM_CATALOG.filter((i) => i.slot === slot).sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.unlockLevel - b.unlockLevel);
  const equip = (s: Slot, id: string | null) => setDraft((d) => ({ ...d, equipped: { ...d.equipped, [s]: id } }));

  const save = async () => {
    setSaving(true);
    try {
      await api('/api/avatar', { method: 'PUT', body: draft });
      await refreshMe();
      toast({ title: 'Avatar guardado', body: 'Tus colegas ya ven tu nuevo look.', tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo guardar', body: e instanceof ApiError ? e.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const ownedCount = ITEM_CATALOG.filter((i) => owned.has(i.id)).length;

  return (
    <div className="armory">
      <section className="armory-preview">
        <header className="pane-head">
          <h2>Armería</h2>
          <span className="muted small">
            {ownedCount} de {ITEM_CATALOG.length} objetos
          </span>
        </header>
        <div className="preview-stage">
          <motion.div key={JSON.stringify(draft.equipped)} initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
            <Avatar config={draft} pose={pose} size={280} />
          </motion.div>
        </div>
        <div className="pose-switch">
          {(
            [
              ['idle', 'En espera'],
              ['wave', 'Saludo'],
              ['run', 'Corriendo'],
              ['win', 'Victoria'],
              ['lose', 'Derrota'],
            ] as const
          ).map(([p, label]) => (
            <button key={p} className={pose === p ? 'on' : ''} onClick={() => setPose(p)}>
              {label}
            </button>
          ))}
        </div>
        <div className="swatches">
          <span className="muted small">Tono de piel</span>
          <div>
            {SKIN_TONES.map((c, i) => (
              <button key={c} className={`swatch ${draft.skin === i ? 'on' : ''}`} style={{ background: c }} onClick={() => setDraft({ ...draft, skin: i })} aria-label={`Tono ${i + 1}`} />
            ))}
          </div>
          <span className="muted small">Color de cabello y barba</span>
          <div>
            {HAIR_COLORS.map((c, i) => (
              <button key={c} className={`swatch ${draft.hairColor === i ? 'on' : ''}`} style={{ background: c }} onClick={() => setDraft({ ...draft, hairColor: i })} aria-label={`Color ${i + 1}`} />
            ))}
          </div>
        </div>
        <div className="armory-actions">
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar avatar'}
          </button>
          <button className="btn btn-ghost" disabled={!dirty} onClick={() => setDraft(me!.avatar)}>
            <Undo2 size={16} /> Deshacer
          </button>
        </div>
      </section>

      <section className="armory-items">
        <div className="slot-tabs" role="tablist">
          {SLOTS.map((s) => (
            <button key={s} role="tab" aria-selected={slot === s} className={slot === s ? 'on' : ''} onClick={() => setSlot(s)}>
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="item-grid">
          {OPTIONAL_SLOTS.includes(slot) && (
            <button className={`item-card ${!draft.equipped[slot] ? 'equipped' : ''}`} onClick={() => equip(slot, null)}>
              <div className="item-thumb item-none">Sin {SLOT_LABEL[slot].toLowerCase()}</div>
              <div className="item-info">
                <strong>Nada</strong>
                <small>Minimalismo corporativo.</small>
              </div>
            </button>
          )}
          {items.map((item) => {
            const has = owned.has(item.id);
            const on = draft.equipped[slot] === item.id;
            const preview: AvatarConfig = { ...draft, equipped: { ...draft.equipped, [slot]: item.id } };
            return (
              <button key={item.id} className={`item-card rar-${item.rarity} ${on ? 'equipped' : ''} ${has ? '' : 'locked'}`} onClick={() => (has ? equip(slot, item.id) : item.purchasable && go({ kind: 'shop' }))} title={has ? item.description : `${item.description} Se desbloquea en el nivel ${item.unlockLevel} o en la Tienda.`}>
                <div className="item-thumb">
                  <Avatar config={preview} size={96} crop={slot === 'pet' || slot === 'wings' || slot === 'cape' || slot === 'weapon' || slot === 'effect' ? 'full' : 'bust'} />
                  {!has && (
                    <span className="lock">
                      <Lock size={14} /> Nivel {item.unlockLevel}
                    </span>
                  )}
                </div>
                <div className="item-info">
                  <strong>{item.name}</strong>
                  <RarityBadge rarity={item.rarity} />
                  <small>{item.description}</small>
                </div>
              </button>
            );
          })}
        </div>
        <p className="muted small armory-note">Los objetos se ganan subiendo de nivel. Son solo cosméticos: no cambian nada en una batalla.</p>
      </section>
    </div>
  );
}
