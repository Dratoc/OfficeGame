import type { Prisma } from '@prisma/client';
import type { ChallengeDto, ChallengeStatus, MailDto, MailKind } from '@inbox/shared';
import type { GameModeId } from '@inbox/shared';
import { prisma } from './db';
import { publicUserSelect, toPublicUser } from './users';
import { toUser } from '../realtime/notify';

export const mailInclude = {
  from: { select: publicUserSelect },
  to: { select: publicUserSelect },
  challenge: true,
} satisfies Prisma.MailInclude;

type MailRow = Prisma.MailGetPayload<{ include: typeof mailInclude }>;

export function toChallengeDto(c: NonNullable<MailRow['challenge']>): ChallengeDto {
  return {
    id: c.id,
    mode: c.mode as GameModeId,
    status: c.status as ChallengeStatus,
    challengerId: c.challengerId,
    opponentId: c.opponentId,
    expiresAt: c.expiresAt.toISOString(),
    matchId: c.matchId,
  };
}

export function toMailDto(m: MailRow): MailDto {
  return {
    id: m.id,
    kind: m.kind as MailKind,
    from: m.from ? toPublicUser(m.from) : null,
    to: toPublicUser(m.to),
    subject: m.subject,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    challenge: m.challenge ? toChallengeDto(m.challenge) : null,
    matchId: m.matchId,
  };
}

export interface NewMail {
  fromUserId?: string | null;
  toUserId: string;
  kind: MailKind;
  subject: string;
  body: string;
  challengeId?: string;
  matchId?: string;
}

/** Creates a mail and pushes it live to the recipient. */
export async function sendMail(data: NewMail, tx: Prisma.TransactionClient = prisma): Promise<MailDto> {
  const row = await tx.mail.create({ data: { ...data, fromUserId: data.fromUserId ?? null }, include: mailInclude });
  const dto = toMailDto(row);
  // When running inside a transaction the caller pushes after commit.
  if (tx === prisma) toUser(dto.to.id, 'mail:new', dto);
  return dto;
}

export function pushMail(dto: MailDto) {
  toUser(dto.to.id, 'mail:new', dto);
}
