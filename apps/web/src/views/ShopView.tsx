import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Coins, Heart, Shield, Sparkles, Timer } from 'lucide-react';
import { ITEMS_BY_ID, RARITIES, SLOTS, SLOT_LABEL, type ShopDto, type ShopItemDto, type Slot } from '@inbox/shared';
import { Avatar } from '../avatar/Avatar';
import { RarityBadge } from '../components/Bits';
import { useApp } from '../lib/store';
import { api, ApiError } from '../lib/api';

function untilMidnightUtc(now: number) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const mins = Math.max(0, Math.round((next - now) / 60_000));
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function Doubloons({ amount, size = 16 }: { amount: number; size?: number }) {
  return (
    <span className="coins">
      <Coins size={size} /> {amount.toLocaleString('es')}
    </span>
  );
}

export function ShopView() {
  const { me, refreshMe, toast, go } = useApp();
  const [shop, setShop] = useState<ShopDto | null>(null);
  const [slot, setSlot] = useState<Slot | 'all'>('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ShopDto>('/api/shop').then(setShop, (e) => setError(e instanceof ApiError ? e.message : 'No se pudo abrir la tienda'));
  }, []);

  const buy = async (it: ShopItemDto) => {
    if (confirm !== it.itemId) return setConfirm(it.itemId);
    setBusy(it.itemId);
    try {
      const next = await api<ShopDto>('/api/shop/buy', { body: { itemId: it.itemId, expectedPrice: it.price } });
      setShop(next);
      setConfirm(null);
      await refreshMe();
      toast({ title: `¡${ITEMS_BY_ID.get(it.itemId)?.name} es tuyo!`, body: 'Ya puedes equiparlo en la Armería.', tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo comprar', body: e instanceof ApiError ? e.message : undefined, tone: 'error' });
      api<ShopDto>('/api/shop').then(setShop, () => {});
    } finally {
      setBusy(null);
    }
  };

  const catalog = useMemo(() => {
    if (!shop) return [];
    return shop.items
      .filter((i) => !i.featured && (slot === 'all' || ITEMS_BY_ID.get(i.itemId)?.slot === slot))
      .sort((a, b) => Number(a.owned) - Number(b.owned) || RARITIES.indexOf(ITEMS_BY_ID.get(a.itemId)!.rarity) - RARITIES.indexOf(ITEMS_BY_ID.get(b.itemId)!.rarity));
  }, [shop, slot]);

  if (error) return <div className="shop battle-message">{error}</div>;
  if (!shop || !me) return <div className="shop muted">Abriendo la tienda…</div>;

  const card = (it: ShopItemDto, i: number) => {
    const item = ITEMS_BY_ID.get(it.itemId)!;
    const preview = { ...me.avatar, equipped: { ...me.avatar.equipped, [item.slot]: item.id } };
    const short = shop.coins < it.price;
    return (
      <motion.div key={it.itemId} className={`shop-card rarity-${item.rarity} ${it.owned ? 'owned' : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
        {it.featured && <span className="shop-sale">−25%</span>}
        <div className="shop-preview">
          <Avatar config={preview} size={128} pose={item.slot === 'pet' || item.slot === 'wings' ? 'wave' : 'idle'} />
        </div>
        <div className="shop-info">
          <strong>{item.name}</strong>
          <span className="muted small">{SLOT_LABEL[item.slot]}</span>
          <RarityBadge rarity={item.rarity} />
          <p className="small muted">{item.description}</p>
        </div>
        <div className="shop-buy">
          {it.owned ? (
            <span className="shop-owned">
              <Check size={16} /> En tu armería
            </span>
          ) : (
            <>
              <span className="shop-price">
                {it.featured && <s>{it.fullPrice}</s>}
                <Doubloons amount={it.price} />
              </span>
              <button className={`btn btn-sm ${confirm === it.itemId ? 'btn-primary' : 'btn-ghost'}`} disabled={short || busy !== null} onClick={() => void buy(it)} onBlur={() => confirm === it.itemId && setConfirm(null)}>
                {busy === it.itemId ? 'Comprando…' : short ? `Faltan ${it.price - shop.coins}` : confirm === it.itemId ? 'Confirmar' : 'Comprar'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="shop">
      <header className="shop-head">
        <div>
          <h2>Tienda del gremio</h2>
          <p className="muted">Solo estilo, nunca ventaja: ningún objeto cambia cómo se juega.</p>
        </div>
        <div className="shop-balance">
          <span className="muted small">Tus doblones</span>
          <Doubloons amount={shop.coins} size={20} />
          <span className="muted small">Ganas más en cada partida y con cada logro.</span>
        </div>
      </header>

      <section>
        <h3 className="shop-section">
          <Sparkles size={16} /> Ofertas del día
          <span className="muted small shop-timer">
            <Timer size={14} /> Cambian en {untilMidnightUtc(Date.now())}
          </span>
        </h3>
        <div className="shop-grid">{shop.items.filter((i) => i.featured).map(card)}</div>
      </section>

      <section>
        <h3 className="shop-section">
          <Shield size={16} /> Catálogo
        </h3>
        <div className="chips">
          {(['all', ...SLOTS] as const)
            .filter((s) => s === 'all' || shop.items.some((i) => ITEMS_BY_ID.get(i.itemId)?.slot === s))
            .map((s) => (
              <button key={s} className={`chip ${slot === s ? 'active' : ''}`} onClick={() => setSlot(s)}>
                {s === 'all' ? 'Todo' : SLOT_LABEL[s]}
              </button>
            ))}
        </div>
        <div className="shop-grid">{catalog.map(card)}</div>
      </section>

      <section className="tips">
        <div className="tips-icon">
          <Heart size={22} />
        </div>
        <div>
          <h3>Apoya al gremio</h3>
          <p className="muted">
            Inbox Arena es gratis. Si te gusta, pronto podrás dejar un aporte voluntario para mantener los servidores encendidos. Los aportes no dan ventajas: como mucho, un
            agradecimiento en tu bandeja.
          </p>
        </div>
        <button className="btn btn-ghost" disabled>
          Próximamente
        </button>
      </section>

      <p className="muted small shop-foot">
        ¿Compraste algo? <button className="link" onClick={() => go({ kind: 'armory' })}>Equípalo en la Armería</button>
      </p>
    </div>
  );
}
