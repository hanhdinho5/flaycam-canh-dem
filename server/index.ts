// Server trung tâm: trang điều khiển <-> game <-> TikTok Live.
//   pnpm server            (rồi mở /control.html để nối live / bấm thử quà)
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import {
  CMDS, DEFAULT_MAP, WARP_MIN_DIAMONDS, WS_PORT, findGiftByIdOrName, GIFTS_1,
  type Cmd, type GiftMap, type ServerState,
} from '../shared/giftmap';

const FILE = new URL('./mapping.json', import.meta.url);
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

let map: GiftMap = { ...DEFAULT_MAP };
try { map = { ...map, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* lần đầu */ }
const state: ServerState = { type: 'state', map, mode: 'idle', username: '', connected: false };

const wss = new WebSocketServer({ port: WS_PORT });
wss.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') console.error(`\n⚠ Cổng ${WS_PORT} đang bị chiếm (có thể server cũ vẫn chạy). Tắt bằng: kill $(lsof -ti :${WS_PORT})\n`);
  else console.error(e);
  process.exit(1);
});
log(`WebSocket ws://localhost:${WS_PORT}`);

const broadcast = (o: unknown) => {
  const s = JSON.stringify(o);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
};
const pushState = () => { state.map = map; broadcast(state); };
const saveMap = () => fs.writeFileSync(FILE, JSON.stringify(map, null, 1));

function fire(cmd: Cmd, user?: string, gift?: string, count = 1) {
  broadcast({ type: 'command', cmd, user, gift, count });
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
    if (!cmd && diamonds >= WARP_MIN_DIAMONDS) cmd = 'warp';
    if (!cmd) { log(`(quà chưa gán: ${name} #${id}, ${diamonds}💎)`); return; }
    fire(cmd, user, name, cmd === 'warp' ? 1 : delta);
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
wss.on('connection', ws => {
  ws.send(JSON.stringify(state));
  ws.on('message', raw => {
    let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
    switch (m.type) {
      case 'fire': { // bấm quà thử từ trang điều khiển
        const g = GIFTS_1.find(x => x.name === m.gift);
        const cmd: Cmd | undefined = CMDS.includes(m.cmd) ? m.cmd : g ? map[g.name] : undefined;
        if (cmd) fire(cmd, 'điều khiển', m.gift, 1);
        break;
      }
      case 'setMap': if (m.map && typeof m.map === 'object') {
        const next: GiftMap = {};
        for (const [k, v] of Object.entries(m.map)) if (CMDS.includes(v as Cmd)) next[k] = v as Cmd;
        map = next; saveMap(); pushState();
      } break;
      case 'connect': if (typeof m.username === 'string' && m.username.trim()) startTikTok(m.username.trim().replace(/^@/, '')); break;
      case 'demo': startDemo(); break;
      case 'disconnect': stopAll().then(pushState); break;
    }
  });
});
