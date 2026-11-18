import type { LobbyState, PlayableModeId } from '@inbox/shared';
import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Toasts } from './components/Toasts';
import { ComposeDialog } from './components/ComposeDialog';
import { LogoMark } from './components/Logo';
import { AuthView } from './views/AuthView';
import { MailView } from './views/MailView';
import { BattleView } from './views/BattleView';
import { ResultLoader } from './views/ResultScene';
import { ArmoryView } from './views/ArmoryView';
import { ShopView } from './views/ShopView';
import { PracticeView } from './views/PracticeView';
import { RoomsView } from './views/RoomsView';
import { RankingView } from './views/RankingView';
import { ProfileView } from './views/ProfileView';
import { CalendarView } from './views/CalendarView';
import { ContactsView } from './views/ContactsView';
import { QuickMatch } from './components/QuickMatch';
import { useApp } from './lib/store';
import { getSocket } from './lib/socket';
import { backgroundAlert, installAlerts, setUnreadCount } from './lib/alerts';
import { AlertsPrompt } from './components/AlertsMenu';

function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const onMail = (mail: Parameters<ReturnType<typeof useApp.getState>['receiveMail']>[0]) => {
      const st = useApp.getState();
      st.receiveMail(mail);
      const from = mail.from?.username ?? 'Inbox Arena';
      const challenged = mail.kind === 'challenge' && mail.challenge?.status === 'pending' && mail.challenge.opponentId === mail.to.id;
      const open = () => useApp.getState().go({ kind: 'mail', folder: 'inbox', mailId: mail.id });
      st.toast({
        title: challenged ? `${from} te envió un desafío` : `Nuevo correo de ${from}`,
        body: mail.subject,
        tone: 'mail',
        action: { label: 'Abrir', run: open },
      });
      if (challenged) backgroundAlert({ title: `${from} te envió un desafío`, body: mail.subject, tag: `challenge:${mail.id}`, important: true, counted: true, onClick: open });
    };
    const onAccepted = ({ matchId }: { matchId: string }) => {
      const st = useApp.getState();
      if (st.view.kind === 'battle' && st.view.matchId === matchId) return;
      backgroundAlert({ title: '¡Aceptaron tu desafío!', body: 'Tu rival te espera en la sala de batalla.', tag: `accepted:${matchId}`, important: true, onClick: () => useApp.getState().go({ kind: 'battle', matchId }) });
      st.toast({ title: '¡Desafío aceptado!', body: 'Tu rival te espera en la sala de batalla.', tone: 'success', action: { label: 'Entrar a la sala', run: () => useApp.getState().go({ kind: 'battle', matchId }) } });
    };
    const onError = (err: Error) => {
      if (err.message === 'unauthorized') void useApp.getState().refreshMe();
    };
    const onQueue = (q: { searching: boolean; since: number | null; mode?: PlayableModeId; players?: number }) => useApp.setState((st) => ({ queue: { ...q, mode: q.mode ?? st.queue.mode } }));
    const onMatched = ({ matchId, opponent, opponents }: { matchId: string; opponent: { username: string }; opponents?: { username: string }[] }) => {
      const st = useApp.getState();
      useApp.setState({ queue: { searching: false, since: null } });
      const many = (opponents?.length ?? 1) > 1;
      st.toast(
        many
          ? { title: st.queue.mode === 'office' ? '¡Sala lista!' : '¡Carrera lista!', body: `${st.queue.mode === 'office' ? 'Peleas' : 'Corres'} contra ${opponents!.map((o) => o.username).join(', ')}.`, tone: 'success' }
          : { title: '¡Rival encontrado!', body: `Te enfrentas a ${opponent.username}.`, tone: 'success' },
      );
      st.go({ kind: 'battle', matchId });
      backgroundAlert({
        title: many ? (st.queue.mode === 'office' ? '¡Sala lista!' : '¡Carrera lista!') : '¡Rival encontrado!',
        body: `${many ? 'Contra' : 'Te enfrentas a'} ${(opponents ?? [opponent]).map((o) => o.username).join(', ')}. Vuelve al juego.`,
        tag: `match:${matchId}`,
        important: true,
      });
    };
    const onLobby = (lobby: LobbyState | null) => useApp.setState({ lobby });
    const onLobbyStarted = ({ matchId }: { matchId: string }) => {
      useApp.setState({ lobby: null });
      useApp.getState().toast({ title: '¡La pelea empieza!', body: 'Elige tus poderes y prepárate.', tone: 'success' });
      useApp.getState().go({ kind: 'battle', matchId });
      backgroundAlert({ title: '¡La pelea empieza!', body: 'Elige tus poderes y prepárate.', tag: `match:${matchId}`, important: true });
    };
    const joinRoom = (code: string) =>
      void getSocket()
        .emitWithAck('lobby:join', { code })
        .then((r) => (r.ok ? useApp.getState().go({ kind: 'rooms' }) : useApp.getState().toast({ title: r.error ?? 'No se pudo entrar', tone: 'error' })));
    const onInvited = ({ code, from }: { code: string; from: { username: string } }) => {
      backgroundAlert({ title: `${from.username} te invita a una sala de Office Battle`, body: `Código ${code}. Haz clic para unirte.`, tag: `invite:${code}`, important: true, onClick: () => joinRoom(code) });
      useApp.getState().toast({
        title: `${from.username} te invita a una sala de Office Battle`,
        body: `Código ${code}`,
        tone: 'success',
        action: { label: 'Unirme', run: () => joinRoom(code) },
      });
    };
    s.on('lobby:state', onLobby);
    s.on('lobby:started', onLobbyStarted);
    s.on('lobby:invited', onInvited);
    const onSocial = () => void useApp.getState().refreshSocial();
    const onPresence = () => useApp.setState((st) => ({ socialVersion: st.socialVersion + 1 }));
    s.on('queue:status', onQueue);
    s.on('queue:matched', onMatched);
    s.on('friends:changed', onSocial);
    s.on('presence:update', onPresence);
    void useApp.getState().refreshSocial();
    s.on('mail:new', onMail);
    s.on('challenge:accepted', onAccepted);
    s.on('connect_error', onError);
    if (s.disconnected) s.connect();
    return () => {
      s.off('lobby:state', onLobby);
      s.off('lobby:started', onLobbyStarted);
      s.off('lobby:invited', onInvited);
      s.off('queue:status', onQueue);
      s.off('queue:matched', onMatched);
      s.off('friends:changed', onSocial);
      s.off('presence:update', onPresence);
      s.off('mail:new', onMail);
      s.off('challenge:accepted', onAccepted);
      s.off('connect_error', onError);
    };
  }, [enabled]);
}

