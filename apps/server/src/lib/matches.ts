import {
  ACHIEVEMENTS_BY_ID,
  COINS_PER_ACHIEVEMENT,
  coinsForResult,
  GAME_MODES,
  CHAIRS_LAPS,
  newAchievements,
  ITEMS_BY_ID,
  multiEloDeltas,
  itemsUnlockedAtLevel,
  levelForXp,
  xpForResult,
  type GameModeId,
  type MailDto,
  type MatchResult,
  type MatchSummaryDto,
  type AchievementContext,
} from '@inbox/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { publicUserSelect, toPublicUser } from './users';
import { pushMail, sendMail } from './mail';
import type { PlayerOutcome } from '../modes/types';

/** Creates a match in the waiting state. Works inside or outside a transaction. */
export async function createMatch(mode: GameModeId, userIds: string[], tx: Prisma.TransactionClient = prisma): Promise<string> {
  const match = await tx.match.create({ data: { mode, participants: { create: userIds.map((userId) => ({ userId })) } } });
  return match.id;
}

export async function getMatchSummary(matchId: string): Promise<MatchSummaryDto | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { participants: { include: { user: { select: publicUserSelect } } } },
  });
  if (!m) return null;
  return {
    id: m.id,
    mode: m.mode as GameModeId,
    status: m.status as MatchSummaryDto['status'],
    winnerId: m.winnerId,
    startedAt: m.startedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
    words: m.status === 'finished' ? m.words : null,
    participants: m.participants.map((p) => ({
      user: toPublicUser(p.user),
      result: (p.result ?? 'draw') as MatchResult,
      placement: p.placement ?? 1,
      achievements: p.achievements,
      coinsGained: p.coinsGained,
      correctWords: p.correctWords,
      errors: p.errors,
      correctChars: p.correctChars,
      wpm: p.wpm,
      accuracy: p.accuracy,
      xpGained: p.xpGained,
      ratingBefore: p.ratingBefore ?? 0,
      ratingAfter: p.ratingAfter ?? 0,
      levelBefore: p.levelBefore ?? 1,
      levelAfter: p.levelAfter ?? 1,
      unlocked: p.unlocked,
    })),
  };
}

export interface FinalizeInput {
  matchId: string;
  mode: GameModeId;
  outcomes: PlayerOutcome[];
  abandoned: Set<string>;
  /** compare(a, b) > 0 if a beat b */
  compare: (a: string, b: string) => number;
  /** Cooperative modes: everyone still playing shares this result, and ratings do not change. */
  teamResult?: 'win' | 'loss';
}

export interface Standing {
  result: MatchResult;
  /** 1 is first. Players who tie share a place; abandons come last. */
  place: number;
}

/**
 * Decides results for a match of any size. Players still in the match are ranked with
 * `compare`; whoever ends alone in first place wins, a shared first place is a draw, and
 * everyone else loses. Players who abandoned rank last.
 */
export function decideResults(input: Pick<FinalizeInput, 'outcomes' | 'abandoned' | 'compare' | 'teamResult'>): Map<string, Standing> {
  const ids = input.outcomes.map((o) => o.userId);
  const res = new Map<string, Standing>();
  if (input.teamResult) {
    // One team: whoever stayed shares the result and the first place.
    const team = input.teamResult;
    ids.forEach((id) => res.set(id, input.abandoned.has(id) ? { result: 'abandon', place: ids.length } : { result: team, place: 1 }));
    return res;
  }
  const active = ids.filter((id) => !input.abandoned.has(id));
  const gone = ids.filter((id) => input.abandoned.has(id));
  if (active.length === 0) {
    ids.forEach((id) => res.set(id, { result: 'abandon', place: 1 }));
    return res;
  }
  const ranked = [...active].sort((a, b) => input.compare(b, a));
  let place = 1;
  ranked.forEach((id, i) => {
    if (i > 0 && input.compare(ranked[i - 1]!, id) !== 0) place = i + 1;
    res.set(id, { result: 'loss', place });
  });
  const firsts = ranked.filter((id) => res.get(id)!.place === 1);
  for (const id of firsts) res.get(id)!.result = firsts.length === 1 ? 'win' : 'draw';
  // Someone who outlasted every rival who left still wins.
  if (active.length === 1) res.get(active[0]!)!.result = 'win';
  gone.forEach((id) => res.set(id, { result: 'abandon', place: active.length + 1 }));
  return res;
}

