import { Briefcase, Calculator, Coffee, Crown, Flag, Flame, Keyboard, Layers, PawPrint, Star, Swords, Target, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, type AchievementDef } from '@inbox/shared';

const ICONS: Record<AchievementDef['icon'], LucideIcon> = {
  star: Star,
  sword: Swords,
  crown: Crown,
  flame: Flame,
  zap: Zap,
  target: Target,
  calc: Calculator,
  keyboard: Keyboard,
  layers: Layers,
  flag: Flag,
  trend: TrendingUp,
  briefcase: Briefcase,
  users: Users,
  paw: PawPrint,
  coffee: Coffee,
};

export function AchievementMedal({ id, locked = false, size = 'md' }: { id: string; locked?: boolean; size?: 'md' | 'lg' }) {
  const a = ACHIEVEMENTS_BY_ID.get(id);
  if (!a) return null;
  const Icon = ICONS[a.icon] ?? Star;
  return (
    <span className={`medal tier-${a.tier} ${locked ? 'locked' : ''} medal-${size}`} aria-hidden="true">
      <Icon size={size === 'lg' ? 26 : 18} strokeWidth={2.2} />
    </span>
  );
}

/** Every achievement, earned ones in color with their date, the rest greyed out. */
export function AchievementGrid({ earned }: { earned: { id: string; unlockedAt: string }[] }) {
  const when = new Map(earned.map((e) => [e.id, e.unlockedAt]));
  return (
    <div className="ach-grid">
      {ACHIEVEMENTS.map((a) => {
        const at = when.get(a.id);
        return (
          <div key={a.id} className={`ach ${at ? 'got' : 'locked'}`} title={a.description}>
            <AchievementMedal id={a.id} locked={!at} />
            <div className="ach-text">
              <strong>{a.name}</strong>
              <span>{at ? `Desbloqueado el ${new Date(at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}` : a.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
