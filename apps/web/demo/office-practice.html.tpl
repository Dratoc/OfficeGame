<title>Office Battle 3D</title>
<style>
  :root { color-scheme: dark !important; --bg: #151926; --panel: rgba(16, 19, 30, 0.86); --text: #f3f5fb; --muted: #aab3c5; --accent: #ffd95e; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  #stage { position: fixed; inset: 0; }
  #menu { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(10, 12, 20, 0.45); z-index: 5; padding-block: 16px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  #menu[hidden] { display: none; }
  .card { background: var(--panel); border: 1px solid rgba(255,255,255,0.15); border-radius: 18px; padding: 24px 24px 20px; max-width: 460px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
  h1 { margin: 0 0 4px; font-size: 28px; color: var(--accent); }
  p { margin: 0 0 14px; color: var(--muted); line-height: 1.45; font-size: 15px; }
  ul { margin: 0 0 16px; padding-left: 18px; color: var(--text); font-size: 14px; line-height: 1.7; }
  kbd { background: #fff; color: #1b1f2a; border-radius: 4px; padding: 0 5px; font-weight: 800; font-family: inherit; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  button { font: inherit; font-weight: 800; border: 0; border-radius: 12px; padding: 12px 18px; cursor: pointer; }
  #play { background: var(--accent); color: #1b1f2a; flex: 1; font-size: 17px; }
  #look { background: rgba(255,255,255,0.12); color: var(--text); }
  select { font: inherit; background: rgba(255,255,255,0.12); color: var(--text); border: 0; border-radius: 10px; padding: 10px; }
  label { font-size: 13px; color: var(--muted); display: flex; gap: 8px; align-items: center; }
</style>
<div id="stage"></div>
<div id="menu">
  <div class="card">
    <h1>Office Battle 3D</h1>
    <p>Prototipo de práctica: tu avatar contra el Gerente Dragón, en la oficina del gremio. 60 segundos, gana quien deje al otro K.O. o quien tenga más vida al final.</p>
    <ul>
      <li><kbd>WASD</kbd> o flechas: moverse</li>
      <li><kbd>J</kbd> o clic: atacar (10 de daño)</li>
      <li><kbd>K</kbd> o clic derecho (mantener): bloquear de frente. Quien te pega rebota y queda abierto.</li>
      <li><kbd>Espacio</kbd>: esquivar con voltereta (invulnerable, 0,9 s de espera)</li>
      <li>En el celular aparecen un joystick y botones.</li>
    </ul>
    <div class="row">
      <button id="play">¡A pelear!</button>
      <button id="look">Cambiar avatar</button>
    </div>
    <div class="row" style="margin-top:12px">
      <label>Rival <select id="skill"><option value="0.3">Tranquilo</option><option value="0.5" selected>Normal</option><option value="0.9">Difícil</option></select></label>
    </div>
  </div>
</div>
<script>/*BUNDLE*/</script>
