import type { PlayableModeId } from '@inbox/shared';
import { create } from 'zustand';
import type { MailDto, MeDto } from '@inbox/shared';
import { api } from './api';

export type Folder = 'inbox' | 'challenges' | 'sent';
export type View =
  | { kind: 'mail'; folder: Folder; mailId: string | null }
  | { kind: 'battle'; matchId: string }
  | { kind: 'result'; matchId: string }
  | { kind: 'armory' }
  | { kind: 'ranking' }
  | { kind: 'profile'; username: string }
  | { kind: 'calendar' }
  | { kind: 'contacts' }
  | { kind: 'shop' };

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: 'info' | 'success' | 'error' | 'mail';
  action?: { label: string; run: () => void };
}

interface State {
  me: MeDto | null;
  authChecked: boolean;
  view: View;
  mails: MailDto[];
  unread: number;
  search: string;
  composeOpen: boolean;
  composeTo: string;
  toasts: Toast[];
  /** Quick match search state, driven by the server. */
  queue: { searching: boolean; since: number | null; mode?: PlayableModeId; players?: number };
  friendRequests: number;
  /** Bumped whenever friends or presence change, so views can refetch. */
  socialVersion: number;
  refreshSocial: () => Promise<void>;
  setMe: (me: MeDto | null) => void;
  refreshMe: () => Promise<void>;
  go: (view: View) => void;
  loadMail: (folder?: Folder) => Promise<void>;
  receiveMail: (mail: MailDto) => void;
  markRead: (id: string) => void;
  setSearch: (s: string) => void;
  openCompose: (to?: string) => void;
  closeCompose: () => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let toastId = 1;

export const useApp = create<State>((set, get) => ({
  me: null,
  authChecked: false,
  view: { kind: 'mail', folder: 'inbox', mailId: null },
  mails: [],
  unread: 0,
  search: '',
  composeOpen: false,
  composeTo: '',
  toasts: [],
  queue: { searching: false, since: null },
  friendRequests: 0,
  socialVersion: 0,
  refreshSocial: async () => {
    const res = await api<{ incoming: unknown[] }>('/api/friends').catch(() => null);
    set({ friendRequests: res?.incoming.length ?? 0, socialVersion: get().socialVersion + 1 });
  },

  setMe: (me) => set({ me, authChecked: true }),
  refreshMe: async () => {
    try {
      set({ me: await api<MeDto>('/api/me'), authChecked: true });
    } catch {
      set({ me: null, authChecked: true });
    }
  },
  go: (view) => set({ view }),

  loadMail: async (folder) => {
    const f = folder ?? (get().view.kind === 'mail' ? (get().view as { folder: Folder }).folder : 'inbox');
    const res = await api<{ mails: MailDto[]; unread: number }>(`/api/mail?folder=${f}`);
    set({ mails: res.mails, unread: res.unread });
  },

  receiveMail: (mail) => {
    const { view, mails } = get();
    const folder = view.kind === 'mail' ? view.folder : null;
    const belongs = folder === 'inbox' || (folder === 'challenges' && mail.kind === 'challenge');
    set({ unread: get().unread + 1, mails: belongs && !mails.some((m) => m.id === mail.id) ? [mail, ...mails] : mails });
  },

  markRead: (id) => {
    const mail = get().mails.find((m) => m.id === id);
    if (!mail || mail.readAt || mail.to.id !== get().me?.id) return;
    set({ mails: get().mails.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)), unread: Math.max(0, get().unread - 1) });
    void api(`/api/mail/${id}/read`, { method: 'POST' }).catch(() => {});
  },

  setSearch: (search) => set({ search }),
  openCompose: (to = '') => set({ composeOpen: true, composeTo: to }),
  closeCompose: () => set({ composeOpen: false, composeTo: '' }),

  toast: (t) => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), 6000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
