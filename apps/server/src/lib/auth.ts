import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db';
import { unauthorized } from './errors';

export const SESSION_COOKIE = 'ia_session';
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    expires: expiresAt,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves a raw cookie token to a user id, or null. Shared by HTTP and WebSocket auth. */
export async function userIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.userId;
}

export async function requireUser(req: FastifyRequest): Promise<string> {
  const userId = await userIdFromToken(req.cookies[SESSION_COOKIE]);
  if (!userId) throw unauthorized();
  return userId;
}

/** Minimal cookie header parser for the Socket.IO handshake. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