/**
 * Persists a finished match in one transaction: participants, player stats (XP, level,
 * rating, wins/losses), unlocked items, and a result mail for each player.
 * Idempotent: a match that is already finished is returned as is.
 */
export async function finalizeMatch(input: FinalizeInput): Promise<MatchSummaryDto> {
  const standings = decideResults(input);
  const ids = input.outcomes.map((o) => o.userId);
  const n = ids.length;
  const allAbandoned = [...standings.values()].every((r) => r.result === 'abandon');
  const mails: MailDto[] = [];

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: input.matchId } });
    if (match.status === 'finished') return;

    const stats = await tx.playerStats.findMany({ where: { userId: { in: ids } } });
    const byId = new Map(stats.map((s) => [s.userId, s]));
    const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.username]));
    let winnerId: string | null = null;
    const deltas = allAbandoned || input.teamResult ? ids.map(() => 0) : multiEloDeltas(ids.map((id) => ({ rating: byId.get(id)!.rating, place: standings.get(id)!.place })));
    const deltaOf = new Map(ids.map((id, i) => [id, deltas[i]!]));

    for (const o of input.outcomes) {
      const me = byId.get(o.userId)!;
      const oppId = ids.find((id) => id !== o.userId)!;
      const { result, place } = standings.get(o.userId)!;
      if (result === 'win' && !input.teamResult) winnerId = o.userId;

      const delta = deltaOf.get(o.userId)!;
      const xpGained = xpForResult(result, o.correctWords, place, n);
      // Zona Zombi: part of the money made killing zombies becomes doubloons.
      const coins = coinsForResult(result, o.correctWords, place, n) + (input.mode === 'zombies' && result !== 'abandon' ? Math.min(60, Math.floor(o.correctChars / 40)) : 0);
      const newXp = me.xp + xpGained;
      const newLevel = levelForXp(newXp);

      const owned = new Set((await tx.inventory.findMany({ where: { userId: o.userId }, select: { itemId: true } })).map((i) => i.itemId));
      const unlocked = itemsUnlockedAtLevel(newLevel).filter((id) => !owned.has(id));
      if (unlocked.length) {
        await tx.inventory.createMany({ data: unlocked.map((itemId) => ({ userId: o.userId, itemId, source: 'level' })), skipDuplicates: true });
      }

      const after = await tx.playerStats.update({
        where: { userId: o.userId },
        data: {
          xp: newXp,
          level: newLevel,
          rating: Math.max(0, me.rating + delta),
          wins: { increment: result === 'win' ? 1 : 0 },
          losses: { increment: result === 'loss' || (result === 'abandon' && !allAbandoned) ? 1 : 0 },
          draws: { increment: result === 'draw' ? 1 : 0 },
          coins: { increment: coins },
        },
      });

      await tx.matchParticipant.update({
        where: { matchId_userId: { matchId: input.matchId, userId: o.userId } },
        data: {
          correctWords: o.correctWords,
          errors: o.errors,
          correctChars: o.correctChars,
          wpm: o.wpm,
          accuracy: o.accuracy,
          ratingBefore: me.rating,
          ratingAfter: Math.max(0, me.rating + delta),
          levelBefore: me.level,
          levelAfter: newLevel,
          xpGained,
          result,
          placement: place,
          unlocked,
          coinsGained: coins,
        },
      });

      const earned = await grantAchievements(tx, o.userId, input.matchId, {
        mode: input.mode,
        result,
        placement: place,
        players: n,
        correct: o.correctWords,
        errors: o.errors,
        wpm: o.wpm,
        level: newLevel,
        wins: after.wins,
        played: after.wins + after.losses + after.draws,
      });
      const bonus = earned.length * COINS_PER_ACHIEVEMENT;
      if (bonus) {
        await tx.playerStats.update({ where: { userId: o.userId }, data: { coins: { increment: bonus } } });
        await tx.matchParticipant.update({ where: { matchId_userId: { matchId: input.matchId, userId: o.userId } }, data: { coinsGained: coins + bonus } });
      }

      const oppName = nameOf.get(oppId) ?? 'tu rival';
      if (input.teamResult && input.mode === 'zombies') {
        const team = ids.filter((id) => id !== o.userId).map((id) => nameOf.get(id) ?? '').filter(Boolean);
        const waves = Math.max(0, o.wpm - 1);
        const subject =
          result === 'abandon'
            ? `${GAME_MODES[input.mode].name}: dejaste la partida`
            : `${GAME_MODES[input.mode].name}: llegaron a la oleada ${o.wpm}, ${o.correctWords} zombis eliminados`;
        const body = [
          'Estimado/a sobreviviente:\n\nRecursos Humanos confirma que la horda fue contenida (por ahora).',
          team.length ? `\nEquipo: tú, ${team.join(', ')}.` : '\nSobreviviste sin compañeros.',
          `Llegaron a la oleada ${o.wpm} (${waves === 1 ? '1 oleada superada' : `${waves} oleadas superadas`}).`,
          `Zombis que eliminaste: ${o.correctWords} (${o.accuracy} gigantes). Veces que caíste: ${o.errors}. Monedas ganadas en la partida: ${o.correctChars}.`,
          `Experiencia ganada: +${xpGained} XP. Doblones: +${coins + bonus}. Rating sin cambios en los modos cooperativos.`,
          newLevel > me.level ? `\n¡Subiste al nivel ${newLevel}!` : '',
          unlocked.length ? `Nuevos objetos en tu armería: ${unlocked.map((id) => ITEMS_BY_ID.get(id)?.name ?? id).join(', ')}.` : '',
          earned.length ? `Logros desbloqueados: ${earned.map((id) => `«${ACHIEVEMENTS_BY_ID.get(id)?.name ?? id}»`).join(', ')}.` : '',
          '\nAtentamente,\nComité de Emergencias',
        ]
          .filter(Boolean)
          .join('\n');
        mails.push(await sendMail({ toUserId: o.userId, kind: 'result', subject, body, matchId: input.matchId }, tx));
        continue;
      }
      if (input.teamResult) {
        const days = o.wpm - 1;
        const team = ids.filter((id) => id !== o.userId).map((id) => nameOf.get(id) ?? '').filter(Boolean);
        const coopSubject =
          result === 'abandon'
            ? `${GAME_MODES[input.mode].name}: dejaste el turno`
            : days >= 1
              ? `${GAME_MODES[input.mode].name}: ${days === 1 ? '1 jornada cumplida' : `${days} jornadas cumplidas`}, ${o.correctChars} puntos`
              : `${GAME_MODES[input.mode].name}: no alcanzaron la meta del primer día`;
        const coopBody = [
          days >= 1
            ? 'Estimado/a ejecutivo/a de ventas:\n\nGerencia comercial felicita al equipo por el turno. Las sucursales recibieron sus máquinas.'
            : 'Estimado/a ejecutivo/a de ventas:\n\nLos clientes se enojaron antes de cumplir la meta del día. Seguros ya está revisando los daños.',
          team.length ? `\nEquipo: tú, ${team.join(', ')}.` : '\nAtendiste el turno sin compañeros.',
          `Llegaron a la jornada ${o.wpm} con ${o.correctChars} puntos. Clientes bien atendidos: ${o.accuracy}%.`,
          `Pasos del pedido que hiciste: ${o.correctWords}. Entregas equivocadas: ${o.errors}.`,
          `Experiencia ganada: +${xpGained} XP. Doblones: +${coins + bonus}. Rating sin cambios en los modos cooperativos.`,
          newLevel > me.level ? `\n¡Subiste al nivel ${newLevel}!` : '',
          unlocked.length ? `Nuevos objetos en tu armería: ${unlocked.map((id) => ITEMS_BY_ID.get(id)?.name ?? id).join(', ')}.` : '',
          earned.length ? `Logros desbloqueados: ${earned.map((id) => `«${ACHIEVEMENTS_BY_ID.get(id)?.name ?? id}»`).join(', ')}.` : '',
          '\nAtentamente,\nGerencia Comercial',
        ]
          .filter(Boolean)
          .join('\n');
        mails.push(await sendMail({ toUserId: o.userId, kind: 'result', subject: coopSubject, body: coopBody, matchId: input.matchId }, tx));
        continue;
      }
      const subject = n > 2
        ? result === 'abandon'
          ? `${GAME_MODES[input.mode].name}: abandonaste la carrera`
          : result === 'win'
            ? `${GAME_MODES[input.mode].name}: ¡1.º lugar de ${n}!`
            : `${GAME_MODES[input.mode].name}: ${place}.º lugar de ${n}`
        : result === 'win' ? `Victoria contra ${oppName}` : result === 'loss' ? `Derrota contra ${oppName}` : result === 'draw' ? `Empate con ${oppName}` : `Partida abandonada contra ${oppName}`;
      const unlockedNames = unlocked.map((id) => ITEMS_BY_ID.get(id)?.name ?? id);
      const body = [
        result === 'win'
          ? 'Estimado/a campeón/a:\n\nTras una revisión exhaustiva, el Departamento de Duelos confirma tu victoria.'
          : result === 'loss'
            ? 'Estimado/a colaborador/a:\n\nLamentamos informarte que esta vez el teclado no estuvo de tu lado.'
            : result === 'draw'
              ? 'Estimado/a colaborador/a:\n\nEl duelo terminó en empate. El consejo real lo considera "un resultado sinérgico".'
              : 'Estimado/a colaborador/a:\n\nLa partida terminó porque alguien se desconectó.',
        n > 2 && result !== 'abandon' ? `\nTerminaste en el ${place}.º lugar de ${n}.` : '',
        input.mode === 'office'
          ? `\n${GAME_MODES[input.mode].name}: diste ${o.correctWords} golpes, recibiste ${o.errors} y causaste ${o.correctChars} de daño.`
          : input.mode === 'chairs'
          ? `\n${GAME_MODES[input.mode].name}: completaste ${o.correctChars} de ${CHAIRS_LAPS} vueltas, acertaste ${o.correctWords} bolas de papel y recibiste ${o.errors}.`
          : `\n${GAME_MODES[input.mode].name}: ${o.correctWords} ${GAME_MODES[input.mode].unit} correctos, ${o.errors} errores.`,
        `Experiencia ganada: +${xpGained} XP. Doblones: +${coins + bonus}. Rating: ${me.rating} → ${Math.max(0, me.rating + delta)}.`,
        newLevel > me.level ? `\n¡Subiste al nivel ${newLevel}!` : '',
        unlockedNames.length ? `Nuevos objetos en tu armería: ${unlockedNames.join(', ')}.` : '',
        earned.length ? `Logros desbloqueados: ${earned.map((id) => `«${ACHIEVEMENTS_BY_ID.get(id)?.name ?? id}»`).join(', ')}.` : '',
        '\nAtentamente,\nDepartamento de Duelos y Asuntos Épicos',
      ]
        .filter(Boolean)
        .join('\n');
      mails.push(await sendMail({ toUserId: o.userId, kind: 'result', subject, body, matchId: input.matchId }, tx));
    }

    await tx.match.update({ where: { id: input.matchId }, data: { status: 'finished', endedAt: new Date(), winnerId } });
  });

  mails.forEach(pushMail);
  const summary = await getMatchSummary(input.matchId);
  return summary!;
}

