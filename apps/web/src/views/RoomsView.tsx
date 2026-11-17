import { useEffect, useState, type FormEvent } from "react";
import {
  Copy,
  Crown,
  DoorOpen,
  LogOut,
  Send,
  Swords,
  Users,
} from "lucide-react";
import { LOBBY_CODE_LENGTH, type FriendsDto } from "@inbox/shared";
import { Bust, LevelBadge } from "../components/Bits";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

/** Private Office Battle rooms: create one, share the code, and the host starts a fight for 2 to 4. */
export function RoomsView() {
  const { me, lobby, toast, socialVersion } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [friends, setFriends] = useState<FriendsDto["friends"]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!lobby) return;
    api<FriendsDto>("/api/friends")
      .then((d) => setFriends(d.friends))
      .catch(() => setFriends([]));
  }, [lobby?.code, socialVersion]);

  if (!me) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) toast({ title: r.error ?? "Algo salió mal", tone: "error" });
    } catch {
      toast({ title: "Sin conexión con el servidor", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(() => getSocket().emitWithAck("lobby:create"));
  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== LOBBY_CODE_LENGTH) return;
    void run(() => getSocket().emitWithAck("lobby:join", { code: c }));
  };

  if (!lobby) {
    return (
      <div className="page rooms">
        <header className="page-head">
          <h2>
            <DoorOpen size={22} /> Salas de batalla
          </h2>
          <p className="muted">
            Arma una pelea privada de 2 a 4 jugadores en la oficina. Todos
            contra todos: gana el último en pie.
          </p>
        </header>
        <div className="rooms-start">
          <section className="rooms-card">
            <h3>Crear una sala</h3>
            <p className="muted">
              Te damos un código para compartir. Tú decides cuándo empieza la
              pelea.
            </p>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void create()}
            >
              <DoorOpen size={16} /> Crear sala
            </button>
          </section>
          <section className="rooms-card">
            <h3>Unirme con un código</h3>
            <p className="muted">Pídele el código a quien creó la sala.</p>
            <form className="rooms-join" onSubmit={join}>
              <input
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                placeholder="ABC23"
                maxLength={LOBBY_CODE_LENGTH}
                aria-label="Código de la sala"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                className="btn btn-primary"
                disabled={busy || code.trim().length !== LOBBY_CODE_LENGTH}
              >
                Unirme
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  const isHost = lobby.hostId === me.id;
  const memberIds = new Set(lobby.members.map((m) => m.id));
  const online = friends.filter((f) => f.online && !memberIds.has(f.user.id));
  const full = lobby.members.length >= lobby.max;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      toast({ title: "Código copiado", tone: "success" });
    } catch {
      toast({ title: `El código es ${lobby.code}` });
    }
  };
  const invite = (userId: string, name: string) => {
    getSocket().emit("lobby:invite", { userId });
    setInvited((s) => new Set(s).add(userId));
    toast({ title: `Invitación enviada a ${name}`, tone: "success" });
  };

  return (
    <div className="page rooms">
      <header className="page-head">
        <h2>
          <DoorOpen size={22} /> Sala de batalla
        </h2>
        <p className="muted">
          {lobby.members.length} de {lobby.max} jugadores ·{" "}
          {isHost ? "Tú eres el anfitrión" : "El anfitrión empieza la pelea"}
        </p>
      </header>

      <div className="rooms-code">
        <span className="muted">Código de la sala</span>
        <strong data-testid="lobby-code">{lobby.code}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => void copy()}>
          <Copy size={14} /> Copiar
        </button>
      </div>

      <ul className="rooms-members">
        {lobby.members.map((m) => (
          <li key={m.id} className={m.id === me.id ? "me" : ""}>
            <Bust user={m} size={56} />
            <div>
              <strong>
                {m.username}{" "}
                {m.id === lobby.hostId && (
                  <Crown size={14} className="host" aria-label="Anfitrión" />
                )}
              </strong>
              <LevelBadge level={m.level} />
            </div>
          </li>
        ))}
        {Array.from({ length: lobby.max - lobby.members.length }, (_, i) => (
          <li key={`empty-${i}`} className="empty">
            <Users size={20} />
            <span>Lugar libre</span>
          </li>
        ))}
      </ul>

      <div className="rooms-actions">
        {isHost ? (
          <button
            className="btn btn-primary"
            disabled={busy || lobby.members.length < 2}
            onClick={() =>
              void run(() => getSocket().emitWithAck("lobby:start"))
            }
          >
            <Swords size={16} />{" "}
            {lobby.members.length < 2
              ? "Esperando jugadores…"
              : "Empezar pelea"}
          </button>
        ) : (
          <span className="muted">Esperando a que el anfitrión empiece…</span>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => getSocket().emit("lobby:leave")}
        >
          <LogOut size={16} /> Salir
        </button>
      </div>

      {!full && (
        <section className="rooms-invite">
          <h3>Invitar contactos en línea</h3>
          {online.length === 0 ? (
            <p className="muted">
              Ninguno de tus contactos está en línea. Comparte el código para
              que entren.
            </p>
          ) : (
            <ul>
              {online.map((f) => (
                <li key={f.user.id}>
                  <Bust user={f.user} size={32} />
                  <span>{f.user.username}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={invited.has(f.user.id)}
                    onClick={() => invite(f.user.id, f.user.username)}
                  >
                    <Send size={14} />{" "}
                    {invited.has(f.user.id) ? "Invitado" : "Invitar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
