import { useEffect, useState, type FormEvent } from "react";
import {
  Armchair,
  Castle,
  Copy,
  Crown,
  DoorOpen,
  Forklift,
  LogOut,
  Send,
  Skull,
  Swords,
  Users,
} from "lucide-react";
import { GAME_MODES, LOBBY_CODE_LENGTH, LOBBY_MODES, type FriendsDto, type LiveMatch, type LobbyModeId } from "@inbox/shared";
import { Bust, LevelBadge } from "../components/Bits";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

const MODE_TEXT: Record<LobbyModeId, { short: string; blurb: string; start: string; wait: string }> = {
  office: {
    short: "Pelea en la oficina",
    blurb: "Todos contra todos con poderes: gana el último en pie.",
    start: "Empezar pelea",
    wait: "El anfitrión empieza la pelea",
  },
  sales: {
    short: "Venta de maquinaria",
    blurb: "Cooperativo: atiendan clientes, timbren órdenes y entreguen la máquina correcta.",
    start: "Abrir el local",
    wait: "El anfitrión abre el local",
  },
  zombies: {
    short: "Zona Zombi",
    blurb: "Cooperativo: sobrevivan a las hordas con armas, autos y fortalezas. Fuego amigo activado.",
    start: "Empezar a sobrevivir",
    wait: "El anfitrión empieza la partida",
  },
  magic: {
    short: "Magic Frontiers",
    blurb: "1 contra 1: cada uno manda un ejército y gana quien conquiste las fortalezas.",
    start: "Empezar la conquista",
    wait: "El anfitrión empieza la conquista",
  },
  chairs: {
    short: "Carrera de sillas",
    blurb: "3 vueltas en silla de oficina: dispara hacia adelante y acelera con cada acierto.",
    start: "Empezar carrera",
    wait: "El anfitrión empieza la carrera",
  },
};

function ModeIcon({ mode, size = 16 }: { mode: LobbyModeId; size?: number }) {
  return mode === "chairs" ? <Armchair size={size} /> : mode === "sales" ? <Forklift size={size} /> : mode === "zombies" ? <Skull size={size} /> : mode === "magic" ? <Castle size={size} /> : <Swords size={size} />;
}

/** Choice between the modes a private room can play. */
function ModeChoice({ value, onChange, disabled }: { value: LobbyModeId; onChange: (m: LobbyModeId) => void; disabled?: boolean }) {
  return (
    <div className="rooms-modes" role="radiogroup" aria-label="Modo de juego">
      {LOBBY_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          className={`rooms-mode ${value === m ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onChange(m)}
        >
          <ModeIcon mode={m} size={18} />
          <span>
            <strong>{GAME_MODES[m].name}</strong>
            <small>{MODE_TEXT[m].blurb}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Zona Zombi matches being played right now: anyone can start one or jump into one. */
function PublicZombies() {
  const { go, toast } = useApp();
  const [live, setLive] = useState<LiveMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getSocket()
        .emitWithAck("zombies:list")
        .then((l) => alive && setLive(l))
        .catch(() => alive && setLive([]));
    void load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const r = await getSocket().emitWithAck("zombies:start");
      if (r.ok && r.matchId) go({ kind: "battle", matchId: r.matchId });
      else toast({ title: r.error ?? "No se pudo crear la partida", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const join = async (matchId: string) => {
    setBusy(true);
    try {
      const r = await getSocket().emitWithAck("zombies:join", { matchId });
      if (r.ok) go({ kind: "battle", matchId });
      else toast({ title: r.error ?? "No se pudo entrar", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rooms-card rooms-live">
      <h3>
        <Skull size={18} /> Zona Zombi: partidas públicas
      </h3>
      <p className="muted">
        Cualquiera puede entrar a una partida mientras no hayan caído todos. Cada
        jugador que entra trae más zombis y más duros. Fuego amigo activado.
      </p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>
        <Skull size={16} /> Empezar una partida pública
      </button>
      {live === null ? (
        <p className="muted small">Buscando partidas…</p>
      ) : live.length === 0 ? (
        <p className="muted small">No hay partidas en curso. Empieza una y otros podrán unirse.</p>
      ) : (
        <ul className="rooms-live-list">
          {live.map((m) => (
            <li key={m.matchId}>
              <div className="rooms-live-who">
                {m.players.slice(0, 4).map((p) => (
                  <Bust key={p.id} user={p} size={30} />
                ))}
              </div>
              <span>
                <strong>{m.players.map((p) => p.username).join(", ")}</strong>
                <small>
                  {m.wave > 0 ? `Oleada ${m.wave}` : "Preparándose"} · {m.players.length} de {m.max} ·{" "}
                  {Math.floor(m.seconds / 60)} min
                </small>
              </span>
              <button className="btn btn-ghost btn-sm" disabled={busy || m.players.length >= m.max} onClick={() => void join(m.matchId)}>
                {m.players.length >= m.max ? "Llena" : "Unirme"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Private rooms: create one, pick Office Battle, Chair Race or A Toda Máquina, share the code, and the host starts it for 2 to 4. */
export function RoomsView() {
  const { me, lobby, toast, socialVersion } = useApp();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<LobbyModeId>("office");
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

  const create = () => run(() => getSocket().emitWithAck("lobby:create", { mode }));
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
            Arma una partida privada de hasta 4 jugadores: una pelea en la
            oficina, una carrera de sillas, un turno cooperativo vendiendo
            maquinaria, una partida de Zona Zombi o una conquista 1 contra 1
            de Magic Frontiers.
          </p>
        </header>
        <PublicZombies />
        <div className="rooms-start">
          <section className="rooms-card">
            <h3>Crear una sala</h3>
            <p className="muted">
              Elige el modo y te damos un código para compartir. Tú decides
              cuándo empieza.
            </p>
            <ModeChoice value={mode} onChange={setMode} disabled={busy} />
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
          {GAME_MODES[lobby.mode].name} · {lobby.members.length} de {lobby.max}{" "}
          jugadores ·{" "}
          {isHost ? "Tú eres el anfitrión" : MODE_TEXT[lobby.mode].wait}
        </p>
      </header>

      {isHost ? (
        <ModeChoice
          value={lobby.mode}
          onChange={(m) => getSocket().emit("lobby:mode", { mode: m })}
        />
      ) : (
        <div className="rooms-mode-current">
          <ModeIcon mode={lobby.mode} size={18} />
          <span>
            <strong>{GAME_MODES[lobby.mode].name}</strong>
            <small>{MODE_TEXT[lobby.mode].blurb}</small>
          </span>
        </div>
      )}

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
            disabled={busy || lobby.members.length < GAME_MODES[lobby.mode].minPlayers || lobby.members.length > GAME_MODES[lobby.mode].maxPlayers}
            onClick={() =>
              void run(() => getSocket().emitWithAck("lobby:start"))
            }
          >
            <ModeIcon mode={lobby.mode} />{" "}
            {lobby.members.length < GAME_MODES[lobby.mode].minPlayers
              ? "Esperando jugadores…"
              : lobby.members.length > GAME_MODES[lobby.mode].maxPlayers
              ? `Es para ${GAME_MODES[lobby.mode].maxPlayers} jugadores`
              : MODE_TEXT[lobby.mode].start}
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
