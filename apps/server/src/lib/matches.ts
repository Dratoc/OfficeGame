import {
  GAME_MODES,
  ITEMS_BY_ID,
  eloDelta,
  itemsUnlockedAtLevel,
  levelForXp,
  xpForResult,
  type GameModeId,
  type MailDto,
  type MatchResult,
  type MatchSummaryDto,
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
}

/** Decides results for a two player match. */
export function decideResults(input: Pick<FinalizeInput, 'outcomes' | 'abandoned' | 'compare'>): Map<string, MatchResult> {
  const [a, b] = input.outcomes.map((o) => o.userId) as [string, string];
  const res = new Map<string, MatchResult>();
  const aOut = input.abandoned.has(a);
  const bOut = input.abandoned.has(b);
  if (aOut && bOut) {
    res.set(a, 'abandon').set(b, 'abandon');
  } else if (aOut || bOut) {
    res.set(a, aOut ? 'abandon' : 'win').set(b, bOut ? 'abandon' : 'win');
  } else {
    const c = input.compare(a, b);
    res.set(a, c > 0 ? 'win' : c < 0 ? 'loss' : 'draw').set(b, c < 0 ? 'win' : c > 0 ? 'loss' : 'draw');
  }
  return res;
}

const scoreOf = (r: MatchResult) => (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0);

/**
 * Persists a finished match in one transaction: participants, player stats (XP, level,
 * rating, wins/losses), unlocked items, and a result mail for each player.
 * Idempotent: a match that is already finished is returned as is.
 */
export async function finalizeMatch(input: FinalizeInput): Promise<MatchSummaryDto> {
  const results = decideResults(input);
  const ids = input.outcomes.map((o) => o.userId);
  const bothAbandoned = [...results.values()].every((r) => r === 'abandon');
  const mails: MailDto[] = [];

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: input.matchId } });
    if (match.status === 'finished') return;

    const stats = await tx.playerStats.findMany({ where: { userId: { in: ids } } });
    const byId = new Map(stats.map((s) => [s.userId, s]));
    const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.username]));
    let winnerId: string | null = null;

    for (const o of input.outcomes) {
      const me = byId.get(o.userId)!;
      const oppId = ids.find((id) => id !== o.userId)!;
      const opp = byId.get(oppId)!;
      const result = results.get(o.userId)!;
      if (result === 'win') winnerId = o.userId;

      const delta = bothAbandoned ? 0 : eloDelta(me.rating, opp.rating, scoreOf(result));
      const xpGained = xpForResult(result, o.correctWords);
      const newXp = me.xp + xpGained;
      const newLevel = levelForXp(newXp);

      const owned = new Set((await tx.inventory.findMany({ where: { userId: o.userId }, select: { itemId: true } })).map((i) => i.itemId));
      const unlocked = itemsUnlockedAtLevel(newLevel).filter((id) => !owned.has(id));
      if (unlocked.length) {
        await tx.inventory.createMany({ data: unlocked.map((itemId) => ({ userId: o.userId, itemId, source: 'level' })), skipDuplicates: true });
      }

      await tx.playerStats.update({
        where: { userId: o.userId },
        data: {
          xp: newXp,
          level: newLevel,
          rating: Math.max(0, me.rating + delta),
          wins: { increment: result === 'win' ? 1 : 0 },
          losses: { increment: result === 'loss' || (result === 'abandon' && !bothAbandoned) ? 1 : 0 },
          draws: { increment: result === 'draw' ? 1 : 0 },
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
          unlocked,
        },
      });

      const oppName = nameOf.get(oppId) ?? 'tu rival';
      const subject =
        result === 'win' ? `Victoria contra ${oppName}` : result === 'loss' ? `Derrota contra ${oppName}` : result === 'draw' ? `Empate con ${oppName}` : `Partida abandonada contra ${oppName}`;
      const unlockedNames = unlocked.map((id) => ITEMS_BY_ID.get(id)?.name ?? id);
      const body = [
        result === 'win'
          ? 'Estimado/a campeón/a:\n\nTras una revisión exhaustiva, el Departamento de Duelos confirma tu victoria.'
          : result === 'loss'
            ? 'Estimado/a colaborador/a:\n\nLamentamos informarte que esta vez el teclado no estuvo de tu lado.'
            : result === 'draw'
              ? 'Estimado/a colaborador/a:\n\nEl duelo terminó en empate. El consejo real lo considera "un resultado sinérgico".'
              : 'Estimado/a colaborador/a:\n\nLa partida terminó porque alguien se desconectó.',
        `\n${GAME_MODES[input.mode].name}: ${o.correctWords} ${GAME_MODES[input.mode].unit} correctos, ${o.errors} errores.`,
        `Experiencia ganada: +${xpGained} XP. Rating: ${me.rating} → ${Math.max(0, me.rating + delta)}.`,
        newLevel > me.level ? `\n¡Subiste al nivel ${newLevel}!` : '',
        unlockedNames.length ? `Nuevos objetos en tu armería: ${unlockedNames.join(', ')}.` : '',
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
