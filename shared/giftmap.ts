// Lệnh flycam + quà 1 xu (lấy từ live-game-cms) — dùng chung cho server, trang live, trang điều khiển.
import gifts1 from './gifts1.json';
import gifts30 from './gifts30.json';

export type Cmd = 'left' | 'right' | 'forward' | 'up' | 'down' | 'turn180' | 'warp' | 'scene';
export const CMDS: Cmd[] = ['left', 'right', 'forward', 'up', 'down', 'turn180', 'warp', 'scene'];

export const ACTIONS: Record<Cmd, { label: string; emoji: string }> = {
  left:    { label: 'Rẽ trái',          emoji: '⬅️' },
  right:   { label: 'Rẽ phải',          emoji: '➡️' },
  forward: { label: 'Tăng tốc',         emoji: '⏩' },
  up:      { label: 'Bay lên cao',      emoji: '⬆️' },
  down:    { label: 'Hạ thấp',          emoji: '⬇️' },
  turn180: { label: 'Quay đầu 180°',    emoji: '🔄' },
  warp:    { label: 'Bay tới vùng mới', emoji: '🚀' },
  scene:   { label: 'Đổi không gian',   emoji: '🌍' },
};

export interface Gift1 { name: string; ids: number[]; imageUrl: string }
export interface GiftBig { name: string; diamonds: number; imageUrl: string }
/** vài quà từ 30 xu (để giả lập đổi không gian) */
export const GIFTS_30: GiftBig[] = gifts30 as GiftBig[];
export const GIFTS_1: Gift1[] = gifts1 as Gift1[];

/** tên quà -> lệnh (khoá theo tên vì một quà có thể có nhiều giftId) */
export type GiftMap = Record<string, Cmd>;
export const DEFAULT_MAP: GiftMap = {
  'Rose': 'left',
  'TikTok': 'right',
  'GG': 'up',
  'Heart Me': 'forward',
  'Ice Cream Cone': 'down',
  'Thumbs Up': 'turn180',
};

export const SCENE_MIN_DIAMONDS = 30; // quà từ 30 xu trở lên (không có trong bảng gán) -> đổi không gian
export const WS_PORT = 8787;

export function findGiftByIdOrName(id?: number, name?: string): Gift1 | undefined {
  return GIFTS_1.find(g => (id !== undefined && g.ids.includes(id)) || (name && g.name === name.trim()));
}

// giao thức WebSocket
export interface ServerState {
  type: 'state';
  map: GiftMap;
  mode: 'idle' | 'tiktok' | 'demo';
  username: string;
  connected: boolean;
  scene: number;
  tracks: string[];
  track: string | null;
}
export interface CommandMsg { type: 'command'; cmd: Cmd; user?: string; gift?: string; count?: number }
export interface CameraFrame {
  type: 'camera';
  scene: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  fov: number;
  ground: number;
  time: number;
}
