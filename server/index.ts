// Server trung tâm: trang điều khiển <-> game <-> TikTok Live.
//   pnpm server            (rồi mở /control.html để nối live / bấm thử quà)
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { musicFiles, serveMusic } from './music';
import { SCENES } from '../src/scenes';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import {
  CMDS, DEFAULT_MAP, SCENE_MIN_DIAMONDS, WS_PORT, findGiftByIdOrName, GIFTS_1,
  type Cmd, type GiftMap, type ServerState,
} from '../shared/giftmap';

const FILE = new URL('./mapping.json', import.meta.url);
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

let map: GiftMap = { ...DEFAULT_MAP };
try { map = { ...map, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* lần đầu */ }
const tracks = musicFiles();
const state: ServerState = {
  type: 'state', map, mode: 'idle', username: '', connected: false, scene: 0,
  tracks, track: tracks[0] ?? null,
};

const PORT = Number(process.env.WS_PORT) || WS_PORT;   // đổi cổng: WS_PORT=8800 pnpm server (và thêm ?ws=8800 vào link trang)
const http = createServer(serveMusic);
const wss = new WebSocketServer({ server: http });
wss.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') console.error(`\n⚠ Cổng ${PORT} đang bị chiếm (có thể server cũ vẫn chạy). Tắt bằng: kill $(lsof -ti :${PORT})\n`);
  else console.error(e);
  process.exit(1);
});
http.listen(PORT);
log(`WebSocket ws://localhost:${PORT}`);

const broadcast = (o: unknown) => {
  const s = JSON.stringify(o);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
};
const pushState = () => { state.map = map; broadcast(state); };
const saveMap = () => fs.writeFileSync(FILE, JSON.stringify(map, null, 1));

function fire(cmd: Cmd, user?: string, gift?: string, count = 1, index?: number) {
  broadcast({ type: 'command', cmd, user, gift, count, index });
  log(`→ ${cmd} ×${count} (${user ?? '?'} · ${gift ?? '-'})`);
}

// ───────── TikTok ─────────
let conn: TikTokLiveConnection | null = null;
let wanted = false;
const streak = new Map<string, number>();

async function startTikTok(username: string) {
  await stopAll();
  wanted = true; state.mode = 'tiktok'; state.username = username; state.connected = false; pushState();
  const c = new TikTokLiveConnection(username, { signApiKey: process.env.EULER_API_KEY } as any);
  conn = c;
  c.on(WebcastEvent.GIFT, (d: any) => {
    const id: number | undefined = d.giftId ?? d.gift?.id;
    const name: string = (d.giftName ?? d.gift?.name ?? '').trim();
    const user: string = d.user?.uniqueId ?? d.uniqueId ?? '';
    const diamonds: number = d.diamondCount ?? d.gift?.diamondCount ?? 0;
    const rc: number = d.repeatCount ?? 1, key = `${user}|${name}`, done = streak.get(key) ?? 0;
    const delta = Math.max(1, rc - done);
    if (d.repeatEnd) streak.delete(key); else streak.set(key, rc);
    const known = findGiftByIdOrName(id, name);
    let cmd: Cmd | undefined = known ? map[known.name] : map[name];
    if (!cmd && diamonds >= SCENE_MIN_DIAMONDS) cmd = 'scene';   // quà từ 30 xu -> đổi không gian
    if (!cmd) { log(`(quà chưa gán: ${name} #${id}, ${diamonds}💎)`); return; }
    if (cmd === 'scene' && done > 0) return;   // combo cùng một quà chỉ đổi không gian 1 lần
    fire(cmd, user, name, cmd === 'warp' || cmd === 'scene' ? 1 : delta);
  });
  c.on(ControlEvent.DISCONNECTED, () => {
    state.connected = false; pushState();
    if (wanted && conn === c) { log('Mất kết nối, thử lại sau 10s'); setTimeout(() => { if (wanted && conn === c) c.connect().catch(() => {}); }, 10000); }
  });
  const go = () => c.connect().then(() => { state.connected = true; pushState(); log('Đã nối live', username); })
    .catch(e => { log('Lỗi nối live:', e?.message ?? e); if (wanted && conn === c) setTimeout(go, 15000); });
  go();
}

let demoTimer: NodeJS.Timeout | null = null;
async function stopAll() {
  wanted = false;
  if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
  if (conn) { try { conn.disconnect(); } catch { /* bỏ qua */ } conn = null; }
  state.mode = 'idle'; state.connected = false; state.username = '';
}
function startDemo() {
  stopAll().then(() => {
    state.mode = 'demo'; state.connected = true; pushState();
    const loop = () => { if (state.mode !== 'demo') return; fire(CMDS[Math.floor(Math.random() * 6)], 'demo'); demoTimer = setTimeout(loop, 6000 + Math.random() * 8000); };
    demoTimer = setTimeout(loop, 3000);
  });
}

// ───────── WebSocket ─────────
const previews = new Set<WebSocket>();
let live: WebSocket | undefined;
wss.on('connection', ws => {
  let role: string | undefined;
  ws.on('close', () => {
    previews.delete(ws);
    if (live === ws) live = undefined;
  });
  state.tracks = musicFiles();
  if (state.track && !state.tracks.includes(state.track)) {
    state.track = null;
    pushState();
  }
  ws.send(JSON.stringify(state));
  ws.on('message', raw => {
    let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
    switch (m.type) {
      case 'hello':
        if (role) break;
        role = m.role;
        if (role === 'preview') previews.add(ws);
        if (role === 'game' && !live) live = ws;
        break;
      case 'camera': {
        if (role !== 'game') break;
        live ??= ws;
        if (live !== ws || !Number.isInteger(m.scene) || !SCENES[m.scene]
          || !Array.isArray(m.position) || m.position.length !== 3
          || !Array.isArray(m.rotation) || m.rotation.length !== 4
          || ![...m.position, ...m.rotation, m.fov, m.ground, m.time].every(Number.isFinite)) break;
        if (state.scene !== m.scene) { state.scene = m.scene; pushState(); }
        const frame = JSON.stringify(m);
        for (const preview of previews) {
          if (preview.readyState === WebSocket.OPEN && preview.bufferedAmount === 0) preview.send(frame);
        }
        break;
      }
      case 'refreshMusic':
      case 'setMusic': {
        state.tracks = musicFiles();
        if (state.track && !state.tracks.includes(state.track)) state.track = null;
        if (m.type === 'setMusic' && (m.track === null || state.tracks.includes(m.track))) state.track = m.track;
        pushState();
        break;
      }
      case 'fire': { // bấm quà thử từ trang điều khiển
        const g = GIFTS_1.find(x => x.name === m.gift);
        const cmd: Cmd | undefined = CMDS.includes(m.cmd) ? m.cmd : g ? map[g.name] : undefined;
        if (cmd) fire(cmd, 'điều khiển', m.gift, 1, typeof m.index === 'number' ? m.index : undefined);
        break;
      }
      case 'setMap': if (m.map && typeof m.map === 'object') {
        const next: GiftMap = {};
        for (const [k, v] of Object.entries(m.map)) if (CMDS.includes(v as Cmd)) next[k] = v as Cmd;
        map = next; saveMap(); pushState();
      } break;
      case 'sceneChanged': if (ws === live && typeof m.index === 'number') { state.scene = m.index; pushState(); } break;
      case 'connect': if (typeof m.username === 'string' && m.username.trim()) startTikTok(m.username.trim().replace(/^@/, '')); break;
      case 'demo': startDemo(); break;
      case 'disconnect': stopAll().then(pushState); break;
    }
  });
});