/**
 * Checks every achievement for one player at the end of a match and stores the new ones.
 * Runs inside the match transaction, after the player's stats were updated.
 */
async function grantAchievements(
  tx: Prisma.TransactionClient,
  userId: string,
  matchId: string,
  base: Omit<AchievementContext, 'winStreak' | 'modesWon' | 'friends' | 'hasPet'>,
): Promise<string[]> {
  const [owned, recent, modesWon, friends, avatar] = await Promise.all([
    tx.achievement.findMany({ where: { userId }, select: { achievementId: true } }),
    tx.matchParticipant.findMany({
      where: { userId, result: { not: null } },
      orderBy: { match: { createdAt: 'desc' } },
      select: { result: true },
      take: 20,
    }),
    tx.matchParticipant.findMany({ where: { userId, result: 'win' }, select: { match: { select: { mode: true } } } }),
    tx.friendship.count({ where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    tx.avatar.findUnique({ where: { userId }, select: { config: true } }),
  ]);
  let winStreak = 0;
  for (const r of recent) {
    if (r.result !== 'win') break;
    winStreak++;
  }
  const equipped = (avatar?.config as { equipped?: Record<string, string | undefined> } | null)?.equipped ?? {};
  const earned = newAchievements(
    { ...base, winStreak, modesWon: new Set(modesWon.map((m) => m.match.mode)).size, friends, hasPet: !!equipped.pet },
    owned.map((x) => x.achievementId),
  );
  if (earned.length) {
    await tx.achievement.createMany({ data: earned.map((achievementId) => ({ userId, achievementId, matchId })), skipDuplicates: true });
    await tx.matchParticipant.update({ where: { matchId_userId: { matchId, userId } }, data: { achievements: earned } });
  }
  return earned;
}
