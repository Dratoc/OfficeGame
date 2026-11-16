import type { PlayableModeId } from '@inbox/shared';
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
import { RankingView } from './views/RankingView';
import { ProfileView } from './views/ProfileView';
import { CalendarView } from './views/CalendarView';
import { ContactsView } from './views/ContactsView';
import { QuickMatch } from './components/QuickMatch';
import { useApp } from './lib/store';
import { getSocket } from './lib/socket';

function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const onMail = (mail: Parameters<ReturnType<typeof useApp.getState>['receiveMail']>[0]) => {
      const st = useApp.getState();
      st.receiveMail(mail);
      const from = mail.from?.username ?? 'Inbox Arena';
      st.toast({
        title: mail.kind === 'challenge' && mail.challenge?.status === 'pending' && mail.challenge.opponentId === mail.to.id ? `${from} te envió un desafío` : `Nuevo correo de ${from}`,
        body: mail.subject,
        tone: 'mail',
        action: { label: 'Abrir', run: () => useApp.getState().go({ kind: 'mail', folder: 'inbox', mailId: mail.id }) },
      });
      document.title = `(${useApp.getState().unread}) Inbox Arena`;
    };
    const onAccepted = ({ matchId }: { matchId: string }) => {
      const st = useApp.getState();
      if (st.view.kind === 'battle' && st.view.matchId === matchId) return;
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
          ? { title: '¡Carrera lista!', body: `Corres contra ${opponents!.map((o) => o.username).join(', ')}.`, tone: 'success' }
          : { title: '¡Rival encontrado!', body: `Te enfrentas a ${opponent.username}.`, tone: 'success' },
      );
      st.go({ kind: 'battle', matchId });
    };
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
  useEffect(() => {
    document.title = unread ? `(${unread}) Inbox Arena` : 'Inbox Arena';
  }, [unread]);

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
      </main>
      <ComposeDialog />
      <QuickMatch />
      <Toasts />
    </div>
  );
}
