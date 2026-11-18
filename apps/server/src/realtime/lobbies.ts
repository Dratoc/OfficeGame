import { randomInt } from 'node:crypto';
import { GAME_MODES, LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, type LobbyModeId, type LobbyState } from '@inbox/shared';
import { createMatch } from '../lib/matches';
import { getPublicUser } from '../lib/users';
import { friendIds } from '../lib/friends';
import { toUser } from './notify';

interface Lobby {
  code: string;
  hostId: string;
  members: string[];
  mode: LobbyModeId;
}

/**
 * Private rooms for Office Battle, Chair Race or the cooperative A Toda Máquina. A host creates a room and shares its code (or
 * invites friends); up to four players gather, the host picks the mode and starts the match,
 * which then runs like any other.
 * Rooms live in memory in the process that runs the matches.
 */
export class Lobbies {
  private byCode = new Map<string, Lobby>();
  private byUser = new Map<string, Lobby>();
  readonly max = Math.min(GAME_MODES.office.maxPlayers, GAME_MODES.chairs.maxPlayers);

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
    return { code: lobby.code, mode: lobby.mode, hostId: lobby.hostId, members: members.filter((m) => m !== null), max: this.max };
  }

  private async announce(lobby: Lobby) {
    const state = await this.state(lobby);
    for (const id of lobby.members) toUser(id, 'lobby:state', state);
  }

  async create(userId: string, mode: LobbyModeId = 'office'): Promise<string> {
    this.leave(userId);
    const lobby: Lobby = { code: this.newCode(), hostId: userId, members: [userId], mode };
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

  /** The host changes what the room will play. */
  async setMode(userId: string, mode: LobbyModeId): Promise<void> {
    const lobby = this.byUser.get(userId);
    if (!lobby || lobby.hostId !== userId || lobby.mode === mode) return;
    lobby.mode = mode;
    await this.announce(lobby);
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
    if (lobby.members.length < GAME_MODES[lobby.mode].minPlayers) return `Hacen falta al menos ${GAME_MODES[lobby.mode].minPlayers} jugadores`;
    const members = [...lobby.members];
    this.byCode.delete(lobby.code);
    for (const id of members) this.byUser.delete(id);
    const matchId = await createMatch(lobby.mode, members);
    for (const id of members) {
      toUser(id, 'lobby:state', null);
      toUser(id, 'lobby:started', { matchId, mode: lobby.mode });
    }
    return null;
  }

  /** A friend turned down an invitation: tell the host, if the room is still open. */
  async decline(userId: string, code: string): Promise<void> {
    const lobby = this.byCode.get(code.toUpperCase());
    if (!lobby || lobby.members.includes(userId)) return;
    const from = await getPublicUser(userId);
    if (from) toUser(lobby.hostId, 'lobby:declined', { code: lobby.code, from });
  }

  /** Sends a friend a notice with the room code. Only friends can be invited. */
  async invite(userId: string, friendId: string): Promise<void> {
    const lobby = this.byUser.get(userId);
    if (!lobby || lobby.members.includes(friendId)) return;
    if (!(await friendIds(userId)).includes(friendId)) return;
    const from = await getPublicUser(userId);
    if (from) toUser(friendId, 'lobby:invited', { code: lobby.code, from, mode: lobby.mode });
  }
}

export const lobbies = new Lobbies();
