import type { AvatarConfig } from './avatar';
import type { GameModeId } from './modes';
import type { MatchResult } from './progression';

/** Shapes returned by the HTTP API and socket events. */

export interface PublicUser {
  id: string;
  username: string;
  title: string;
  avatar: AvatarConfig;
  level: number;
}

export interface PlayerStatsDto {
  level: number;
  xp: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  rank: number | null;
}

export interface MeDto extends PublicUser {
  email: string;
  stats: PlayerStatsDto;
  inventory: string[];
}

export type MailKind = 'system' | 'challenge' | 'result' | 'social';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface ChallengeDto {
  id: string;
  mode: GameModeId;
  status: ChallengeStatus;
  challengerId: string;
  opponentId: string;
  expiresAt: string;
  matchId: string | null;
}

export interface MailDto {
  id: string;
  kind: MailKind;
  from: PublicUser | null;
  to: PublicUser;
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  challenge: ChallengeDto | null;
  matchId: string | null;
}

export interface ParticipantResultDto {
  user: PublicUser;
  result: MatchResult;
  correctWords: number;
  errors: number;
  correctChars: number;
  wpm: number;
  accuracy: number;
  xpGained: number;
  ratingBefore: number;
  ratingAfter: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: string[];
}

export interface MatchSummaryDto {
  id: string;
  mode: GameModeId;
  status: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  winnerId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  participants: ParticipantResultDto[];
  words: string[] | null;
}

export interface LeaderboardEntryDto {
  rank: number;
  user: PublicUser;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface HistoryEntryDto {
  matchId: string;
  mode: GameModeId;
  endedAt: string;
  result: MatchResult;
  opponent: PublicUser | null;
  correctWords: number;
  wpm: number;
  ratingDelta: number;
}

export interface FriendDto {
  user: PublicUser;
  online: boolean;
  since: string;
}

export interface FriendRequestDto {
  id: string;
  user: PublicUser;
  createdAt: string;
}

export interface FriendsDto {
  friends: FriendDto[];
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

/** Relationship between the viewer and a profile. */
export type FriendStatus = 'self' | 'none' | 'friends' | 'incoming' | 'outgoing';

export interface ProfileDto {
  friendStatus: FriendStatus;
  online: boolean;
  user: PublicUser;
  stats: PlayerStatsDto;
  history: HistoryEntryDto[];
  inventoryCount: number;
}