export function App() {
  const { me, authChecked, view, refreshMe, unread } = useApp();
  useEffect(() => void refreshMe(), [refreshMe]);
  useRealtime(!!me);
  useEffect(() => installAlerts(), []);
  useEffect(() => setUnreadCount(unread), [unread]);

  if (!authChecked) {
    return (
      <div className="splash">
        <LogoMark size={56} />
      </div>
    );
  }
  if (!me) return <AuthView />;

  return (
    <div className="shell">
      <TopBar />
      <Sidebar />
      <main className="content">
        {view.kind === 'mail' && <MailView folder={view.folder} mailId={view.mailId} />}
        {view.kind === 'battle' && <BattleView key={view.matchId} matchId={view.matchId} />}
        {view.kind === 'result' && <ResultLoader key={view.matchId} matchId={view.matchId} />}
        {view.kind === 'armory' && <ArmoryView />}
        {view.kind === 'ranking' && <RankingView />}
        {view.kind === 'profile' && <ProfileView key={view.username} username={view.username} />}
        {view.kind === 'calendar' && <CalendarView />}
        {view.kind === 'contacts' && <ContactsView />}
        {view.kind === 'shop' && <ShopView />}
        {view.kind === 'practice' && <PracticeView />}
        {view.kind === 'rooms' && <RoomsView />}
      </main>
      <ComposeDialog />
      <QuickMatch />
      <Toasts />
      <AlertsPrompt />
    </div>
  );
}
