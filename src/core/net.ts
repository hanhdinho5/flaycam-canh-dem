import { WS_PORT } from '../../shared/giftmap';

export const serverPort = Number(new URLSearchParams(location.search).get('ws')) || WS_PORT;

export interface Conn { send: (o: unknown, queueIfOffline?: boolean) => void }

/** Kết nối WebSocket tới server (tự nối lại). role: 'game' | 'control' */
export function connectServer(role: 'game' | 'control' | 'preview', onMsg: (m: any) => void, onStatus: (ok: boolean) => void): Conn {
  let ws: WebSocket | null = null;
  const queue: string[] = [];
  const open = () => {
    try { ws = new WebSocket(`ws://${location.hostname || 'localhost'}:${serverPort}`); } catch { setTimeout(open, 3000); return; }
    ws.onopen = () => { ws!.send(JSON.stringify({ type: 'hello', role })); onStatus(true); queue.splice(0).forEach(q => ws!.send(q)); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { /* bỏ qua */ } };
    ws.onclose = () => { onStatus(false); setTimeout(open, 2500); };
    ws.onerror = () => ws?.close();
  };
  open();
  return { send: (o, queueIfOffline = true) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
    else if (queueIfOffline && queue.length < 20) queue.push(JSON.stringify(o));   // giới hạn để không bắn dồn hàng loạt lệnh khi nối lại
  } };
}
