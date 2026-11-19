import { connectServer } from './core/net';
import { ACTIONS, CMDS, GIFTS_1, GIFTS_30, DEFAULT_MAP, type Cmd, type GiftMap } from '../shared/giftmap';
import { SCENES } from './scenes';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let map: GiftMap = { ...DEFAULT_MAP };
let online = false;
let curScene = 0;

const conn = connectServer('control', m => {
  if (m.type === 'state') {
    map = m.map; curScene = m.scene ?? 0; render(); renderSim();
    $('modeTxt').textContent = m.mode === 'tiktok' ? `TikTok @${m.username} — ${m.connected ? 'đã nối' : 'đang nối...'}` : m.mode === 'demo' ? 'Chế độ demo' : 'Chưa nối live';
  } else if (m.type === 'command') flash(`${m.user ?? ''} ${ACTIONS[m.cmd as Cmd].emoji} ${ACTIONS[m.cmd as Cmd].label}`);
}, ok => { online = ok; $('wsDot').className = 'dot' + (ok ? ' on' : ''); $('wsTxt').textContent = ok ? 'Đã nối server' : 'Chưa nối server (chạy: pnpm server)'; });

function flash(t: string) {
  const f = $('flash'); f.textContent = t; f.classList.add('show');
  clearTimeout((flash as any).t); (flash as any).t = setTimeout(() => f.classList.remove('show'), 1600);
}

$('cmds').innerHTML = CMDS.map(c => `<button data-c="${c}">${ACTIONS[c].emoji}<br>${ACTIONS[c].label}</button>`).join('');
$('cmds').onclick = e => { const b = (e.target as HTMLElement).closest('button'); if (b) conn.send({ type: 'fire', cmd: b.dataset.c }); };

$<HTMLButtonElement>('btnConnect').onclick = () => { const u = $<HTMLInputElement>('user').value.trim(); if (u) { localStorage.setItem('tt_user', u); conn.send({ type: 'connect', username: u }); } };
$('btnDemo').onclick = () => conn.send({ type: 'demo' });
$('btnStop').onclick = () => conn.send({ type: 'disconnect' });
$<HTMLInputElement>('user').value = localStorage.getItem('tt_user') ?? '';
($('liveLink') as HTMLAnchorElement).href = location.origin + '/';

const opts = (cur?: Cmd) => `<option value="">— không gán —</option>` + CMDS.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${ACTIONS[c].emoji} ${ACTIONS[c].label}</option>`).join('');

function render() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase(), only = $<HTMLInputElement>('onlyAssigned').checked;
  const list = GIFTS_1.filter(g => (!q || g.name.toLowerCase().includes(q)) && (!only || map[g.name]));
  $('count').textContent = `${list.length}/${GIFTS_1.length} quà · đã gán ${Object.keys(map).length}`;
  // sắp xếp: quà đã gán lên đầu
  list.sort((a, b) => Number(!!map[b.name]) - Number(!!map[a.name]) || a.name.localeCompare(b.name));
  $('grid').innerHTML = list.map(g => `<div class="gift${map[g.name] ? ' assigned' : ''}">
    <img src="${g.imageUrl}" data-g="${g.name.replace(/"/g, '&quot;')}" loading="lazy" title="Bấm để bay thử">
    <div class="n">${g.name}</div>
    <select data-g="${g.name.replace(/"/g, '&quot;')}">${opts(map[g.name])}</select></div>`).join('');
}
$('grid').onclick = e => {
  const t = e.target as HTMLElement;
  if (t.tagName === 'IMG') {
    const g = t.dataset.g!, cmd = map[g];
    if (cmd) conn.send({ type: 'fire', gift: g }); else flash('Quà này chưa gán hướng bay');
  }
};
$('grid').onchange = e => {
  const t = e.target as HTMLSelectElement;
  if (t.tagName !== 'SELECT') return;
  const next = { ...map }; const g = t.dataset.g!;
  if (t.value) next[g] = t.value as Cmd; else delete next[g];
  map = next; conn.send({ type: 'setMap', map: next }); render();
};
$('q').oninput = render; $('onlyAssigned').onchange = render;
function renderSim() {
  $('simGifts').innerHTML = Object.entries(map).map(([name, cmd]) => {
    const g = GIFTS_1.find(x => x.name === name);
    return `<button class="simBtn" data-gift="${name.replace(/"/g, '&quot;')}">${g ? `<img src="${g.imageUrl}">` : ''}<span>${name}<small>${ACTIONS[cmd].emoji} ${ACTIONS[cmd].label}</small></span></button>`;
  }).join('') || '<span class="hint">Chưa gán quà nào (chọn hướng ở danh sách bên dưới).</span>';
  $('simBig').innerHTML = GIFTS_30.map(g => `<button class="simBtn" data-big="${g.name.replace(/"/g, '&quot;')}"><img src="${g.imageUrl}"><span>${g.name}<small>${g.diamonds} xu · ${ACTIONS.scene.emoji} ${ACTIONS.scene.label}</small></span></button>`).join('');
  $('sceneNow').textContent = `${SCENES[curScene]?.emoji ?? ''} ${SCENES[curScene]?.name ?? ''}`;
  $('simScenes').innerHTML = SCENES.map((sc, i) => `<button class="simBtn${i === curScene ? ' on' : ''}" data-scene="${i}"><span>${sc.emoji} ${i + 1}. ${sc.name}</span></button>`).join('');
}
$('simGifts').onclick = e => { const b = (e.target as HTMLElement).closest('button'); if (b) conn.send({ type: 'fire', gift: b.dataset.gift }); };
$('simBig').onclick = e => { const b = (e.target as HTMLElement).closest('button'); if (b) conn.send({ type: 'fire', cmd: 'scene', gift: b.dataset.big }); };
$('simScenes').onclick = e => { const b = (e.target as HTMLElement).closest('button'); if (b) conn.send({ type: 'fire', cmd: 'scene', index: Number(b.dataset.scene) }); };
// ───────── xem trước màn live ở cột phải ─────────
const liveFrame = $<HTMLIFrameElement>('liveFrame'), prev = $<HTMLInputElement>('prev');
function setPreview() {
  const on = prev.checked;
  $('off').style.display = on ? 'none' : 'flex';
  const ws = new URLSearchParams(location.search).get('ws');
  liveFrame.src = on ? `${location.origin}/${ws ? `?ws=${ws}` : ''}` : 'about:blank';
}
prev.onchange = setPreview; setPreview();

render(); renderSim();
void online;
