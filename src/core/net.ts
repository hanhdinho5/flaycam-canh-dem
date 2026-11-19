import { WS_PORT } from '../../shared/giftmap';

export interface Conn { send: (o: unknown) => void }

/** Kết nối WebSocket tới server (tự nối lại). role: 'game' | 'control' */
export function connectServer(role: 'game' | 'control', onMsg: (m: any) => void, onStatus: (ok: boolean) => void): Conn {
  let ws: WebSocket | null = null;
  const queue: string[] = [];
  const open = () => {
    try { ws = new WebSocket(`ws://${location.hostname || 'localhost'}:${Number(new URLSearchParams(location.search).get('ws')) || WS_PORT}`); } catch { setTimeout(open, 3000); return; }
    ws.onopen = () => { onStatus(true); ws!.send(JSON.stringify({ type: 'hello', role })); queue.splice(0).forEach(q => ws!.send(q)); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { /* bỏ qua */ } };
    ws.onclose = () => { onStatus(false); setTimeout(open, 2500); };
    ws.onerror = () => ws?.close();
  };
  open();
  return { send: o => { const s = JSON.stringify(o); if (ws && ws.readyState === 1) ws.send(s); else queue.push(s); } };
}
