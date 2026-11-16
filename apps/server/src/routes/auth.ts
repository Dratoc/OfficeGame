import type { FastifyInstance } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { HAIR_COLORS, ITEM_CATALOG, starterItemIds, type AvatarConfig } from '@inbox/shared';
import { prisma } from '../lib/db';
import { createSession, destroySession } from '../lib/auth';
import { badRequest, conflict, unauthorized } from '../lib/errors';
import { sendMail } from '../lib/mail';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo no válido').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'El nombre de usuario necesita al menos 3 caracteres')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[a-zA-Z0-9_.]+$/, 'Solo letras, números, punto y guion bajo'),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres').max(200),
});

const loginSchema = z.object({
  login: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

const TITLES = [
  'Caballero de Hojas de Cálculo',
  'Mago de Recursos Humanos',
  'Vikingo de Ventas',
  'Dragón de Contabilidad',
  'Paladín del Soporte Técnico',
  'Bardo de Marketing',
  'Escudero en Práctica',
];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const starterOf = (slot: string) => ITEM_CATALOG.filter((i) => i.slot === slot && i.unlockType === 'starter').map((i) => i.id);

/** Every new player starts with a different look, built only from starter items. */
function randomStarterAvatar(): AvatarConfig {
  return {
    skin: Math.floor(Math.random() * 5),
    hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
    equipped: {
      head: 'head_human',
      eyes: pick(starterOf('eyes')),
      hair: pick(starterOf('hair')),
      beard: Math.random() < 0.3 ? pick(starterOf('beard')) : null,
      outfit: pick(starterOf('outfit')),
      weapon: 'weapon_mug',
      pet: Math.random() < 0.3 ? 'pet_cat' : null,
    },
  };
}
export const WELCOME_BODY = `¡Bienvenido/a al reino de Inbox Arena!

Desde hoy formas parte de nuestro equipo de alto rendimiento (y de alto riesgo de dragones).

Cómo funciona:
• Los desafíos llegan como correos a tu bandeja de entrada.
• Para retar a un colega, pulsa "Nuevo desafío" y escribe su nombre de usuario.
• Hay cuatro modos: Typing Battle, Cálculo Express, Atajos de Teclado y Tarea Express. Duran entre 10 y 20 segundos.
• ¿Sin rival a mano? Pulsa "Partida rápida" y el sistema te encuentra uno.
• Ganar te da experiencia, sube tu nivel y desbloquea objetos para tu avatar en la Armería.

Recuerda: ninguna compra da ventajas. Aquí solo cuenta la velocidad de tus dedos.

Atentamente,
Sir Gerald
Jefe de Recursos Humanos y Dragones`;

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/register', strict, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos no válidos');
    const { email, username, password } = parsed.data;

    const taken = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: { equals: username, mode: 'insensitive' } }] },
      select: { email: true },
    });
    if (taken) throw conflict(taken.email === email ? 'Ese correo ya tiene una cuenta' : 'Ese nombre de usuario ya existe');

    const passwordHash = await hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        title: TITLES[Math.floor(Math.random() * TITLES.length)]!,
        stats: { create: {} },
        avatar: { create: { config: randomStarterAvatar() } },
        inventory: { create: starterItemIds().map((itemId) => ({ itemId, source: 'starter' })) },
      },
    });
    await sendMail({ toUserId: user.id, kind: 'system', subject: 'Bienvenido/a a Inbox Arena: tu primer día', body: WELCOME_BODY });
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/login', strict, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Completa usuario y contraseña');
    const login = parsed.data.login;
    const user = await prisma.user.findFirst({
      where: login.includes('@') ? { email: login.toLowerCase() } : { username: { equals: login, mode: 'insensitive' } },
    });
    if (!user || !(await verify(user.passwordHash, parsed.data.password))) throw unauthorized('Usuario o contraseña incorrectos');
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
}
