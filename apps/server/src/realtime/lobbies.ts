import { randomInt } from 'node:crypto';
import { GAME_MODES, LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, type LobbyState } from '@inbox/shared';
import { createMatch } from '../lib/matches';
import { getPublicUser } from '../lib/users';
import { friendIds } from '../lib/friends';
import { toUser } from './notify';

interface Lobby {
  code: string;
  hostId: string;
  members: string[];
}

/**
 * Private Office Battle rooms. A host creates a room and shares its code (or invites friends);
 * up to four players gather, and the host starts the fight, which then runs like any match.
 * Rooms live in memory in the process that runs the matches.
 */
export class Lobbies {
  private byCode = new Map<string, Lobby>();
  private byUser = new Map<string, Lobby>();
  readonly max = GAME_MODES.office.maxPlayers;

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < LOBBY_CODE_LENGTH; i++) code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
  }

  of(userId: string): Lobby | undefined {
    return this.byUser.get(userId);
  }

  private async state(lobby: Lobby): Promise<LobbyState> {
    const members = await Promise.all(lobby.members.map((id) => getPublicUser(id)));
    return { code: lobby.code, hostId: lobby.hostId, members: members.filter((m) => m !== null), max: this.max };
  }

  private async announce(lobby: Lobby) {
    const state = await this.state(lobby);
    for (const id of lobby.members) toUser(id, 'lobby:state', state);
  }

  async create(userId: string): Promise<string> {
    this.leave(userId);
    const lobby: Lobby = { code: this.newCode(), hostId: userId, members: [userId] };
    this.byCode.set(lobby.code, lobby);
    this.byUser.set(userId, lobby);
    await this.announce(lobby);
    return lobby.code;
  }

  async join(code: string, userId: string): Promise<string | null> {
    const lobby = this.byCode.get(code.toUpperCase());
    if (!lobby) return 'No existe una sala con ese código';
    if (lobby.members.includes(userId)) {
      await this.announce(lobby);
      return null;
    }
    if (lobby.members.length >= this.max) return `La sala está llena (${this.max} de ${this.max})`;
    this.leave(userId);
    lobby.members.push(userId);
    this.byUser.set(userId, lobby);
    await this.announce(lobby);
    return null;
  }

  leave(userId: string) {
    const lobby = this.byUser.get(userId);
    if (!lobby) return;
    this.byUser.delete(userId);
    lobby.members = lobby.members.filter((id) => id !== userId);
    toUser(userId, 'lobby:state', null);
    if (!lobby.members.length) {
      this.byCode.delete(lobby.code);
      return;
    }
    // The next one in line takes over as host.
    if (lobby.hostId === userId) lobby.hostId = lobby.members[0]!;
    void this.announce(lobby).catch(() => {});
  }

  /** The host starts the fight with everyone in the room. */
  async start(userId: string): Promise<string | null> {
    const lobby = this.byUser.get(userId);
    if (!lobby) return 'No estás en una sala';
    if (lobby.hostId !== userId) return 'Solo quien creó la sala puede empezar';
    if (lobby.members.length < 2) return 'Hacen falta al menos 2 jugadores';
    const members = [...lobby.members];
    this.byCode.delete(lobby.code);
    for (const id of members) this.byUser.delete(id);
    const matchId = await createMatch('office', members);
    for (const id of members) {
      toUser(id, 'lobby:state', null);
      toUser(id, 'lobby:started', { matchId });
    }
    return null;
  }

  /** Sends a friend a notice with the room code. Only friends can be invited. */
  async invite(userId: string, friendId: string): Promise<void> {
    const lobby = this.byUser.get(userId);
    if (!lobby || lobby.members.includes(friendId)) return;
    if (!(await friendIds(userId)).includes(friendId)) return;
    const from = await getPublicUser(userId);
    if (from) toUser(friendId, 'lobby:invited', { code: lobby.code, from });
  }
}

export const lobbies = new Lobbies();
