/**
 * Background alerts: lets a player who keeps Inbox Arena open in a tab without focus
 * find out about room invitations, challenges and matches that are ready.
 *
 * While the tab is not focused an alert:
 *  - shows a native browser notification (if the player allowed it),
 *  - blinks the tab title and puts a red badge on the favicon,
 *  - plays a short chime (if the sound is on).
 * Everything clears as soon as the player comes back to the tab.
 */
import { create } from 'zustand';

const PREFS_KEY = 'inbox-arena:alerts';
const BASE_TITLE = 'Inbox Arena';

interface Prefs {
  /** The player wants native notifications (the browser permission is separate). */
  notify: boolean;
  sound: boolean;
  /** The player already answered the "turn on alerts" suggestion. */
  asked: boolean;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { notify: true, sound: true, asked: false };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback;
  } catch {
    return fallback;
  }
}

export type Permission = NotificationPermission | 'unsupported';

const currentPermission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

interface AlertsState extends Prefs {
  permission: Permission;
  /** Alerts received while the tab was not focused. */
  pending: number;
}

export const useAlerts = create<AlertsState>(() => ({ ...loadPrefs(), permission: currentPermission(), pending: 0 }));

function savePrefs() {
  const { notify, sound, asked } = useAlerts.getState();
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ notify, sound, asked }));
  } catch {
    /* private mode: prefs just last for this visit */
  }
}

export function setPrefs(p: Partial<Prefs>) {
  useAlerts.setState(p);
  savePrefs();
}

/** Asks the browser for permission. Must run inside a click (browsers ignore it otherwise). */
export async function enableNotifications(): Promise<Permission> {
  unlockAudio();
  setPrefs({ notify: true, asked: true });
  if (typeof Notification === 'undefined') return 'unsupported';
  let permission: Permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  useAlerts.setState({ permission });
  return permission;
}

/** The player is not looking at the game: another tab, another window or another app. */
export const isAway = () => document.visibilityState === 'hidden' || !document.hasFocus();

// ---------- sound ----------

let ctx: AudioContext | null = null;

/** Browsers only let a page play sound after a click, so the context is created on the first one. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function chime() {
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const notes = [784, 1047, 1319];
  notes.forEach((freq, i) => {
    const t = ctx!.currentTime + i * 0.11;
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}

// ---------- title and favicon ----------

let unread = 0;
let headline: string | null = null;
let blinkTimer: ReturnType<typeof setInterval> | null = null;
let blinkOn = false;

const FAVICON_BODY =
  '<rect x="4" y="12" width="56" height="40" rx="8" fill="#0f5c63"/><path d="M6 16 L32 36 L58 16" fill="none" stroke="#fbf7ef" stroke-width="4" stroke-linejoin="round"/><path d="M32 30 L44 34 L44 44 Q44 54 32 58 Q20 54 20 44 L20 34 Z" fill="#c8962e" stroke="#fbf7ef" stroke-width="3"/>';

/** The favicon with a red badge, as a data URL. */
export function badgeFavicon(count: number): string {
  const label = count > 9 ? '9+' : String(count);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${FAVICON_BODY}` +
    `<circle cx="48" cy="18" r="16" fill="#d93025" stroke="#fff" stroke-width="3"/>` +
    `<text x="48" y="25" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${label.length > 1 ? 17 : 21}" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  if (link.href !== href) link.href = href;
}

function render() {
  const { pending } = useAlerts.getState();
  const count = unread + pending;
  const normal = count ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
  document.title = headline && blinkOn ? `🔔 ${headline}` : normal;
  setFavicon(count ? badgeFavicon(count) : '/favicon.svg');
}

/** Called with the number of unread mails so the title and favicon stay in sync. */
export function setUnreadCount(n: number) {
  unread = n;
  render();
}

function startBlink() {
  if (blinkTimer) return;
  blinkOn = true;
  blinkTimer = setInterval(() => {
    blinkOn = !blinkOn;
    render();
  }, 1200);
}

function clearAway() {
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = null;
  blinkOn = false;
  headline = null;
  useAlerts.setState({ pending: 0 });
  for (const n of shown.splice(0)) n.close();
  render();
}

const shown: Notification[] = [];

export interface BackgroundAlert {
  title: string;
  body?: string;
  /** Alerts with the same tag replace each other instead of piling up. */
  tag: string;
  /** What to do when the player clicks the notification (the tab gets focus first). */
  onClick?: () => void;
  /** Keep the notification on screen until the player acts (invitations, challenges). */
  important?: boolean;
  /** The alert is a mail that already shows in the unread count, so it must not be counted twice. */
  counted?: boolean;
}

/**
 * Raises an alert if the player is away from the tab. When they are looking at the game,
 * the in-app toast is enough and this does nothing.
 */
export function backgroundAlert(a: BackgroundAlert, force = false) {
  if (!force && !isAway()) return;
  const st = useAlerts.getState();
  if (!force) {
    if (!a.counted) useAlerts.setState({ pending: st.pending + 1 });
    headline = a.title;
    startBlink();
    render();
  }
  if (st.sound) chime();
  if (st.notify && currentPermission() === 'granted') {
    try {
      const n = new Notification(a.title, {
        body: a.body,
        tag: a.tag,
        icon: '/favicon.svg',
        requireInteraction: !!a.important,
      });
      n.onclick = () => {
        window.focus();
        n.close();
        a.onClick?.();
      };
      shown.push(n);
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  }
}

/** Shows a sample alert right away, so the player can check that it works. */
export function testAlert() {
  unlockAudio();
  backgroundAlert({ title: 'Así se verán tus avisos', body: 'Te avisaremos de invitaciones y desafíos aunque estés en otra pestaña.', tag: 'test' }, true);
}

let installed = false;

/** Wires the page listeners once: clears alerts on return and unlocks sound on the first click. */
export function installAlerts() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const back = () => {
    if (!isAway()) clearAway();
  };
  window.addEventListener('focus', back);
  document.addEventListener('visibilitychange', back);
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  // The permission can change from the browser's own site settings.
  const refresh = () => useAlerts.setState({ permission: currentPermission() });
  window.addEventListener('focus', refresh);
  render();
}
